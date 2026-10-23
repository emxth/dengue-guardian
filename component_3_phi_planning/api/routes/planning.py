
"""Planning endpoints for the C3 PHI Planning API."""

import csv
import logging
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from component_3_phi_planning.api import task_store
from component_3_phi_planning.api import availability_store
from component_3_phi_planning.api import plan_store
from component_3_phi_planning.api import schedule_release_store
from component_3_phi_planning.config import DEFAULT_PLANNING_DATE
from component_3_phi_planning.api.task_store import (
    NewInspectionTask,
    TASK_STORE_PATH,
    load_submitted_tasks,
    save_task_records,
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
    prepare_scheduling_task,
    solve_schedule,
    task_waiting_days,
)
from component_3_phi_planning.rescheduling.phi_rescheduler import (
    read_phi_daily,
    reschedule_tasks,
)


router = APIRouter(prefix="/api/v1/planning", tags=["Planning"])
logger = logging.getLogger(__name__)

COMPONENT_DIR = Path(__file__).resolve().parents[2]
DATABASE_PATH = (
    COMPONENT_DIR
    / "data"
    / "Kaduwela_C3_Updated_New_ver.sqlite"
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
    page_rows = [
        prepare_scheduling_task(task)
        if task.get("priority_score") is None else task
        for task in all_rows[offset:offset + limit]
    ]
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


class TaskStatusUpdate(BaseModel):
    """Execution status update for a persisted planning task."""

    task_status: Literal["Pending", "In Progress", "Completed", "Cancelled"]


class PhiAvailabilityUpdate(BaseModel):
    """Date-scoped user override for one PHI's availability."""

    planning_date: date
    availability: Literal["Available", "Unavailable"]


class ScheduleConfirmationRequest(BaseModel):
    planning_date: date


def _read_phi_availability(planning_date):
    database_uri = DATABASE_PATH.resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(database_uri, uri=True) as connection:
        return availability_store.load_phi_daily_defaults(connection, planning_date)


@router.get("/phis/availability")
def get_phi_availability(planning_date: date = Query(...)):
    """Return authoritative PHI availability for one date."""
    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )
    try:
        phi_daily = _read_phi_availability(planning_date)
    except (sqlite3.Error, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not retrieve PHI availability: {exc}",
        ) from exc

    return {
        "data_mode": "synthetic_research_data",
        "planning_date": planning_date.isoformat(),
        "availability_scope": "selected planning date only",
        "phis": list(phi_daily.values()),
    }


