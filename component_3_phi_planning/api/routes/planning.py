
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
SCHEDULE_DIR = COMPONENT_DIR / "optimization" / "output"


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
        "cases": cases[:limit],
        "complaints": complaints[:limit],
    }


@router.post("/schedule")
def create_schedule(request: ScheduleRequest):
    """Generate a synthetic PHI allocation and appointment schedule."""

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

    except HTTPException:
        raise
    except (ValueError, RuntimeError, sqlite3.Error, OSError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not generate the schedule: {exc}",
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
        "tasks": plan,
        "note": (
            "This is a synthetic research simulation, not a live "
            "operational PHI plan. Task selection, task duration, "
            "and priority rules use provisional assumptions."
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
    plan_path = SCHEDULE_DIR / f"phi_plan_{planning_date}.csv"

    if not plan_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                "Schedule not found for this date. Generate the schedule "
                "first using POST /api/v1/planning/schedule."
            ),
        )

    try:
        with plan_path.open(
            "r", newline="", encoding="utf-8-sig"
        ) as file:
            plan = list(csv.DictReader(file))

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
            "Synthetic rescheduling simulation only. The original "
            "schedule CSV and source database are not modified by "
            "the rescheduling function."
        ),
    }
