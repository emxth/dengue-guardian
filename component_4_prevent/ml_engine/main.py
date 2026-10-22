"""
Dengue Guardian – Prevention Intelligence ML Service (FastAPI)
Author: Component 4 
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from recommendation_engine import RecommendationEngine
from continual_learning import init_db, save_new_intervention, get_row_count
import sqlite3
import os
import pandas as pd
import xgboost as xgb
import joblib
import re

# ─── App bootstrap ────────────────────────────────────────────────────────────

app = FastAPI(title="Dengue Guardian - Prevention Intelligence ML Service")

# NOTE: allow_credentials=True is invalid when allow_origins=["*"].
# For PP1 local dev we keep origins open; restrict before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = None

# Paths (relative to this file's directory)
_HERE = os.path.dirname(os.path.abspath(__file__))
_MODEL_PATH    = os.path.join(_HERE, "saved_models", "xgboost_dengue_model.json")
_FEATURES_PATH = os.path.join(_HERE, "saved_models", "model_features.pkl")
_BENCHMARK_CSV = os.path.join(_HERE, "../data/benchmark/phi_intervention_benchmark.csv")
_DB_PATH       = os.path.join(_HERE, "interventions.db")

# ─── Startup ──────────────────────────────────────────────────────────────────

# Initialise the unified database table on first boot.
init_db()


@app.on_event("startup")
def load_engine():
    """Load the production XGBoost model into the RecommendationEngine."""
    global engine
    try:
        engine = RecommendationEngine()
        print("[Startup] XGBoost RecommendationEngine loaded successfully.")
    except Exception as e:
        print(f"[Startup] Warning – model not found ({e}). "
              "POST /retrain-model to generate one.")
        engine = None


# ─── Pydantic models ──────────────────────────────────────────────────────────

class ContextRequest(BaseModel):
    """
    Environmental context for the /recommend endpoint.
    cumulative_rainfall_14_days and wind_speed have sensible defaults so that
    callers that omit them (e.g. older client versions) do NOT get HTTP 422.
    """
    temperature:                  float = Field(...,  ge=15.0, le=45.0,  description="Ambient temperature (°C)")
    rainfall:                     float = Field(...,  ge=0.0,             description="7-day rainfall (mm)")
    cumulative_rainfall_14_days:  float = Field(100.0, ge=0.0,           description="14-day cumulative rainfall (mm)")
    wind_speed:                   float = Field(10.0,  ge=0.0, le=60.0,  description="Wind speed (km/h)")
    mosquito_density:             float = Field(...,  ge=0.0,             description="Adult mosquito density index")
    breeding_sites_count:         int   = Field(...,  ge=0,               description="Number of active breeding sites")


class InterventionRecord(BaseModel):
    """
    PHI field outcome submitted to /record-intervention.
    Stored in intervention_outcomes for continual model retraining.
    """
    temperature:                  float = Field(...,  ge=15.0, le=45.0)
    rainfall:                     float = Field(...,  ge=0.0)
    cumulative_rainfall_14_days:  float = Field(100.0, ge=0.0)
    mosquito_density:             float = Field(...,  ge=0.0)
    breeding_sites_count:         int   = Field(...,  ge=0)
    wind_speed:                   float = Field(10.0,  ge=0.0, le=60.0)
    intervention_taken:           str   = Field(...,  min_length=3, max_length=200)
    # Score MUST be on the 0-100 percentage scale to match the training dataset.
    effectiveness_score:          float = Field(...,  ge=0.0, le=100.0)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    """Liveness probe."""
    model_ready = engine is not None
    return {
        "status": "ok",
        "service": "ML Recommendation Engine (XGBoost)",
        "model_loaded": model_ready,
        "field_records_in_db": get_row_count(),
    }


@app.post("/recommend")
def recommend_intervention(context: ContextRequest):
    """
    Return ranked intervention strategies for the given environmental context.
    Predicted effectiveness values are guaranteed to be on the 0–100 scale.
    """
    if engine is None:
        raise HTTPException(
            status_code=503,
            detail="ML model is not loaded. POST /retrain-model first."
        )
    try:
        context_dict = context.dict()
        result = engine.get_recommendation(context_dict)

        # Guard: if model still returns 0-1 decimal scores, normalise to %.
        def _normalise_scores(data):
            if isinstance(data, dict):
                for k, v in data.items():
                    if ("effect" in k.lower() or "score" in k.lower()) and isinstance(v, (float, int)):
                        if v <= 1.0:
                            data[k] = round(float(v) * 100, 2)
                    elif k.lower() == "rationale" and isinstance(v, str):
                        def _fix(m):
                            return f"{float(m.group(1)) * 100:g}%"
                        data[k] = re.sub(r"(0\.\d+)%", _fix, v)
                    else:
                        _normalise_scores(v)
            elif isinstance(data, list):
                for item in data:
                    _normalise_scores(item)
            return data

        _normalise_scores(result)
        return {"success": True, "data": result}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/record-intervention")
async def record_intervention(record: InterventionRecord):
    """
    Store a validated PHI field outcome into intervention_outcomes.
    This feeds the /retrain-model continual learning pipeline.
    All DB writes go through continual_learning.save_new_intervention()
    (parameterised SQL – injection safe).
    """
    try:
        save_new_intervention(record)
        total = get_row_count()
        return {
            "status": "success",
            "message": "Intervention recorded successfully for continual learning.",
            "total_field_records": total,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB write failed: {str(e)}")


@app.post("/retrain-model")
async def retrain_xgboost_model():
    """
    Continual Learning Trigger:
    1. Load the historical benchmark CSV (baseline knowledge).
    2. Load all field-recorded outcomes from intervention_outcomes.
    3. MERGE both datasets – this prevents catastrophic forgetting.
    4. One-hot encode intervention_taken text.
    5. Retrain the XGBoost model on the combined dataset.
    6. Save updated model to disk and reload the RecommendationEngine.
    """
    global engine

    try:
        # ── Step 1: Load historical benchmark (baseline knowledge) ──────────
        if os.path.exists(_BENCHMARK_CSV):
            df_benchmark = pd.read_csv(_BENCHMARK_CSV)
            # Benchmark already has tier_1_macro / tier_2_micro columns; combine them.
            df_benchmark["intervention_taken"] = (
                df_benchmark["tier_1_macro"] + " - " + df_benchmark["tier_2_micro"]
            )
            df_benchmark = df_benchmark.drop(columns=["tier_1_macro", "tier_2_micro"])
        else:
            df_benchmark = pd.DataFrame()

        # ── Step 2: Load field outcomes from the unified DB table ────────────
        conn = sqlite3.connect(_DB_PATH)
        try:
            df_field = pd.read_sql_query(
                "SELECT temperature, rainfall, cumulative_rainfall_14_days, "
                "mosquito_density, breeding_sites_count, wind_speed, "
                "intervention_taken, effectiveness_score "
                "FROM intervention_outcomes",
                conn,
            )
        finally:
            conn.close()

        # ── Step 3: Merge – baseline knowledge + new field evidence ──────────
        df = pd.concat([df_benchmark, df_field], ignore_index=True)

        if len(df) < 10:
            return {
                "status": "skipped",
                "message": "Not enough combined data to retrain yet.",
                "benchmark_records": len(df_benchmark),
                "field_records": len(df_field),
            }

        # ── Step 4: One-hot encode the intervention_taken text column ────────
        df["tier_1_macro_Adulticiding (Fogging)"] = df["intervention_taken"].apply(
            lambda x: 1 if isinstance(x, str) and "Adulticiding" in x else 0
        )
        df["tier_1_macro_Larviciding"] = df["intervention_taken"].apply(
            lambda x: 1 if isinstance(x, str) and "Larviciding" in x else 0
        )
        df["tier_1_macro_Source Reduction"] = df["intervention_taken"].apply(
            lambda x: 1 if isinstance(x, str) and "Source Reduction" in x else 0
        )
        df["tier_2_micro_Deltamethrin"] = df["intervention_taken"].apply(
            lambda x: 1 if isinstance(x, str) and "Deltamethrin" in x else 0
        )
        df["tier_2_micro_Malathion"] = df["intervention_taken"].apply(
            lambda x: 1 if isinstance(x, str) and "Malathion" in x else 0
        )
        df["tier_2_micro_Temephos (Abate)"] = df["intervention_taken"].apply(
            lambda x: 1 if isinstance(x, str) and "Temephos" in x else 0
        )
        # tier_2_micro_None column: no chemical (Source Reduction)
        df["tier_2_micro_None"] = df["intervention_taken"].apply(
            lambda x: 1 if isinstance(x, str) and x.endswith("- None") else 0
        )

        # ── Step 5: Align to exact 12-feature schema the model expects ───────
        feature_columns = joblib.load(_FEATURES_PATH)
        for col in feature_columns:
            if col not in df.columns:
                df[col] = 0

        X = df[feature_columns]
        y = df["effectiveness_score"]

        # ── Step 6: Retrain on merged dataset ────────────────────────────────
        xgb_model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=42)
        try:
            xgb_model.load_model(_MODEL_PATH)   # warm-start from existing weights
        except Exception:
            print("[Retrain] No prior model – training from scratch.")

        xgb_model.fit(X, y)
        xgb_model.save_model(_MODEL_PATH)

        # Reload the in-memory engine with the updated model
        engine = RecommendationEngine()

        return {
            "status": "success",
            "message": "Continual Learning complete – model updated with merged dataset.",
            "benchmark_records": len(df_benchmark),
            "field_records": len(df_field),
            "total_training_records": len(df),
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Retraining failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)