@router.put("/phis/{phi_id}/availability")
def set_phi_availability(phi_id: str, request: PhiAvailabilityUpdate):
    """Persist an explicit availability state for one PHI and one date."""
    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )
    try:
        phi_daily = _read_phi_availability(request.planning_date)
        if phi_id not in phi_daily:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Unknown Kaduwela PHI '{phi_id}' for "
                    f"{request.planning_date.isoformat()}."
                ),
            )
        override = availability_store.save_availability_override(
            phi_id,
            request.planning_date,
            request.availability,
        )
        updated = _read_phi_availability(request.planning_date)[phi_id]
        state = plan_store.load_schedule_state(request.planning_date)
        plan_path = API_OUTPUT_DIR / f"phi_plan_{request.planning_date.isoformat()}.csv"
        assigned_tasks = []
        if plan_path.is_file():
            with plan_path.open("r", newline="", encoding="utf-8-sig") as file:
                assigned_tasks = [
                    row for row in csv.DictReader(file)
                    if row.get("assigned_phi") == phi_id
                    and row.get("status") == "Scheduled"
                    and row.get("task_status") == "Pending"
                ]
        if request.availability == "Unavailable" and assigned_tasks:
            required = sorted(set(state.get("required_unavailable_phis", [])) | {phi_id})
            state = plan_store.save_schedule_state(
                request.planning_date,
                {
                    "status": "rescheduling_required",
                    "confirmed": False,
                    "released_to_phis": False,
                    "rescheduling_required": True,
                    "rescheduling_processed": False,
                    "required_unavailable_phis": required,
                },
            )
        elif request.availability == "Available" and phi_id in state.get("required_unavailable_phis", []):
            remaining = [
                value for value in state["required_unavailable_phis"]
                if value != phi_id
            ]
            state = plan_store.save_schedule_state(
                request.planning_date,
                {
                    "status": "rescheduling_required" if remaining else "draft",
                    "confirmed": False,
                    "released_to_phis": False,
                    "rescheduling_required": bool(remaining),
                    "rescheduling_processed": False,
                    "required_unavailable_phis": remaining,
                },
            )
        return {
            "message": "PHI availability saved for the selected planning date.",
            "planning_date": request.planning_date.isoformat(),
            "availability_scope": "selected planning date only",
            "override": override,
            "phi": updated,
            "schedule_state": state,
        }
    except HTTPException:
        raise
    except (sqlite3.Error, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not save PHI availability: {exc}",
        ) from exc


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
            latest_case_date = connection.execute(
                "SELECT MAX(notification_date) FROM Case_Notifications"
            ).fetchone()[0]
            earliest_task_date, latest_task_date = connection.execute(
                """
                SELECT MIN(task_date), MAX(task_date)
                FROM (
                    SELECT notification_date AS task_date FROM Case_Notifications
                    UNION ALL
                    SELECT received_date AS task_date FROM Citizen_Complaints
                )
                """
            ).fetchone()
            date_coverage = {
                "task_date_from": earliest_task_date,
                "task_date_to": latest_task_date,
                "score_as_of_max": latest_case_date,
            }
            latest_data_date = date.fromisoformat(latest_case_date)
            selected_date = planning_date or date_to or latest_data_date
            cache_key = _priority_cache_key(selected_date)
            cached_snapshot = _PRIORITY_SNAPSHOT_CACHE.get(cache_key)
            if cached_snapshot is not None:
                cases, complaints, location_map = cached_snapshot
                page = _make_priority_page(
                    cases, complaints, location_map, selected_date, date_from,
                    date_to, limit, offset, task_type, priority_level,
                    location_id, search,
                )
                page["date_coverage"] = date_coverage
                return page
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
    page = _make_priority_page(
        cases, complaints, location_map, selected_date, date_from,
        date_to, limit, offset, task_type, priority_level, location_id, search,
    )
    page["date_coverage"] = date_coverage
    return page


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

            phi_daily = availability_store.load_phi_daily_defaults(
                connection, request.planning_date
            )
            if not phi_daily:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "No Kaduwela PHI master records are available for this date."
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


@router.patch("/tasks/{task_id}/status")
def update_task_execution_status(task_id: str, request: TaskStatusUpdate):
    """Update execution lifecycle separately from appointment status."""
    try:
        records = load_submitted_tasks()
        task = next((
            row for row in records
            if task_id in {
                row.get("scenario_task_id"),
                row.get("source_id"),
            }
        ), None)
        if task is None:
            raise HTTPException(status_code=404, detail="Planning task not found.")

        task["task_status"] = request.task_status
        _remove_unapproved_deadline_fields(task)
        if request.task_status in {"Completed", "Cancelled"}:
            task["status"] = request.task_status
        elif task.get("status") in {"Completed", "Cancelled"}:
            task["status"] = "Unscheduled"
            task["assigned_phi"] = ""
            task["start_time"] = ""
            task["end_time"] = ""

        history = list(task.get("execution_history") or [])
        event = {
            "task_status": request.task_status,
            "updated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        if not history or history[-1].get("task_status") != request.task_status:
            history.append(event)
        task["execution_history"] = history
        save_task_records(records)

        planning_date = task.get("current_planning_date") or task.get("planning_date")
        if planning_date:
            plan_path = API_OUTPUT_DIR / f"phi_plan_{planning_date}.csv"
            if plan_path.is_file():
                with plan_path.open("r", newline="", encoding="utf-8-sig") as file:
                    plan = list(csv.DictReader(file))
                for row in plan:
                    _remove_unapproved_deadline_fields(row)
                    if task_id in {row.get("scenario_task_id"), row.get("source_id")}:
                        row["task_status"] = request.task_status
                        if request.task_status in {"Completed", "Cancelled"}:
                            row["status"] = request.task_status
                _write_plan_snapshot(plan_path, plan)

        return {"message": "Task execution status updated.", "task": task}
    except HTTPException:
        raise
    except (ValueError, OSError, csv.Error) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not update task execution status: {exc}",
        ) from exc


def _write_plan_snapshot(path, plan):
    fieldnames = list(dict.fromkeys(
        field for task in plan for field in task
    )) or ["scenario_task_id", "task_status", "status", "reason"]
    from io import StringIO

    buffer = StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(plan)
    contents = buffer.getvalue()

    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file():
        previous = path.read_text(encoding="utf-8")
        if previous != contents:
            version = 1
            while True:
                archive = path.with_name(
                    f"{path.stem}_history_{version}{path.suffix}"
                )
                if not archive.exists():
                    archive.write_text(previous, encoding="utf-8")
                    break
                version += 1
    path.write_text(contents, encoding="utf-8", newline="")


