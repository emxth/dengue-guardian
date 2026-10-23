"""Mongo persistence for PHI inspection drafts and immutable submissions."""

from datetime import datetime, timezone
from uuid import uuid4

from pymongo.errors import DuplicateKeyError

from component_3_phi_planning.api.mongo_store import get_database


def ensure_indexes(database=None):
    if database is None:
        database = get_database()
    database.inspection_reports.create_index("draft_key", unique=True, sparse=True)
    database.inspection_reports.create_index("submission_key", unique=True, sparse=True)
    database.inspection_reports.create_index([("phi_id", 1), ("task.planning_date", 1)])


def save_draft(phi_id, task, payload):
    database = get_database()
    ensure_indexes(database)
    key = f"{phi_id}:{task['task_id']}"
    existing = database.inspection_reports.find_one({"draft_key": key}, {"_id": 0, "report_id": 1})
    report = {
        "report_id": (existing or {}).get("report_id") or str(uuid4()),
        "draft_key": key,
        "phi_id": phi_id,
        "task": task,
        "report_status": "Draft",
        "form": payload,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    database.inspection_reports.replace_one({"draft_key": key}, report, upsert=True)
    return report


def get_task_reports(phi_id, task_id):
    database = get_database()
    ensure_indexes(database)
    draft = database.inspection_reports.find_one(
        {"draft_key": f"{phi_id}:{task_id}"}, {"_id": 0}
    )
    submitted = list(database.inspection_reports.find(
        {"phi_id": phi_id, "task.task_id": task_id, "report_status": "Submitted"},
        {"_id": 0},
    ).sort("submitted_at", -1))
    return {"draft": draft, "submitted_reports": submitted}


def get_report_by_submission(phi_id, submission_id):
    return get_database().inspection_reports.find_one(
        {"phi_id": phi_id, "submission_key": f"{phi_id}:{submission_id}"},
        {"_id": 0},
    )


def submit_report(phi_id, task, payload, timestamp):
    database = get_database()
    ensure_indexes(database)
    submission_key = f"{phi_id}:{payload['client_submission_id']}"
    existing_submission = database.inspection_reports.find_one(
        {"submission_key": submission_key}, {"_id": 0}
    )
    if existing_submission:
        return existing_submission, True

    submitted_task_key = f"{phi_id}:{task['task_id']}"
    draft_key = submitted_task_key
    report = {
        "report_id": str(uuid4()),
        "submission_key": submission_key,
        "submitted_task_key": submitted_task_key,
        "phi_id": phi_id,
        "task": task,
        "inspection_date": payload.get("inspection_date"),
        "report_status": "Submitted",
        "form": payload,
        "submitted_at": timestamp,
        "audit_history": [{"action": "Submitted", "actor_phi_id": phi_id, "at": timestamp}],
    }
    try:
        database.inspection_reports.insert_one(report)
    except DuplicateKeyError:
        existing_submission = database.inspection_reports.find_one(
            {"submission_key": submission_key}, {"_id": 0}
        )
        if existing_submission:
            return existing_submission, True
        return None, False
    database.inspection_reports.delete_one({"draft_key": draft_key})
    return report, False


def _update_released_task(task, phi_id, values):
    database = get_database()
    planning_date = task["planning_date"]
    document = database.phi_released_schedules.find_one({"planning_date": planning_date})
    if document is None:
        return
    tasks = document.get("phi_schedules", {}).get(phi_id, [])
    updated = []
    for item in tasks:
        if task["task_id"] in {
            item.get("scenario_task_id"),
            item.get("source_id"),
            item.get("task_id"),
        }:
            item = {**item, **values}
        updated.append(item)
    database.phi_released_schedules.update_one(
        {"planning_date": planning_date},
        {"$set": {f"phi_schedules.{phi_id}": updated}},
    )


def mark_released_task_started(task, phi_id):
    _update_released_task(task, phi_id, {"task_status": "In Progress"})


def mark_released_task_complete(task, phi_id, report_id):
    _update_released_task(
        task,
        phi_id,
        {"task_status": "Completed", "inspection_report_id": report_id},
    )


def find_released_task(phi_id, task_id):
    database = get_database()
    task_id = str(task_id).strip()
    task_match = {"$or": [
        {"scenario_task_id": task_id},
        {"source_id": task_id},
        {"task_id": task_id},
    ]}
    document = database.phi_released_schedules.find_one(
        {
            f"phi_schedules.{phi_id}": {
                "$elemMatch": task_match,
            }
        },
        {"_id": 0, "planning_date": 1, f"phi_schedules.{phi_id}": 1},
    )
    tasks = document.get("phi_schedules", {}).get(phi_id, []) if document else []
    task = next((row for row in tasks if task_id in {
        str(row.get("scenario_task_id") or "").strip(),
        str(row.get("source_id") or "").strip(),
        str(row.get("task_id") or "").strip(),
    }), None)

    # Older schedule snapshots may have slightly different nested task fields,
    # so search only this PHI's released schedule arrays as a bounded fallback.
    if task is None:
        for candidate in database.phi_released_schedules.find(
            {f"phi_schedules.{phi_id}": {"$exists": True}},
            {"_id": 0, "planning_date": 1, f"phi_schedules.{phi_id}": 1},
        ):
            candidate_tasks = candidate.get("phi_schedules", {}).get(phi_id, [])
            task = next((row for row in candidate_tasks if task_id in {
                str(row.get("scenario_task_id") or "").strip(),
                str(row.get("source_id") or "").strip(),
                str(row.get("task_id") or "").strip(),
            }), None)
            if task is not None:
                document = candidate
                break
    if task is None:
        return None
    task_date = document["planning_date"]
    from component_3_phi_planning.api import plan_store

    state = plan_store.load_schedule_state(task_date)
    if not state.get("confirmed") or not state.get("released_to_phis"):
        return None
    return {**task, "planning_date": task_date}