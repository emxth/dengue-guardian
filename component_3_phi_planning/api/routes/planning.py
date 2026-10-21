
"""Planning endpoints for the C3 PHI Planning API."""

import csv
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from component_3_phi_planning.api import task_store
from component_3_phi_planning.config import DEFAULT_PLANNING_DATE
from component_3_phi_planning.api.task_store import (
    NewInspectionTask,
    TASK_STORE_PATH,
    load_submitted_tasks,
    save_submitted_task,
)
from component_3_phi_planning.prioritization.score_tasks import (
    calculate_task_priority,
    get_priority_level,
    score_cases,
    score_complaints,
)
from component_3_phi_planning.prioritization.activity_analytics import (
    calculate_location_activity,
    get_monthly_location_analytics,
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
    / "Kaduwela_C3_Research_Database_CleanPlanning.sqlite"
)

# Keep API-generated schedules separate from CLI-generated schedules.
API_OUTPUT_DIR = COMPONENT_DIR / "api" / "output"
_PRIORITY_SNAPSHOT_CACHE = {}


def _priority_cache_key(selected_date):
    file_signatures = []
    for path in (
        DATABASE_PATH,
        task_store.TASK_STORE_PATH,
        Path(__file__),
        Path(__file__).resolve().parents[2] / "prioritization" / "score_tasks.py",
        Path(__file__).resolve().parents[2] / "prioritization" / "activity_analytics.py",
        Path(__file__).resolve().parents[2] / "config.py",
    ):
        try:
            stat = path.stat()
            file_signatures.append((str(path), stat.st_mtime_ns, stat.st_size))
        except OSError:
            file_signatures.append((str(path), None, None))
    return (selected_date.isoformat(), *file_signatures)


def _make_priority_page(
    cases,
    complaints,
    location_map,
    selected_date,
    date_from,
    date_to,
    limit,
    offset,
    task_type,
    priority_level,
    location_id,
    search,
):
    def in_date_range(task, key):
        try:
            task_day = date.fromisoformat(str(task.get(key))[:10])
        except (TypeError, ValueError):
            return False
        return (date_from is None or task_day >= date_from) and (
            date_to is None or task_day <= date_to
        )

    all_rows = [
        task for task in cases if in_date_range(task, "notification_date")
    ] + [task for task in complaints if in_date_range(task, "received_date")]

    if task_type == "cases":
        all_rows = [task for task in all_rows if task.get("task_type") != "Citizen Complaint"]
    elif task_type == "complaints":
        all_rows = [task for task in all_rows if task.get("task_type") == "Citizen Complaint"]
    if priority_level != "all":
        all_rows = [task for task in all_rows if task.get("priority_level") == priority_level]
    if location_id:
        all_rows = [task for task in all_rows if task.get("location_id") == location_id]
    if search:
        needle = search.casefold().strip()
        all_rows = [
            task for task in all_rows
            if needle in " ".join(str(task.get(key) or "") for key in (
                "task_id", "task_type", "location_id", "location_name",
                "location_label", "complaint_type",
            )).casefold()
        ]

    all_rows.sort(key=lambda task: (
        task.get("priority_score") is None,
        -(task.get("priority_score") or 0),
        task.get("notification_date") or task.get("received_date") or "",
        str(task.get("task_id") or ""),
    ))
    total_matching = len(all_rows)
    summary = {
        "high": sum(task.get("priority_level") == "High" for task in all_rows),
        "medium": sum(task.get("priority_level") == "Medium" for task in all_rows),
        "low": sum(task.get("priority_level") == "Low" for task in all_rows),
        "review": sum(task.get("priority_level") == "Review" for task in all_rows),
        "total": total_matching,
    }
    quality_summary = {
        "scored": sum(task.get("priority_score") is not None for task in all_rows),
        "review": summary["review"],
        "provisional_assumption": sum(
            task.get("data_quality_status") == "provisional_assumption"
            for task in all_rows
        ),
    }
    locations = {}
    for task in all_rows:
        key = task.get("location_id") or "UNKNOWN"
        item = locations.setdefault(key, {
            "location_id": key,
            "location_name": task.get("location_name") or "Name unavailable",
            "location_label": task.get("location_label") or "Unknown location",
            "high": 0,
            "medium": 0,
            "low": 0,
            "review": 0,
            "total": 0,
        })
        item["total"] += 1
        bucket = str(task.get("priority_level") or "Review").casefold()
        item[bucket if bucket in {"high", "medium", "low", "review"} else "review"] += 1
    location_summary = sorted(
        locations.values(),
        key=lambda item: (-item["high"], -item["total"], item["location_name"]),
    )
    page_rows = all_rows[offset:offset + limit]
    page_cases = [task for task in page_rows if task.get("task_type") != "Citizen Complaint"]
    page_complaints = [task for task in page_rows if task.get("task_type") == "Citizen Complaint"]
    start = offset + 1 if total_matching and offset < total_matching else 0
    end = min(offset + limit, total_matching)
    return {
        "data_mode": "synthetic_research_data",
        "scoring_policy": "provisional",
        "planning_date": selected_date.isoformat(),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "total_cases": sum(task.get("task_type") != "Citizen Complaint" for task in all_rows),
        "total_complaints": sum(task.get("task_type") == "Citizen Complaint" for task in all_rows),
        "total_matching": total_matching,
        "offset": offset,
        "limit": limit,
        "page_start": start,
        "page_end": end,
        "has_previous": offset > 0,
        "has_next": offset + limit < total_matching,
        "summary": summary,
        "quality_summary": quality_summary,
        "location_summary": location_summary,
        "locations": location_map,
        "tasks": page_rows,
        "cases": page_cases,
        "complaints": page_complaints,
        "note": "Priority records are scored on the selected planning date using synthetic research data and provisional rules.",
    }


