import os
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# --- 1. Path & AI Model Setup ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
import sys

# Append 'src' so Python can find both 'engine' and 'api' folders
sys.path.append(os.path.join(BASE_DIR, "src"))

from engine.stgnn_model import AdaptiveSTGNN
from api.tasks import process_edge_telemetry

# Load Data and Edge Index (For prototype purposes, we read the CSVs to get the graph structure)
DATA_DIR = os.path.join(BASE_DIR, "data")
adj_df = pd.read_csv(os.path.join(DATA_DIR, "adjacency_matrix.csv"), index_col=0)
wards = list(adj_df.columns)
source_nodes, target_nodes = np.where(adj_df.values == 1)
edge_index = torch.tensor([source_nodes, target_nodes], dtype=torch.long)

# Load Model Weights
model = AdaptiveSTGNN(num_node_features=4, hidden_size=64)
model_path = os.path.join(BASE_DIR, "saved_models", "stgnn_base.pt")
model.load_state_dict(torch.load(model_path, weights_only=True))
model.eval()

# --- 2. PostgreSQL Database Setup ---
DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    raise ValueError(
        "DATABASE_URL environment variable is missing. Check your .env file."
    )

engine = create_engine(DB_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ForecastLog(Base):
    __tablename__ = "forecast_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    ward_name = Column(String, index=True)
    predicted_cases_14d = Column(Float)


Base.metadata.create_all(bind=engine)

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

    # PROTOTYPE: Generate a dummy 8-week tensor for the requested ward to simulate live Component 1 data
    X_live = torch.rand(8, len(wards), 4)

    with torch.no_grad():
        # Predict 14-Day Horizon (index 1)
        pred = model(X_live, edge_index)[ward_id, 1].item()

    # Persist to PostgreSQL
    db = SessionLocal()
    log = ForecastLog(ward_name=wards[ward_id], predicted_cases_14d=pred)
    db.add(log)
    db.commit()
    db.close()

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
