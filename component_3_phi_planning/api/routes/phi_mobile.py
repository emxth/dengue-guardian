"""Authenticated mobile endpoints for PHI schedule access."""

from datetime import date
from datetime import datetime, timezone
import logging
import csv

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from component_3_phi_planning.api.mongo_store import get_database
from component_3_phi_planning.api import plan_store
from component_3_phi_planning.api.phi_auth import (
    get_current_phi,
    issue_token,
    verify_password,
)
from component_3_phi_planning.api.inspection_models import (
    InspectionReportInput,
)
from component_3_phi_planning.api.inspection_store import (
    find_released_task,
    get_task_reports,
    mark_released_task_complete,
    mark_released_task_started,
    get_report_by_submission,
    save_draft,
    submit_report,
)
from component_3_phi_planning.api.task_store import load_submitted_tasks, save_task_records
from component_3_phi_planning.api.schedule_release_store import (
    get_released_dates,
    get_released_schedule,
)


router = APIRouter(prefix="/api/v1/phi", tags=["PHI Mobile"])
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    phi_id: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=256)


@router.post("/login")
def phi_login(request: LoginRequest):
    try:
        account = get_database().phi_accounts.find_one({"phi_id": request.phi_id.strip()})
        if not account or not account.get("active") or not verify_password(request.password, account):
            raise HTTPException(status_code=401, detail="PHI ID or password is incorrect.")
        token = issue_token(account["phi_id"])
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="PHI account service is unavailable.") from exc
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 8 * 60 * 60,
        "phi": {
            key: account.get(key, "")
            for key in ("phi_id", "display_name", "moh_area", "phi_range")
        },
    }


@router.get("/schedules/dates")
def phi_schedule_dates(phi=Depends(get_current_phi)):
    try:
        dates = get_released_dates(phi["phi_id"])
        dates = [
            row["planning_date"]
            for row in dates
            if (
                (state := plan_store.load_schedule_state(row["planning_date"])).get("confirmed")
                and state.get("released_to_phis")
            )
        ]
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Released schedules are unavailable.") from exc
    return {
        "phi_id": phi["phi_id"],
        "dates": dates,
    }


@router.get("/schedules/{planning_date}")
def phi_schedule_for_date(planning_date: date, phi=Depends(get_current_phi)):
    try:
        state = plan_store.load_schedule_state(planning_date)
        if not state.get("confirmed") or not state.get("released_to_phis"):
            raise HTTPException(status_code=404, detail="No confirmed PHI schedule is available on this date.")
        schedule = get_released_schedule(planning_date.isoformat(), phi["phi_id"])
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Released schedules are unavailable.") from exc
    if schedule is None:
        raise HTTPException(status_code=404, detail="No confirmed schedule is available for your PHI account on this date.")
    return {"phi_id": phi["phi_id"], **schedule}


def _owned_released_task(task_id, phi, allow_completed=False):
    task = find_released_task(phi["phi_id"], task_id)
    if task is None:
        raise HTTPException(
            status_code=404,
            detail=f"Task {task_id!r} was not found in a confirmed schedule assigned to {phi['phi_id']}.",
        )
    if task.get("task_status") == "Completed" and not allow_completed:
        raise HTTPException(status_code=409, detail="This inspection task is already completed.")
    return {
        "task_id": task.get("scenario_task_id") or task.get("source_id"),
        "case_id": task.get("source_id") if task.get("task_type") == "Dengue Case Inspection" else None,
        "task_type": task.get("task_type", "Inspection"),
        "planning_date": task.get("planning_date"),
        "assigned_phi": phi["phi_id"],
        "phi_range": task.get("phi_range") or phi.get("phi_range", ""),
        "location_id": task.get("location_id"),
        "location_label": task.get("location_label") or task.get("village_area"),
        "village_area": task.get("village_area"),
        "moh_area": task.get("moh_area") or phi.get("moh_area"),
        "component2_risk_score": task.get("component2_risk_score"),
        "component2_risk_level": task.get("component2_risk_level"),
        "component2_score_source": task.get("component2_score_source"),
        "priority_score": task.get("priority_score"),
        "priority_level": task.get("priority_level"),
        "appointment_start": task.get("start_time"),
        "appointment_end": task.get("end_time"),
    }


@router.get("/tasks/{task_id}/inspection")
def get_phi_inspection(task_id: str, phi=Depends(get_current_phi)):
    task = find_released_task(phi["phi_id"], task_id)
    if task is None:
        history = get_task_reports(phi["phi_id"], task_id)
        if not history["submitted_reports"]:
            raise HTTPException(status_code=404, detail="Assigned task or your submitted report was not found.")
        task = history["submitted_reports"][0]["task"]
        return {"task": task, **history}
    task["task_id"] = task.get("scenario_task_id") or task.get("source_id")
    task["planning_date"] = task.get("planning_date")
    return {"task": task, **get_task_reports(phi["phi_id"], task["task_id"])}