class ScheduleRequest(BaseModel):
    """Input parameters for a synthetic PHI planning run."""

    planning_date: date = Field(
        default=date.fromisoformat(DEFAULT_PLANNING_DATE),
        description="Planning date in the synthetic dataset.",
    )


class RescheduleRequest(BaseModel):
    """Input parameters for a simulated PHI unavailability event."""

    planning_date: date = Field(
        default=date.fromisoformat(DEFAULT_PLANNING_DATE),
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
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    planning_date: date | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    task_type: Literal["all", "cases", "complaints"] = Query(default="all"),
    priority_level: Literal["all", "High", "Medium", "Low", "Review"] = Query(default="all"),
    location_id: str | None = Query(default=None, min_length=1, max_length=50),
    search: str | None = Query(default=None, max_length=100),
):
    """Return provisional case and complaint priority scores."""

    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )

    database_uri = DATABASE_PATH.resolve().as_uri() + "?mode=ro"

    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail="date_from must be on or before date_to.",
        )

    try:
        with sqlite3.connect(database_uri, uri=True) as connection:
            latest_data_date = date.fromisoformat(
                connection.execute(
                    "SELECT MAX(notification_date) FROM Case_Notifications"
                ).fetchone()[0]
            )
            selected_date = planning_date or date_to or latest_data_date
            cache_key = _priority_cache_key(selected_date)
            cached_snapshot = _PRIORITY_SNAPSHOT_CACHE.get(cache_key)
            if cached_snapshot is not None:
                cases, complaints, location_map = cached_snapshot
                return _make_priority_page(
                    cases, complaints, location_map, selected_date, date_from,
                    date_to, limit, offset, task_type, priority_level,
                    location_id, search,
                )
            cases = score_cases(connection, selected_date)
            complaints = score_complaints(connection, selected_date)

            # Query authoritative synthetic locations lookup
            cursor = connection.cursor()
            cursor.execute(
                "SELECT locations.location_id, locations.village_area, "
                "locations.location_label, locations.phi_range, "
                "risk.risk_score, risk.risk_level, risk.score_source "
                "FROM Locations AS locations "
                "LEFT JOIN Component2_Location_Risk AS risk "
                "ON risk.location_id = locations.location_id"
            )
            location_map = {
                row[0]: {
                    "location_id": row[0],
                    "location_name": row[1] if row[1] else "Name unavailable",
                    "location_label": row[2] if row[2] else "Synthetic Point",
                    "phi_range": row[3] if row[3] else "Unknown Range",
                    "component2_risk_score": row[4],
                    "component2_risk_level": row[5],
                    "component2_score_source": row[6],
                }
                for row in cursor.fetchall()
            }
            activity_by_location = {
                location_id: calculate_location_activity(
                    connection, location_id, selected_date
                )
                for location_id in location_map
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
        location_id = task.get("location_id")
        planning_date = task.get("planning_date")

        try:
            parsed_date = date.fromisoformat(str(planning_date))
        except (TypeError, ValueError):
            continue

        if (
            not task_id
            or not location_id
            or location_id not in location_map
            or parsed_date.isoformat() != planning_date
            or str(task_id) in sqlite_task_ids
            or (source_id is not None and str(source_id) in sqlite_task_ids)
        ):
            continue

        location = location_map.get(location_id, {})
        priority_task = {
            **task,
            "task_id": task_id,
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
            if task.get("complaint_type") is not None:
                continue
            if task.get("inspection_required", True) is not True:
                priority_task.update({
                    "priority_score": None,
                    "priority_level": "Review",
                    "priority_reason": "Review: case is not eligible for inspection",
                    "priority_factors": {},
                    "data_quality_status": "review",
                })
                submitted_cases.append(priority_task)
                continue
            priority_task["component2_risk_score"] = location.get(
                "component2_risk_score"
            )
            priority_task["component2_risk_level"] = location.get(
                "component2_risk_level"
            )
            priority_task["component2_score_source"] = location.get(
                "component2_score_source"
            )
            priority_task["notification_date"] = planning_date
            task_date = planning_date
        elif task.get("task_type") == "Citizen Complaint":
            priority_task["received_date"] = planning_date
            task_date = planning_date
        else:
            continue

        activity_data = activity_by_location[location_id]
        priority_score, priority_reason, priority_factors = calculate_task_priority(
            priority_task.get("component2_risk_score"),
            priority_task.get("urgency"),
            task_date,
            selected_date,
            activity_data,
            "case" if task.get("task_type") == "Dengue Case Inspection" else "complaint",
        )
        priority_task.update(activity_data)
        quality_status = (
            "review" if priority_score is None else
            "provisional_assumption"
            if priority_factors["task_urgency"].get("assumption") else "complete"
        )
        if priority_score is None:
            priority_task.update({
                "priority_score": None,
                "priority_level": "Review",
                "priority_reason": priority_reason,
                "priority_factors": priority_factors,
                "data_quality_status": quality_status,
            })
            if task.get("task_type") == "Dengue Case Inspection":
                submitted_cases.append(priority_task)
            else:
                submitted_complaints.append(priority_task)
            continue
        priority_task.update({
            "priority_score": priority_score,
            "priority_level": get_priority_level(priority_score),
            "priority_reason": priority_reason,
            "priority_factors": priority_factors,
            "data_quality_status": quality_status,
        })
        if task.get("task_type") == "Dengue Case Inspection":
            submitted_cases.append(priority_task)
        else:
            submitted_complaints.append(priority_task)

    cases = cases + submitted_cases
    complaints = complaints + submitted_complaints
    _PRIORITY_SNAPSHOT_CACHE.clear()
    _PRIORITY_SNAPSHOT_CACHE[cache_key] = (cases, complaints, location_map)
    return _make_priority_page(
        cases, complaints, location_map, selected_date, date_from,
        date_to, limit, offset, task_type, priority_level, location_id, search,
    )


@router.get("/analytics/monthly")
def get_monthly_analytics(
    location_id: str = Query(min_length=1, max_length=50),
    metric: Literal["cases", "complaints"] = Query(default="cases"),
    year: int | None = Query(default=None, ge=2000, le=2100),
):
    """Return location-filtered monthly record counts with coverage metadata."""
    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )

    try:
        with sqlite3.connect(
            DATABASE_PATH.resolve().as_uri() + "?mode=ro",
            uri=True,
        ) as connection:
            location = connection.execute(
                "SELECT location_id, village_area FROM Locations WHERE location_id = ?",
                (location_id,),
            ).fetchone()
            if location is None:
                raise HTTPException(status_code=422, detail="Unknown location_id.")

            selected_year = year
            if selected_year is None:
                table = "Case_Notifications" if metric == "cases" else "Citizen_Complaints"
                date_column = "notification_date" if metric == "cases" else "received_date"
                latest_date = connection.execute(
                    f"SELECT MAX({date_column}) FROM {table}"
                ).fetchone()[0]
                selected_year = date.fromisoformat(latest_date).year if latest_date else date.today().year

            result = get_monthly_location_analytics(
                connection, location_id, selected_year, metric
            )
            result["location_name"] = location[1]
            return result
    except HTTPException:
        raise
    except (sqlite3.Error, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not calculate monthly analytics: {exc}",
        ) from exc


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
                    risk.risk_score AS component2_risk_score,
                    risk.risk_level AS component2_risk_level,
                    risk.score_source AS component2_score_source
                FROM Locations AS locations
                LEFT JOIN Component2_Location_Risk AS risk
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
                    locations.location_id,
                    locations.moh_area,
                    locations.phi_range,
                    locations.village_area,
                    locations.village_area AS location_name,
                    locations.location_label,
                    risk.risk_score AS component2_risk_score,
                    risk.risk_level AS component2_risk_level,
                    risk.score_source AS component2_score_source
                FROM Locations AS locations
                LEFT JOIN Component2_Location_Risk AS risk
                    ON risk.location_id = locations.location_id
                WHERE locations.location_id = ?
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
            activity_data = calculate_location_activity(
                connection,
                request.location_id,
                request.planning_date,
            )

        record = save_submitted_task(
            request,
            dict(location_row),
            activity_data,
        )
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
        tasks = load_tasks(planning_date)
        submitted_tasks = []
        review_tasks = []
        with sqlite3.connect(DATABASE_PATH) as connection:
            connection.row_factory = sqlite3.Row
            locations = {
                row["location_id"]: dict(row)
                for row in connection.execute(
                    "SELECT locations.location_id, locations.moh_area, "
                    "locations.phi_range, locations.village_area, "
                    "locations.location_label, risk.risk_score, risk.risk_level, "
                    "risk.score_source FROM Locations AS locations "
                    "LEFT JOIN Component2_Location_Risk AS risk "
                    "ON risk.location_id = locations.location_id"
                )
            }
            activity_by_location = {}
            for task in load_submitted_tasks():
                if (
                    task.get("planning_date") != planning_date
                    or task.get("status") != "Pending"
                ):
                    continue
                location_id = task.get("location_id")
                location = locations.get(location_id)
                if location is None:
                    continue
                if location_id not in activity_by_location:
                    activity_by_location[location_id] = calculate_location_activity(
                        connection, location_id, request.planning_date
                    )
                task_type = task.get("task_type")
                score, reason, factors = calculate_task_priority(
                    location.get("risk_score"),
                    task.get("urgency"),
                    task.get("planning_date"),
                    request.planning_date,
                    activity_by_location[location_id],
                    "case" if task_type == "Dengue Case Inspection" else "complaint",
                )
                scheduled_task = {
                    **task,
                    "component2_risk_score": location.get("risk_score"),
                    "component2_risk_level": location.get("risk_level"),
                    "component2_score_source": location.get("score_source"),
                    "moh_area": location.get("moh_area"),
                    "phi_range": location.get("phi_range"),
                    "village_area": location.get("village_area"),
                    "location_label": location.get("location_label"),
                    "priority_score": score,
                    "priority_level": get_priority_level(score),
                    "priority_reason": reason,
                    "priority_factors": factors,
                    **activity_by_location[location_id],
                }
                if score is None:
                    scheduled_task.update({
                        "assigned_phi": "",
                        "start_time": "",
                        "end_time": "",
                        "status": "Unscheduled",
                        "data_quality_status": "review",
                        "reason": reason,
                    })
                    review_tasks.append(scheduled_task)
                else:
                    scheduled_task["data_quality_status"] = "complete"
                    submitted_tasks.append(scheduled_task)
        tasks.extend(submitted_tasks)
        phis = load_phis(planning_date)

        if not tasks:
            plan = review_tasks
            solver_status = "NO_ELIGIBLE_TASKS"
        else:
            plan, solver_status = solve_schedule(
                tasks,
                phis,
                planning_date,
            )
            plan.extend(review_tasks)

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
        "review_tasks": sum(
            row.get("data_quality_status") == "review" for row in plan
        ),
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