def _task_execution_status(task):
    status = task.get("task_status")
    if status in {"Pending", "In Progress", "Completed", "Cancelled"}:
        return status
    if task.get("record_source") == "user_submitted_synthetic_demo":
        return "Pending"
    return "Pending"


def _record_history(task, planning_date):
    raw_history = task.get("schedule_history")
    history = [row for row in raw_history if isinstance(row, dict)] if isinstance(raw_history, list) else []
    event = {
        "planning_date": planning_date,
        "assigned_phi": task.get("assigned_phi") or "",
        "start_time": task.get("start_time") or "",
        "end_time": task.get("end_time") or "",
        "status": task.get("status") or "Unscheduled",
        "reason": task.get("reason") or "",
    }
    if not history or any(history[-1].get(key) != value for key, value in event.items()):
        history.append(event)
    task["schedule_history"] = history


def _remove_unapproved_deadline_fields(task):
    for field in ("deadline_date", "deadline_at_risk", "overdue"):
        task.pop(field, None)


@router.get("/schedule")
def get_saved_schedule(planning_date: date = Query(...)):
    """Return the saved plan and its review/confirmation state."""
    plan_path = API_OUTPUT_DIR / f"phi_plan_{planning_date.isoformat()}.csv"
    if not plan_path.is_file():
        raise HTTPException(status_code=404, detail="No schedule exists for this planning date.")
    try:
        with plan_path.open("r", newline="", encoding="utf-8-sig") as file:
            tasks = list(csv.DictReader(file))
        for row in tasks:
            _remove_unapproved_deadline_fields(row)
            row["waiting_days"] = task_waiting_days(row, planning_date)
        state = plan_store.load_schedule_state(planning_date)
    except (OSError, csv.Error, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not retrieve the saved schedule: {exc}",
        ) from exc
    scheduled = sum(row.get("status") == "Scheduled" for row in tasks)
    unscheduled = sum(row.get("status") == "Unscheduled" for row in tasks)
    outstanding_statuses = {"Pending", "In Progress"}
    is_carried_forward = lambda row: (
        str(row.get("carried_forward", "")).strip().lower() in ("true", "1")
        and _task_execution_status(row) in outstanding_statuses
    )
    carried_forward = sum(is_carried_forward(row) for row in tasks)
    new_tasks = sum(
        _task_execution_status(row) in outstanding_statuses
        and not is_carried_forward(row)
        for row in tasks
    )
    review_tasks = sum(str(row.get("priority_fallback", "")).strip().lower() in ("true", "1") for row in tasks)
    return {
        "data_mode": "synthetic_research_data",
        "planning_policy": "provisional_research_prototype",
        "planning_date": planning_date.isoformat(),
        "solver_status": state.get("solver_status", "SAVED"),
        "total_tasks": len(tasks),
        "new_tasks": new_tasks,
        "scheduled_tasks": scheduled,
        "unscheduled_tasks": unscheduled,
        "pending_tasks": sum(
            _task_execution_status(row) == "Pending"
            and row.get("status") == "Unscheduled"
            for row in tasks
        ),
        "carried_forward_tasks": carried_forward,
        "completed_tasks": sum(row.get("status") == "Completed" for row in tasks),
        "cancelled_tasks": sum(row.get("status") == "Cancelled" for row in tasks),
        "review_tasks": review_tasks,
        "schedule_saved": True,
        "schedule_state": state,
        "tasks": tasks,
    }


