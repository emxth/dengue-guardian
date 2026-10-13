from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from recommendation_engine import RecommendationEngine
from continual_learning import init_db, save_new_intervention
import sqlite3
import pandas as pd
import xgboost as xgb


app = FastAPI(title="Dengue Guardian - Prevention Intelligence ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
engine = None

# Initialize the database when the server starts
init_db()


@app.on_event("startup")
def startup_event():
    conn = sqlite3.connect("interventions.db")
    cursor = conn.cursor()
    # Create the interventions table if it doesn't exist
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS interventions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            temperature REAL,
            rainfall REAL,
            cumulative_rainfall_14_days REAL,
            mosquito_density REAL,
            breeding_sites_count INTEGER,
            wind_speed REAL,
            intervention_taken TEXT,
            effectiveness_score REAL
        )
    """)
    conn.commit()
    conn.close()

@app.on_event("startup")
def load_engine():
    global engine
    try:
        engine = RecommendationEngine()
        print("Model loaded successfully.")
    except Exception as e:
        print("Warning: Model not found. Please run /retrain-model to create a new one.")
        engine = None

class ContextRequest(BaseModel):
    temperature: float
    rainfall: float
    cumulative_rainfall_14_days: float
    wind_speed: float
    mosquito_density: float
    breeding_sites_count: int


# Data model for the incoming intervention outcome
class InterventionRecord(BaseModel):
    temperature: float
    rainfall: float
    cumulative_rainfall_14_days: float
    mosquito_density: float
    breeding_sites_count: int
    wind_speed: float
    intervention_taken: str
    effectiveness_score: float

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ML Recommendation Engine (XGBoost Active)"}

@app.post("/recommend")
def recommend_intervention(context: ContextRequest):
    try:
        context_dict = context.dict()
        result = engine.get_recommendation(context_dict)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/record-intervention")
async def record_intervention(record: InterventionRecord):
    try:
        conn = sqlite3.connect("interventions.db")
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO interventions (
                temperature, rainfall, cumulative_rainfall_14_days, 
                mosquito_density, breeding_sites_count, wind_speed, 
                intervention_taken, effectiveness_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            record.temperature, record.rainfall, record.cumulative_rainfall_14_days,
            record.mosquito_density, record.breeding_sites_count, record.wind_speed,
            record.intervention_taken, record.effectiveness_score
        ))
        
        conn.commit()
        conn.close()
        
        return {
            "status": "success", 
            "message": "Intervention recorded successfully for continual learning."
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Continual Learning Trigger Endpoint
@app.post("/retrain-model")
async def retrain_xgboost_model():
    try:
        conn = sqlite3.connect("interventions.db")
        query = """
            SELECT temperature, rainfall, cumulative_rainfall_14_days, 
                   mosquito_density, breeding_sites_count, wind_speed, 
                   effectiveness_score 
            FROM interventions
        """
        df = pd.read_sql_query(query, conn)
        conn.close()

        if len(df) < 3:
            return {
                "message": "Not enough data to retrain yet. Submit more records!", 
                "current_records": len(df)
            }

        X = df[['temperature', 'rainfall', 'cumulative_rainfall_14_days', 
                'mosquito_density', 'breeding_sites_count', 'wind_speed']]
        y = df['effectiveness_score']

        model_path = "saved_models/xgboost_dengue_model.json"
        xgb_model = xgb.XGBRegressor()
        
        try:
            xgb_model.load_model(model_path)
        except Exception:
            print("No existing model found. Training from scratch.")

        xgb_model.fit(X, y)
        xgb_model.save_model(model_path)

        return {
            "status": "success", 
            "message": "Continual Learning Complete: XGBoost model successfully updated!",
            "total_training_records": len(df)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retraining failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)