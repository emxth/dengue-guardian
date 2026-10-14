
"""Planning endpoints for the C3 PHI Planning API."""

import csv
import sqlite3
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from component_3_phi_planning.prioritization.score_tasks import (
    score_cases,
    score_complaints,
)
from component_3_phi_planning.optimization.phi_scheduler import (
    load_phis,
    load_tasks,
    solve_schedule,
)
from component_3_phi_planning.rescheduling.phi_rescheduler import (
    read_phi_daily,
    reschedule_tasks,
)


router = APIRouter(prefix="/api/v1/planning", tags=["Planning"])

COMPONENT_DIR = Path(__file__).resolve().parents[2]
DATABASE_PATH = (
    COMPONENT_DIR
    / "data"
    / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"
)

# Keep API-generated schedules separate from CLI-generated schedules.
API_OUTPUT_DIR = COMPONENT_DIR / "api" / "output"


class ScheduleRequest(BaseModel):
    """Input parameters for a synthetic PHI planning run."""

    planning_date: date = Field(
        default=date(2026, 4, 1),
        description="Planning date in the synthetic dataset.",
    )


class RescheduleRequest(BaseModel):
    """Input parameters for a simulated PHI unavailability event."""

    planning_date: date = Field(
        default=date(2026, 4, 1),
        description="Date of the synthetic PHI schedule.",
    )
    unavailable_phi: str = Field(
        min_length=1,
        description="PHI identifier who becomes unavailable.",
    )
    assume_all_pending: bool = Field(
        default=False,
        description=(
            "For synthetic simulation only, explicitly assume all "
            "tasks are pending when the schedule lacks execution statuses."
        ),
    )


@router.get("/priorities")
def get_priorities(
    limit: int = Query(default=100, ge=1, le=1000),
):
    """Return provisional case and complaint priority scores."""

    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )

    calculated_at = datetime.now().astimezone().isoformat(
        timespec="seconds"
    )
    database_uri = DATABASE_PATH.resolve().as_uri() + "?mode=ro"

    try:
        with sqlite3.connect(database_uri, uri=True) as connection:
            cases = score_cases(connection, calculated_at)
            complaints = score_complaints(connection, calculated_at)

            # Query authoritative synthetic locations lookup
            cursor = connection.cursor()
            cursor.execute(
                "SELECT location_id, village_area, location_label, phi_range "
                "FROM Locations"
            )
            location_map = {
                row[0]: {
                    "location_id": row[0],
                    "location_name": row[1] if row[1] else "Name unavailable",
                    "location_label": row[2] if row[2] else "Synthetic Point",
                    "phi_range": row[3] if row[3] else "Unknown Range",
                }
                for row in cursor.fetchall()
            }

            for item in cases:
                loc = location_map.get(item.get("location_id"))
                if loc:
                    item["location_name"] = loc["location_name"]
                    item["location_label"] = loc["location_label"]
                    item["phi_range"] = loc["phi_range"]
                else:
                    item["location_name"] = "Name unavailable"
                    item["location_label"] = "Unknown location"
                    item["phi_range"] = "Unknown Range"

            for item in complaints:
                loc = location_map.get(item.get("location_id"))
                if loc:
                    item["location_name"] = loc["location_name"]
                    item["location_label"] = loc["location_label"]
                    item["phi_range"] = loc["phi_range"]
                else:
                    item["location_name"] = "Name unavailable"
                    item["location_label"] = "Unknown location"
                    item["phi_range"] = "Unknown Range"

    except (sqlite3.Error, ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not calculate priority scores: {exc}",
        ) from exc

    return {
        "data_mode": "synthetic_research_data",
        "scoring_policy": "provisional",
        "note": (
            "Results use synthetic research data and provisional rules. "
            "They are not validated operational PHI recommendations."
        ),
        "total_cases": len(cases),
        "total_complaints": len(complaints),
        "returned_cases": min(limit, len(cases)),
        "returned_complaints": min(limit, len(complaints)),
        "locations": location_map,
        "cases": cases[:limit],
        "complaints": complaints[:limit],
    }