@router.post("/schedule/confirm")
def confirm_schedule(request: ScheduleConfirmationRequest):
    """Confirm and publish PHI-filtered schedules to the mobile API."""
    plan_path = API_OUTPUT_DIR / f"phi_plan_{request.planning_date.isoformat()}.csv"
    if not plan_path.is_file():
        raise HTTPException(status_code=404, detail="Generate a schedule before confirming it.")

    state = plan_store.load_schedule_state(request.planning_date)
    if state.get("rescheduling_required") and not state.get("rescheduling_processed"):
        raise HTTPException(
            status_code=409,
            detail=(
                "Adaptive rescheduling is required for unavailable PHI(s): "
                + ", ".join(state.get("required_unavailable_phis", []))
            ),
        )

    try:
        with plan_path.open("r", newline="", encoding="utf-8-sig") as file:
            tasks = list(csv.DictReader(file))
        released_counts = schedule_release_store.publish_confirmed_schedule(
            request.planning_date.isoformat(),
            tasks,
            state.get("confirmed_at") or datetime.now().astimezone().isoformat(timespec="seconds"),
        )
    except Exception as exc:
        logger.exception(
            "Could not publish the confirmed PHI schedule for %s",
            request.planning_date.isoformat(),
        )
        raise HTTPException(
            status_code=503,
            detail="Could not publish PHI schedules; confirmation was not completed.",
        ) from exc

    state = plan_store.save_schedule_state(
        request.planning_date,
        {
            "status": "confirmed",
            "confirmed": True,
            "confirmed_at": state.get("confirmed_at") or datetime.now().astimezone().isoformat(timespec="seconds"),
            "released_to_phis": True,
        },
    )
    return {
        "message": "Schedule confirmed for the selected planning date.",
        "planning_date": request.planning_date.isoformat(),
        "schedule_state": state,
        "delivered_to_phis": False,
        "released_phi_count": len(released_counts),
        "released_task_count": sum(released_counts.values()),
    }


