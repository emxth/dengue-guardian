
"""Planning endpoints for the C3 PHI Planning API."""

import csv
import math
import sqlite3
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from component_3_phi_planning.api.task_store import (
    NewInspectionTask,
    load_submitted_tasks,
    save_submitted_task,
)
from component_3_phi_planning.prioritization.score_tasks import (
    get_priority_level,
    score_case_risk,
    score_cases,
    score_complaints,
    score_complaint_urgency,
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

    sqlite_task_ids = {
        str(item.get("task_id"))
        for item in cases + complaints
        if item.get("task_id") is not None
    }
    sqlite_task_ids.update(
        str(item.get("complaint_id"))
        for item in complaints
        if item.get("complaint_id") is not None
    )
    submitted_cases = []
    submitted_complaints = []

    for task in load_submitted_tasks():
        if not isinstance(task, dict):
            continue

        task_id = task.get("scenario_task_id") or task.get("task_id")
        source_id = task.get("source_id")
        priority_score = task.get("priority_score")
        priority_level = task.get("priority_level")
        location_id = task.get("location_id")
        planning_date = task.get("planning_date")
        priority_reason = task.get("priority_reason")

        try:
            numeric_score = float(priority_score)
            parsed_date = date.fromisoformat(str(planning_date))
        except (TypeError, ValueError):
            continue

        if (
            not task_id
            or not location_id
            or location_id not in location_map
            or parsed_date.isoformat() != planning_date
            or not priority_reason
            or not math.isfinite(numeric_score)
            or priority_level not in {"High", "Medium", "Low"}
            or str(task_id) in sqlite_task_ids
            or (source_id is not None and str(source_id) in sqlite_task_ids)
        ):
            continue

        location = location_map.get(location_id, {})
        priority_task = {
            **task,
            "task_id": task_id,
            "priority_score": numeric_score,
            "location_name": task.get(
                "location_name", location.get("location_name", "Name unavailable")
            ),
            "location_label": task.get(
                "location_label", location.get("location_label", "Unknown location")
            ),
            "phi_range": task.get(
                "phi_range", location.get("phi_range", "Unknown Range")
            ),
        }

        if task.get("task_type") == "Dengue Case Inspection":
            risk_indicator = task.get("risk_indicator")
            try:
                numeric_risk = float(risk_indicator)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(numeric_risk) or not 0 <= numeric_risk <= 1:
                continue
            expected_score, _ = score_case_risk(numeric_risk)
            if (
                expected_score != numeric_score
                or priority_level != get_priority_level(expected_score)
                or task.get("urgency") is not None
                or task.get("complaint_type") is not None
            ):
                continue
            priority_task["risk_indicator"] = numeric_risk
            priority_task["notification_date"] = planning_date
            submitted_cases.append(priority_task)
        elif task.get("task_type") == "Citizen Complaint":
            if not task.get("urgency") or not task.get("complaint_type"):
                continue
            expected_score, _ = score_complaint_urgency(task["urgency"])
            if (
                expected_score != numeric_score
                or priority_level != get_priority_level(expected_score)
                or task.get("risk_indicator") is not None
            ):
                continue
            priority_task["received_date"] = planning_date
            submitted_complaints.append(priority_task)

    returned_cases = cases[:limit] + submitted_cases
    returned_complaints = complaints[:limit] + submitted_complaints

    return {
        "data_mode": "synthetic_research_data",
        "scoring_policy": "provisional",
        "note": (
            "Results use synthetic research data and provisional rules. "
            "They are not validated operational PHI recommendations."
        ),
        "total_cases": len(cases) + len(submitted_cases),
        "total_complaints": len(complaints) + len(submitted_complaints),
        "returned_cases": len(returned_cases),
        "returned_complaints": len(returned_complaints),
        "locations": location_map,
        "cases": returned_cases,
        "complaints": returned_complaints,
    }


@router.get("/locations")
def get_locations():
    """Return valid synthetic locations for the new-task form."""

    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )

    database_uri = DATABASE_PATH.resolve().as_uri() + "?mode=ro"
    try:
        with sqlite3.connect(database_uri, uri=True) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT
                    locations.location_id,
                    locations.moh_area,
                    locations.phi_range,
                    locations.village_area,
                    locations.village_area AS location_name,
                    locations.location_label,
                    locations.data_status,
                    risk.risk_indicator
                FROM Locations AS locations
                LEFT JOIN (
                    SELECT
                        location_id,
                        AVG(risk_indicator) AS risk_indicator
                    FROM Case_Notifications
                    WHERE risk_indicator IS NOT NULL
                        AND risk_indicator BETWEEN 0 AND 1
                    GROUP BY location_id
                ) AS risk
                    ON risk.location_id = locations.location_id
                ORDER BY
                    locations.phi_range,
                    locations.village_area,
                    locations.location_id
                """
            ).fetchall()
        return {
            "data_mode": "synthetic_research_data",
            "locations": [dict(row) for row in rows],
            "total_locations": len(rows),
        }
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not retrieve locations: {exc}",
        ) from exc


@router.post("/tasks", status_code=201)
def create_inspection_task(request: NewInspectionTask):
    """Validate and save a new synthetic inspection task."""

    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )

    planning_date = request.planning_date.isoformat()
    database_uri = DATABASE_PATH.resolve().as_uri() + "?mode=ro"
    try:
        with sqlite3.connect(database_uri, uri=True) as connection:
            connection.row_factory = sqlite3.Row
            location_row = connection.execute(
                """
                SELECT
                    location_id,
                    moh_area,
                    phi_range,
                    village_area,
                    village_area AS location_name,
                    location_label,
                    data_status,
                    (
                        SELECT AVG(risk_indicator)
                        FROM Case_Notifications
                        WHERE Case_Notifications.location_id = Locations.location_id
                            AND risk_indicator IS NOT NULL
                            AND risk_indicator BETWEEN 0 AND 1
                    ) AS risk_indicator
                FROM Locations
                WHERE location_id = ?
                """,
                (request.location_id,),
            ).fetchone()
            if location_row is None:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Select a valid location from the available "
                        "locations."
                    ),
                )

            availability = connection.execute(
                "SELECT COUNT(*) FROM PHI_Daily WHERE date = ?",
                (planning_date,),
            ).fetchone()[0]
            if availability == 0:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "No PHI availability data exists for this date. "
                        "Choose a supported planning date."
                    ),
                )

        record = save_submitted_task(request, dict(location_row))
        return {
            "message": "Inspection task created successfully.",
            "task": record,
            "note": (
                "Priority scores are provisional and use synthetic "
                "research data."
            ),
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc
    except (sqlite3.Error, OSError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not create the inspection task: {exc}",
        ) from exc


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
        submitted_tasks = [
            task
            for task in load_submitted_tasks()
            if task.get("planning_date") == planning_date
            and task.get("status") == "Pending"
        ]
        tasks.extend(submitted_tasks)
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

        fieldnames = list(
            dict.fromkeys(
                field
                for task in plan
                for field in task
            )
        )

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

    original_by_id = {
        (row.get("scenario_task_id") or row.get("source_id")): row
        for row in plan
    }

    # Annotate updated tasks with previous assignment details and classification
    for row in updated_plan:
        tid = row.get("scenario_task_id") or row.get("source_id")
        orig = original_by_id.get(tid, {})
        row["previous_assigned_phi"] = orig.get("assigned_phi", "")
        row["previous_start_time"] = orig.get("start_time", "")
        row["previous_end_time"] = orig.get("end_time", "")
        row["previous_planning_date"] = orig.get("planning_date", planning_date)
        row["previous_status"] = orig.get("status", "")

        prev_phi = row["previous_assigned_phi"]
        curr_phi = row.get("assigned_phi", "")
        curr_status = row.get("status", "")
        task_status = row.get("task_status", "")
        reason = (row.get("reason") or "").lower()
        curr_date = row.get("planning_date", planning_date)
        prev_date = row["previous_planning_date"]

        if (
            curr_status == "Pending rescheduling"
            or (curr_date and prev_date and curr_date > prev_date)
            or "deferred" in reason
            or "replanned" in reason
        ):
            classification = "Deferred"
        elif curr_status == "Unscheduled":
            classification = "Unscheduled"
        elif (task_status in ("Completed", "In Progress")) and prev_phi == request.unavailable_phi:
            classification = "Unchanged"
        elif curr_status == "Scheduled" and (curr_phi != prev_phi or "reassigned" in reason):
            classification = "Reassigned"
        else:
            classification = "Unchanged"

        row["reassignment_classification"] = classification

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

    affected_count = sum(
        1 for row in plan
        if row.get("assigned_phi") == request.unavailable_phi
        and row.get("status") == "Scheduled"
    )
    reassigned_count = sum(
        1 for row in updated_plan
        if row.get("reassignment_classification") == "Reassigned"
    )
    deferred_count = sum(
        1 for row in updated_plan
        if row.get("reassignment_classification") == "Deferred"
    )
    remaining_unscheduled_count = sum(
        1 for row in updated_plan
        if row.get("reassignment_classification") == "Unscheduled"
    )
    unchanged_count = sum(
        1 for row in updated_plan
        if row.get("reassignment_classification") == "Unchanged"
    )
    protected_count = sum(
        1 for row in updated_plan
        if (row.get("task_status") in ("Completed", "In Progress"))
        and row.get("previous_assigned_phi") == request.unavailable_phi
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
        "affected_tasks": affected_count,
        "reassigned_tasks": reassigned_count,
        "deferred_tasks": deferred_count,
        "remaining_unscheduled_tasks": remaining_unscheduled_count,
        "unchanged_tasks": unchanged_count,
        "protected_tasks": protected_count,
        "original_tasks": plan,
        "tasks": updated_plan,
        "note": (
            "Synthetic rescheduling simulation only. The API-generated "
            "schedule CSV and source database are not modified by the "
            "rescheduling function. The rescheduled result is returned "
            "in the response and is not saved over the original schedule."
        ),
    }