@router.post("/tasks/{task_id}/inspection/start")
def start_phi_inspection(task_id: str, phi=Depends(get_current_phi)):
    task = _owned_released_task(task_id, phi, allow_completed=True)
    if task.get("task_status") == "Completed":
        reports = get_task_reports(phi["phi_id"], task["task_id"])["submitted_reports"]
        latest = reports[0] if reports else None
        if not latest or not latest.get("form", {}).get("follow_up_required"):
            raise HTTPException(status_code=409, detail="A follow-up inspection was not requested for this completed task.")
    try:
        mark_released_task_started(task, phi["phi_id"])
        _synchronize_task_status(task, phi["phi_id"], "In Progress", "", datetime.now(timezone.utc).isoformat(timespec="seconds"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not start inspection.") from exc
    return {"task_id": task["task_id"], "task_status": "In Progress"}


@router.put("/tasks/{task_id}/inspection/draft")
def put_phi_inspection_draft(
    task_id: str,
    request: InspectionReportInput,
    phi=Depends(get_current_phi),
):
    task = _owned_released_task(task_id, phi)
    payload = request.model_dump(mode="json")
    try:
        report = save_draft(phi["phi_id"], task, payload)
    except Exception as exc:
        logger.exception("Could not save PHI inspection draft for task %s", task_id)
        raise HTTPException(status_code=503, detail="Could not save inspection draft.") from exc
    return {"report_id": report["report_id"], "report_status": "Draft", "updated_at": report["updated_at"]}


@router.post("/tasks/{task_id}/inspection/submit")
def submit_phi_inspection(
    task_id: str,
    request: InspectionReportInput,
    phi=Depends(get_current_phi),
):
    task = _owned_released_task(task_id, phi, allow_completed=True)
    if request.inspection_date is None:
        raise HTTPException(status_code=422, detail="Inspection date is required to submit.")
    if request.inspection_date > date.today():
        raise HTTPException(status_code=422, detail="Inspection date cannot be in the future.")
    if not request.environmental_assessment_complete:
        raise HTTPException(status_code=422, detail="Complete the environmental assessment before submitting.")
    if request.follow_up_date and request.follow_up_date < request.inspection_date:
        raise HTTPException(status_code=422, detail="Follow-up date cannot be before the inspection date.")

    payload = request.model_dump(mode="json")
    try:
        existing_submission = get_report_by_submission(phi["phi_id"], str(request.client_submission_id))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not verify report submission status.") from exc
    if existing_submission is None:
        try:
            prior_reports = get_task_reports(phi["phi_id"], task["task_id"])["submitted_reports"]
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Could not verify prior inspection reports.") from exc
        if prior_reports and not prior_reports[0].get("form", {}).get("follow_up_required"):
            raise HTTPException(status_code=409, detail="This task has a submitted report and no further follow-up was requested.")
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        report, was_retry = submit_report(phi["phi_id"], task, payload, timestamp)
        if report is None:
            raise HTTPException(status_code=409, detail="An inspection report was already submitted for this task.")
        mark_released_task_complete(task, phi["phi_id"], report["report_id"])
        _synchronize_task_status(task, phi["phi_id"], "Completed", report["report_id"], timestamp)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Inspection submission processing failed for task %s", task_id)
        raise HTTPException(
            status_code=503,
            detail="Report processing is incomplete. Retry submission using the same saved report.",
        ) from exc
    return {
        "report_id": report["report_id"],
        "report_status": "Submitted",
        "submitted_at": report["submitted_at"],
        "idempotent_retry": was_retry,
    }


def _synchronize_task_status(task, phi_id, task_status, report_id, timestamp):
    from component_3_phi_planning.api.routes.planning import (
        API_OUTPUT_DIR,
        _write_plan_snapshot,
    )

    task_id = task["task_id"]
    records = load_submitted_tasks()
    record = next((row for row in records if task_id in {row.get("scenario_task_id"), row.get("source_id")}), None)
    if record is None:
        record = {
            **task,
            "scenario_task_id": task_id,
            "source_id": task_id,
            "record_source": "phi_mobile_inspection_report",
        }
        records.append(record)
    record["task_status"] = task_status
    if report_id:
        record["inspection_report_id"] = report_id
    record["updated_at"] = timestamp
    execution_history = list(record.get("execution_history") or [])
    history_event = {"task_status": task_status, "report_id": report_id or None}
    if not execution_history or any(execution_history[-1].get(key) != value for key, value in history_event.items()):
        execution_history.append({**history_event, "updated_at": timestamp})
    record["execution_history"] = execution_history
    save_task_records(records)

    plan_path = API_OUTPUT_DIR / f"phi_plan_{task['planning_date']}.csv"
    if not plan_path.is_file():
        return
    with plan_path.open("r", newline="", encoding="utf-8-sig") as file:
        plan = list(csv.DictReader(file))
    for row in plan:
        if task_id in {row.get("scenario_task_id"), row.get("source_id")}:
            row.update({
                "task_status": task_status,
                **({"status": "Completed", "inspection_report_id": report_id} if task_status == "Completed" else {}),
            })
    _write_plan_snapshot(plan_path, plan)