@router.post("/schedule")
def create_schedule(request: ScheduleRequest):
    """Generate a daily plan and retain unassigned work for later runs."""
    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail="Synthetic research database was not found.",
        )

    planning_date = request.planning_date.isoformat()
    previous_state = plan_store.load_schedule_state(planning_date)
    if previous_state.get("rescheduling_required") and not previous_state.get("rescheduling_processed"):
        raise HTTPException(
            status_code=409,
            detail=(
                "Complete adaptive rescheduling before regenerating this date's "
                "schedule."
            ),
        )
    registry = load_submitted_tasks()
    registry_by_id = {
        row.get("scenario_task_id") or row.get("source_id"): row
        for row in registry
        if row.get("scenario_task_id") or row.get("source_id")
    }

    try:
        source_tasks = load_tasks(planning_date)
        database_uri = DATABASE_PATH.resolve().as_uri() + "?mode=ro"
        with sqlite3.connect(database_uri, uri=True) as connection:
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
            completed_case_ids = set()
            if connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' "
                "AND name='Inspection_History'"
            ).fetchone():
                completed_case_ids = {
                    row[0] for row in connection.execute(
                        "SELECT DISTINCT task_id FROM Inspection_History "
                        "WHERE inspection_date < ?",
                        (planning_date,),
                    )
                }
            closed_complaint_ids = {
                row[0] for row in connection.execute(
                    "SELECT complaint_id FROM Citizen_Complaints "
                    "WHERE lower(trim(coalesce(status, ''))) = 'closed'"
                )
            }

            for record in registry:
                source_id = record.get("source_id")
                if (
                    record.get("task_type") == "Dengue Case Inspection"
                    and source_id in completed_case_ids
                    and "task_status" not in record
                ):
                    record["task_status"] = "Completed"
                    record["status"] = "Completed"
                    record["reason"] = "Matching inspection history exists by the planning date."
                elif (
                    record.get("task_type") == "Citizen Complaint"
                    and source_id in closed_complaint_ids
                    and _task_execution_status(record) not in {"Completed", "Cancelled", "In Progress"}
                ):
                    record["task_status"] = "Cancelled"
                    record["status"] = "Cancelled"
                    record["reason"] = "Source complaint is Closed; excluded from new assignment."

            task_map = {}
            for source_task in source_tasks:
                task_id = source_task["scenario_task_id"]
                existing = registry_by_id.get(task_id, {})
                merged = {**source_task, **existing}
                merged.update({
                    key: source_task[key]
                    for key in source_task
                    if key not in {
                        "task_status", "status", "assigned_phi", "start_time",
                        "end_time", "schedule_history", "current_planning_date",
                    }
                })
                merged["task_date"] = existing.get("task_date") or source_task["task_date"]
                merged["task_status"] = _task_execution_status(existing)
                merged.setdefault("schedule_history", [])
                task_map[task_id] = merged

            for record in registry:
                task_id = record.get("scenario_task_id") or record.get("source_id")
                task_day = record.get("task_date") or record.get("planning_date")
                if not task_id or not task_day or task_day > planning_date:
                    continue
                if _task_execution_status(record) not in {"Pending", "In Progress"}:
                    continue
                if record.get("record_source") != "user_submitted_synthetic_demo":
                    task_map.setdefault(task_id, prepare_scheduling_task(record))
                    continue
                location = locations.get(record.get("location_id"))
                if location is None:
                    continue
                location_id = record["location_id"]
                if location_id not in activity_by_location:
                    activity_by_location[location_id] = calculate_location_activity(
                        connection, location_id, request.planning_date
                    )
                activity = activity_by_location[location_id]
                score, reason, factors = calculate_task_priority(
                    location.get("risk_score"),
                    record.get("urgency"),
                    task_day,
                    request.planning_date,
                    activity,
                    "case" if record.get("task_type") == "Dengue Case Inspection" else "complaint",
                )
                task = {
                    **record,
                    "task_date": task_day,
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
                    "data_quality_status": "review" if score is None else "complete",
                    **activity,
                }
                task_map[task_id] = prepare_scheduling_task(task)

        candidates = []
        in_progress = []
        terminal_tasks = [
            dict(record)
            for record in registry
            if record.get("current_planning_date") == planning_date
            and _task_execution_status(record) in {"Completed", "Cancelled"}
        ]
        for task in task_map.values():
            task_status = _task_execution_status(task)
            if task_status not in {"Pending", "In Progress"}:
                continue
            task["task_status"] = task_status
            task["planning_date"] = planning_date
            task = prepare_scheduling_task(task)
            if task_status == "In Progress":
                task["status"] = "Scheduled"
                in_progress.append(task)
            else:
                task["assigned_phi"] = ""
                task["start_time"] = ""
                task["end_time"] = ""
                candidates.append(task)

        try:
            phis = load_phis(planning_date)
        except ValueError as exc:
            message = str(exc)
            if "No PHI availability data" not in message:
                raise
            phis = []
            for task in candidates:
                task["assigned_phi"] = ""
                task["start_time"] = ""
                task["end_time"] = ""
                task["status"] = "Unscheduled"
                task["reason"] = message
            solver_status = "NO_PHI_AVAILABILITY"

        if candidates and phis:
            plan, solver_status = solve_schedule(
                candidates,
                phis,
                planning_date,
                reserved_tasks=in_progress,
            )
        elif not candidates:
            plan, solver_status = [], "NO_PENDING_TASKS"
        else:
            plan = candidates
            solver_status = "NO_PHI_AVAILABILITY"
            for task in plan:
                task["assigned_phi"] = ""
                task["start_time"] = ""
                task["end_time"] = ""
                task["status"] = "Unscheduled"
                task["reason"] = (
                    "No PHI availability data exists for this planning date."
                )
        plan.extend(in_progress)
        plan.extend(terminal_tasks)

        for row in plan:
            _remove_unapproved_deadline_fields(row)
            row["waiting_days"] = task_waiting_days(row, planning_date)
            row["current_planning_date"] = planning_date
            row["carried_forward"] = str(row.get("task_date", planning_date))[:10] < planning_date
            _record_history(row, planning_date)
            task_id = row.get("scenario_task_id") or row.get("source_id")
            registry_by_id[task_id] = row

        if previous_state.get("released_to_phis"):
            schedule_release_store.revoke_released_schedule(planning_date)
        save_task_records(list(registry_by_id.values()))
        plan_path = API_OUTPUT_DIR / f"phi_plan_{planning_date}.csv"
        _write_plan_snapshot(plan_path, plan)
        fingerprint = plan_store.plan_fingerprint(plan)
        same_plan = previous_state.get("plan_fingerprint") == fingerprint
        state_updates = {
            "plan_fingerprint": fingerprint,
            "solver_status": solver_status,
            "required_unavailable_phis": previous_state.get("required_unavailable_phis", []),
            "rescheduling_required": previous_state.get("rescheduling_required", False),
            "rescheduling_processed": previous_state.get("rescheduling_processed", False),
        }
        if same_plan and previous_state.get("confirmed"):
            state_updates.update({
                "status": "confirmed",
                "confirmed": True,
                "confirmed_at": previous_state.get("confirmed_at"),
                "released_to_phis": False,
            })
        else:
            state_updates.update({
                "status": "draft",
                "confirmed": False,
                "confirmed_at": None,
                "released_to_phis": False,
            })
        schedule_state = plan_store.save_schedule_state(planning_date, state_updates)

    except HTTPException:
        raise
    except (ValueError, RuntimeError, sqlite3.Error, OSError, csv.Error) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not generate and save the schedule: {exc}",
        ) from exc

    scheduled_count = sum(row.get("status") == "Scheduled" for row in plan)
    unscheduled_count = sum(row.get("status") == "Unscheduled" for row in plan)
    return {
        "data_mode": "synthetic_research_data",
        "planning_policy": "provisional_research_prototype",
        "planning_date": planning_date,
        "solver_status": solver_status,
        "total_tasks": len(plan),
        "scheduled_tasks": scheduled_count,
        "unscheduled_tasks": unscheduled_count,
        "new_tasks": sum(
            _task_execution_status(row) in {"Pending", "In Progress"}
            and not row.get("carried_forward")
            for row in plan
        ),
        "pending_tasks": sum(
            row.get("task_status") == "Pending" and row.get("status") == "Unscheduled"
            for row in plan
        ),
        "carried_forward_tasks": sum(
            row.get("task_status") in {"Pending", "In Progress"}
            and row.get("carried_forward")
            for row in plan
        ),
        "schedule_state": schedule_state,
        "review_tasks": sum(row.get("priority_fallback") for row in plan),
        "completed_tasks": sum(row.get("status") == "Completed" for row in plan),
        "cancelled_tasks": sum(row.get("status") == "Cancelled" for row in plan),
        "schedule_saved": True,
        "tasks": plan,
        "note": (
            "Synthetic research plan. Review tasks retain a null numeric score "
            "and use a labeled provisional scheduling tier. Unassigned tasks "
            "remain Pending for later planning."
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

        for row in plan:
            _remove_unapproved_deadline_fields(row)

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

        availability_store.save_availability_override(
            request.unavailable_phi,
            request.planning_date,
            "Unavailable",
        )
        state = plan_store.load_schedule_state(planning_date)
        required = sorted(set(state.get("required_unavailable_phis", [])) | {
            request.unavailable_phi
        })
        plan_store.save_schedule_state(
            planning_date,
            {
                "status": "rescheduling_required",
                "confirmed": False,
                "released_to_phis": False,
                "rescheduling_required": True,
                "rescheduling_processed": False,
                "required_unavailable_phis": required,
            },
        )
        phi_daily = read_phi_daily(planning_date)

        updated_plan = reschedule_tasks(
            plan,
            phi_daily,
            request.unavailable_phi,
            assume_all_pending=request.assume_all_pending,
            planning_date=planning_date,
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
        row["waiting_days"] = task_waiting_days(row, planning_date)
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

    schedule_release_store.revoke_released_schedule(planning_date)
    records = load_submitted_tasks()
    records_by_id = {
        row.get("scenario_task_id") or row.get("source_id"): row
        for row in records
    }
    for row in updated_plan:
        task_id = row.get("scenario_task_id") or row.get("source_id")
        existing = records_by_id.get(task_id, {})
        _remove_unapproved_deadline_fields(existing)
        updated = {**existing, **row}
        updated["task_date"] = existing.get("task_date") or row.get("task_date") or row.get("planning_date")
        updated["schedule_history"] = existing.get("schedule_history", [])
        updated["current_planning_date"] = planning_date
        rescheduling_history = list(existing.get("rescheduling_history") or [])
        original = original_by_id.get(task_id, {})
        event = {
            "planning_date": planning_date,
            "unavailable_phi": request.unavailable_phi,
            "previous_assigned_phi": original.get("assigned_phi") or "",
            "previous_start_time": original.get("start_time") or "",
            "previous_end_time": original.get("end_time") or "",
            "assigned_phi": row.get("assigned_phi") or "",
            "start_time": row.get("start_time") or "",
            "end_time": row.get("end_time") or "",
            "task_status": row.get("task_status") or "Pending",
            "classification": row.get("reassignment_classification"),
            "reason": row.get("reason") or "",
        }
        if not rescheduling_history or rescheduling_history[-1] != event:
            rescheduling_history.append(event)
        updated["rescheduling_history"] = rescheduling_history
        _record_history(updated, planning_date)
        records_by_id[task_id] = updated
    save_task_records(list(records_by_id.values()))
    _write_plan_snapshot(plan_path, updated_plan)
    schedule_state = plan_store.save_schedule_state(
        planning_date,
        {
            "status": "revised_pending_confirmation",
            "confirmed": False,
            "confirmed_at": None,
            "released_to_phis": False,
            "rescheduling_required": False,
            "rescheduling_processed": True,
            "required_unavailable_phis": [],
            "plan_fingerprint": plan_store.plan_fingerprint(updated_plan),
        },
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
        "schedule_state": schedule_state,
        "original_tasks": plan,
        "tasks": updated_plan,
        "note": (
            "Synthetic rescheduling simulation only. The source database "
            "is unchanged; task execution and assignment state are retained "
            "in the separate planning task store."
        ),
    }
