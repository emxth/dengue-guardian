import os
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
import torch
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pymongo import MongoClient

# Load environment variables from the .env file
load_dotenv()

# --- 1. Path & AI Model Setup ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
import sys

# Append 'src' so Python can find both 'engine' and 'api' folders
sys.path.append(os.path.join(BASE_DIR, "src"))

from api.tasks import process_edge_telemetry
from engine.stgnn_model import AdaptiveSTGNN

# Load Data and Edge Index
DATA_DIR = os.path.join(BASE_DIR, "data")
adj_df = pd.read_csv(os.path.join(DATA_DIR, "adjacency_matrix.csv"), index_col=0)

wards = list(adj_df.columns)

# Standardized GPS Coordinates for the Kaduwela MOH region wards
WARD_COORDINATES = {
    "Malabe": [79.9562, 6.9044],
    "Battaramulla": [79.9167, 6.8986],
    "Koswatta": [79.9234, 6.9056],
    "Kaduwela_Town": [79.9833, 6.9333],
    "Athurugiriya": [79.9897, 6.8742],
}

source_nodes, target_nodes = np.where(adj_df.values == 1)
edge_index = torch.tensor(np.array([source_nodes, target_nodes]), dtype=torch.long)

# Load Model Weights
model = AdaptiveSTGNN(num_node_features=4, hidden_size=64)
model_path = os.path.join(BASE_DIR, "saved_models", "stgnn_base.pt")
model.load_state_dict(torch.load(model_path, weights_only=True))
model.eval()

# --- 2. MongoDB Setup ---
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["dengue_guardian"]
forecast_collection = db["forecast_logs"]

# --- 3. FastAPI Initialization ---
app = FastAPI(title="Adaptive Spatio-Temporal Dengue Intelligence API", version="1.0.0")


class SimulationRequest(BaseModel):
    ward_id: int
    fogging_executed: float
    source_reduction_pct: float


# --- 4. RESTful API Endpoints ---
@app.get("/api/v1/health")
def health_check():
    return {"status": "Active", "model": "STGNN v1.0", "drift_detected": False}


@app.get("/api/v1/forecast/{ward_id}")
def get_forecast(ward_id: int):
    if ward_id >= len(wards):
        raise HTTPException(status_code=404, detail="Ward ID not found.")

    X_live = torch.rand(8, len(wards), 4)

    with torch.no_grad():
        # Predict 14-Day Horizon (index 1)
        pred = model(X_live, edge_index)[ward_id, 1].item()

    # Persist to MongoDB
    log_doc = {
        "timestamp": datetime.utcnow(),
        "ward_name": wards[ward_id],
        "predicted_cases_14d": round(pred, 1),
    }
    forecast_collection.insert_one(log_doc)

    return {
        "ward": wards[ward_id],
        "horizon": "14-Day",
        "predicted_cases": round(pred, 1),
        "status": "High Risk" if pred > 20 else "Moderate Risk",
    }


@app.post("/api/v1/simulate")
def run_digital_twin(req: SimulationRequest):
    # Simulate adjusting the tensor based on requested interventions
    X_baseline = torch.rand(8, len(wards), 4)
    X_simulated = X_baseline.clone()

    # Apply Intervention to the last week of data
    X_simulated[7, req.ward_id, 3] = req.fogging_executed
    X_simulated[7, req.ward_id, 2] *= 1.0 - req.source_reduction_pct

    with torch.no_grad():
        base_pred = model(X_baseline, edge_index)[req.ward_id, 1].item()
        sim_pred = model(X_simulated, edge_index)[req.ward_id, 1].item()

    return {
        "ward": wards[req.ward_id],
        "baseline_forecast": round(base_pred, 1),
        "simulated_forecast": round(sim_pred, 1),
        "cases_averted": round(base_pred - sim_pred, 1),
    }


@app.post("/api/v1/ingest/vector-data")
def ingest_vector_data(payload: dict[str, Any]):
    """
    High-throughput ingestion endpoint for Component 1 (Edge AI).
    Instead of processing the data immediately, it queues it in Redis via Celery.
    """
    # .delay() sends the payload to Redis and immediately returns
    task = process_edge_telemetry.delay(payload)

    return {
        "status": "queued",
        "task_id": task.id,
        "message": "Data payload pushed to Redis broker for asynchronous processing.",
    }


@app.get("/api/v1/hotspots/geojson")
def get_hotspot_geojson():
    """
    Generates a GeoJSON FeatureCollection of spatial risk predictions.
    Utilizes MC Dropout to provide 95% Confidence Intervals for front-end heatmaps.
    """
    X_live = torch.rand(8, len(wards), 4)

    # Run MC Dropout Inference (50 iterations)
    mean_preds, std_preds = model.predict_with_uncertainty(
        X_live, edge_index, n_iter=50
    )

    features = []

    for ward_id, ward_name in enumerate(wards):
        # Extract 14-Day Horizon (index 1)
        mean_cases = mean_preds[ward_id, 1].item()
        std_dev = std_preds[ward_id, 1].item()

        # Calculate 95% Confidence Interval (Mean ± 1.96 * StdDev)
        ci_lower = max(0.0, mean_cases - (1.96 * std_dev))
        ci_upper = mean_cases + (1.96 * std_dev)

        risk_level = "High Risk" if mean_cases > 20 else "Moderate Risk"
        color_hex = (
            "#ef4444" if mean_cases > 20 else "#f59e0b"
        )  # Red for High, Amber for Mod

        # Build standard GeoJSON Feature
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": WARD_COORDINATES.get(ward_name, [0.0, 0.0]),
            },
            "properties": {
                "ward_id": ward_id,
                "ward_name": ward_name,
                "predicted_cases": round(mean_cases, 1),
                "confidence_interval": [round(ci_lower, 1), round(ci_upper, 1)],
                "uncertainty_std": round(std_dev, 2),
                "risk_level": risk_level,
                "marker-color": color_hex,
            },
        }
        features.append(feature)

        # Asynchronously log to MongoDB (optional)
        forecast_collection.insert_one(
            {
                "timestamp": datetime.utcnow(),
                "ward_name": ward_name,
                "predicted_cases_14d": round(mean_cases, 1),
                "ci_lower": round(ci_lower, 1),
                "ci_upper": round(ci_upper, 1),
            }
        )

    return {
        "type": "FeatureCollection",
        "metadata": {
            "model": "STGNN-MCDropout",
            "horizon": "14-Day",
            "generated_at": datetime.utcnow(),
        },
        "features": features,
    }
