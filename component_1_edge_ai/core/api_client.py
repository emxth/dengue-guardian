import json
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from config import BASE_DIR, MOCK_HARDWARE
from core.schemas import TelemetryRecord
from core.db_manager import fetch_latest_telemetry, fetch_telemetry_history

# Initialize FastAPI application for Component 1 Edge Telemetry
app = FastAPI(
    title="Dengue Guardian - Component 1 Edge AI API",
    description=(
        "Exposes localized mosquito breeding risk assessments, microclimatic "
        "suitability, and YOLO breeding-container counts for the PHI Dashboard "
        "and downstream components."
    ),
    version="1.0.0"
)


def export_shared_contract():
    """
    Exports the Pydantic TelemetryRecord JSON schema into the monorepo's 
    /shared_contracts folder. This ensures Component 2 and 3 developers 
    know exactly what keys to expect without asking.
    """
    shared_dir = BASE_DIR.parent / "shared_contracts"
    shared_dir.mkdir(parents=True, exist_ok=True)
    contract_path = shared_dir / "c1_telemetry_schema.json"

    schema_dict = TelemetryRecord.model_json_schema()
    with open(contract_path, "w", encoding="utf-8") as f:
        json.dump(schema_dict, f, indent=2)

    print(f"[Contract] Exported shared JSON schema to: {contract_path}")


@app.get("/api/v1/health")
def health_check():
    """Returns operational status of the Component 1 Edge AI node."""
    return {
        "component": "Component 1: Edge AI Mosquito Breeding Risk Assessment System",
        "status": "online",
        "hardware_mode": "MOCK_SIMULATION" if MOCK_HARDWARE else "PHYSICAL_RASPBERRY_PI"
    }


@app.get("/api/v1/telemetry/latest")
def get_latest_risk_assessment():
    """Returns the latest localized environmental breeding risk record."""
    record = fetch_latest_telemetry()
    if record is None:
        raise HTTPException(status_code=404, detail="No telemetry records found in edge database.")
    return record


@app.get("/api/v1/telemetry/history")
def get_risk_assessment_history(limit: int = Query(default=20, ge=1, le=100)):
    """Returns historical telemetry and risk assessment records."""
    records = fetch_telemetry_history(limit=limit)
    return {
        "count": len(records),
        "records": records
    }