@router.post("/schedule")
def create_schedule(request: ScheduleRequest):
    """Generate and save a synthetic PHI schedule for API rescheduling."""

    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )

    planning_date = request.planning_date.isoformat()

    try:
        tasks = load_tasks()
        phis = load_phis(planning_date)

        if not tasks:
            raise HTTPException(
                status_code=422,
                detail="No eligible tasks were found for the planning scenario.",
            )

        plan, solver_status = solve_schedule(
            tasks,
            phis,
            planning_date,
        )

        if not plan:
            raise HTTPException(
                status_code=422,
                detail="The scheduler returned an empty plan.",
            )

        # Save the exact plan returned by the API scheduler.
        # This does not overwrite the existing CLI schedule CSV.
        API_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        plan_path = API_OUTPUT_DIR / f"phi_plan_{planning_date}.csv"

        fieldnames = list(plan[0].keys())

        with plan_path.open(
            "w",
            newline="",
            encoding="utf-8",
        ) as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(plan)

    except HTTPException:
        raise
    except (ValueError, RuntimeError, sqlite3.Error, OSError, csv.Error) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not generate and save the schedule: {exc}",
        ) from exc

    scheduled_count = sum(
        row.get("status") == "Scheduled" for row in plan
    )

    return {
        "data_mode": "synthetic_research_data",
        "planning_policy": "provisional_research_prototype",
        "planning_date": planning_date,
        "solver_status": solver_status,
        "total_tasks": len(plan),
        "scheduled_tasks": scheduled_count,
        "unscheduled_tasks": len(plan) - scheduled_count,
        "schedule_saved": True,
        "tasks": plan,
        "note": (
            "This is a synthetic research simulation, not a live "
            "operational PHI plan. Task selection, task duration, "
            "and priority rules use provisional assumptions. "
            "The API schedule is saved separately from CLI outputs."
        ),
    }


@router.post("/reschedule")
def reschedule_plan(request: RescheduleRequest):
    """Simulate rescheduling when a PHI becomes unavailable."""

    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )

    planning_date = request.planning_date.isoformat()
    plan_path = API_OUTPUT_DIR / f"phi_plan_{planning_date}.csv"

    if not plan_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                "API-generated schedule not found for this date. "
                "Generate it first using POST /api/v1/planning/schedule."
            ),
        )

    try:
        with plan_path.open(
            "r",
            newline="",
            encoding="utf-8-sig",
        ) as file:
            plan = list(csv.DictReader(file))

        if not plan:
            raise HTTPException(
                status_code=422,
                detail="The saved API schedule contains no tasks.",
            )

        phi_daily = read_phi_daily(planning_date)

        if request.unavailable_phi not in phi_daily:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Unknown PHI '{request.unavailable_phi}' "
                    f"for planning date {planning_date}."
                ),
            )

        updated_plan = reschedule_tasks(
            plan,
            phi_daily,
            request.unavailable_phi,
            assume_all_pending=request.assume_all_pending,
        )

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc
    except (sqlite3.Error, OSError, csv.Error) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not reschedule the plan: {exc}",
        ) from exc

    scheduled_count = sum(
        row.get("status") == "Scheduled"
        for row in updated_plan
    )
    unscheduled_count = sum(
        row.get("status") == "Unscheduled"
        for row in updated_plan
    )
    pending_rescheduling_count = sum(
        row.get("status") == "Pending rescheduling"
        for row in updated_plan
    )

    return {
        "data_mode": "synthetic_research_data",
        "planning_date": planning_date,
        "unavailable_phi": request.unavailable_phi,
        "assume_all_pending": request.assume_all_pending,
        "total_tasks": len(updated_plan),
        "scheduled_tasks": scheduled_count,
        "unscheduled_tasks": unscheduled_count,
        "pending_rescheduling_tasks": pending_rescheduling_count,
        "tasks": updated_plan,
        "note": (
            "Synthetic rescheduling simulation only. The API-generated "
            "schedule CSV and source database are not modified by the "
            "rescheduling function. The rescheduled result is returned "
            "in the response and is not saved over the original schedule."
        ),
    }
def test_reschedule_uses_api_generated_schedule(
    tmp_path,
    monkeypatch,
):
    """Rescheduling must use the schedule generated by the API."""

    # Isolate API output from existing CLI-generated CSV files.
    monkeypatch.setattr(
        planning_routes,
        "API_SCHEDULE_DIR",
        tmp_path,
    )

    planning_date = "2026-04-01"
    api_schedule_path = tmp_path / f"phi_plan_{planning_date}.csv"

    # Confirm there is no API-generated schedule before this test.
    assert not api_schedule_path.exists()

    # Generate and save a schedule using the API.
    schedule_response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": planning_date},
    )

    assert schedule_response.status_code == 200
    assert schedule_response.json()["schedule_saved"] is True
    assert api_schedule_path.is_file()

    # Reschedule the exact schedule created by the API.
    reschedule_response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": planning_date,
            "unavailable_phi": "PHI02",
            "assume_all_pending": True,
        },
    )

    assert reschedule_response.status_code == 200

    body = reschedule_response.json()
    assert body["unavailable_phi"] == "PHI02"
    assert body["total_tasks"] > 0

    # No scheduled task should remain assigned to the unavailable PHI.
    assert all(
        task.get("assigned_phi") != "PHI02"
        for task in body["tasks"]
        if task.get("status") == "Scheduled"
    )