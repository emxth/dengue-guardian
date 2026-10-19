
"""Separate storage for user-submitted C3 inspection tasks.

This store is for synthetic research demonstrations. It does not modify
the original SQLite research database.
"""

import json
from datetime import date, datetime
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from component_3_phi_planning.prioritization.score_tasks import (
    get_priority_level,
    score_case_risk,
    score_complaint_urgency,
)


COMPONENT_DIR = Path(__file__).resolve().parents[1]
TASK_STORE_PATH = COMPONENT_DIR / "api" / "output" / "submitted_tasks.json"

TASK_TYPES = {
    "Dengue Case Inspection",
    "Citizen Complaint",
}


class NewInspectionTask(BaseModel):
    """Validated form input for a new inspection task."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    task_type: str
    location_id: str = Field(min_length=1, max_length=50)
    planning_date: date
    urgency: str | None = None
    complaint_type: str | None = Field(default=None, max_length=100)

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, value):
        if value not in TASK_TYPES:
            raise ValueError("Select a supported inspection task type.")
        return value

    @field_validator("urgency")
    @classmethod
    def validate_urgency(cls, value):
        if value is not None and value.lower() not in {
            "high", "medium", "low"
        }:
            raise ValueError("Urgency must be High, Medium, or Low.")
        return value.title() if value else value

    @field_validator("complaint_type")
    @classmethod
    def validate_complaint_type(cls, value):
        return value.strip() if value else value


def load_submitted_tasks():
    """Read separately submitted tasks without changing the source database."""
    if not TASK_STORE_PATH.exists():
        return []

    try:
        with TASK_STORE_PATH.open("r", encoding="utf-8") as file:
            tasks = json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(
            f"Could not read submitted task storage: {exc}"
        ) from exc

    if not isinstance(tasks, list):
        raise ValueError("Submitted task storage must contain a JSON list.")

    return tasks


def save_submitted_task(
    task: NewInspectionTask,
    location: dict,
):
    """Calculate provisional priority and persist one new task."""
    if task.task_type == "Dengue Case Inspection":
        risk_indicator = location.get("risk_indicator")
        if risk_indicator is None:
            raise ValueError(
                "No valid synthetic risk data exists for this location."
            )
        if task.urgency is not None or task.complaint_type is not None:
            raise ValueError(
                "Complaint fields cannot be used for a case inspection."
            )

        score, reason = score_case_risk(risk_indicator)

    else:
        if task.urgency is None:
            raise ValueError("Urgency is required for a citizen complaint.")
        if not task.complaint_type:
            raise ValueError("Complaint type is required.")

        score, reason = score_complaint_urgency(task.urgency)

    if score is None:
        raise ValueError(reason)

    task_id = f"USR-{uuid4().hex[:12].upper()}"

    record = {
        "scenario_task_id": task_id,
        "source_id": task_id,
        "task_type": task.task_type,
        "priority_score": float(score),
        "priority_level": get_priority_level(score),
        "priority_reason": reason,
        "location_id": task.location_id,
        "risk_indicator": (
            risk_indicator
            if task.task_type == "Dengue Case Inspection"
            else None
        ),
        "urgency": task.urgency,
        "complaint_type": task.complaint_type,
        "location_name": location.get("location_name", "Unknown Area"),
        "phi_range": location.get("phi_range", "Unknown Range"),
        "village_area": location.get("village_area", "Unknown Area"),
        "location_label": location.get("location_label", "Synthetic Point"),
        "planning_date": task.planning_date.isoformat(),
        "submitted_at": datetime.now().astimezone().isoformat(
            timespec="seconds"
        ),
        "record_source": "user_submitted_synthetic_demo",
        "status": "Pending",
    }

    TASK_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)

    records = load_submitted_tasks()
    records.append(record)

    temporary_path = TASK_STORE_PATH.with_suffix(".tmp")
    try:
        with temporary_path.open("w", encoding="utf-8") as file:
            json.dump(records, file, indent=2)
        temporary_path.replace(TASK_STORE_PATH)
    except OSError:
        if temporary_path.exists():
            temporary_path.unlink()
        raise

    return record
