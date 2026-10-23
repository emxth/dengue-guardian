"""Publish confirmed PHI assignments to MongoDB for mobile retrieval."""

from collections import defaultdict
import os

from component_3_phi_planning.api.mongo_store import get_database


MOBILE_TASK_FIELDS = (
    "scenario_task_id", "source_id", "task_type", "priority_score",
    "priority_level", "scheduling_priority_level", "priority_reason",
    "priority_factors", "data_quality_status", "task_date",
    "location_id", "location_label", "village_area", "moh_area",
    "phi_range", "planning_date", "assigned_phi", "start_time", "end_time",
    "status", "task_status", "reason", "urgency", "complaint_type",
    "inspection_required", "component2_risk_score", "component2_risk_level",
    "component2_score_source", "area_activity_score", "daily_case_count",
    "daily_activity_score", "monthly_case_count", "monthly_activity_score",
)


def publish_confirmed_schedule(planning_date, tasks, confirmed_at):
    by_phi = defaultdict(list)
    for task in tasks:
        phi_id = str(task.get("assigned_phi") or "").strip()
        if task.get("status") != "Scheduled" or not phi_id:
            continue
        by_phi[phi_id].append({
            field: task.get(field)
            for field in MOBILE_TASK_FIELDS
            if field in task
        })
    for phi_tasks in by_phi.values():
        phi_tasks.sort(key=lambda task: (task.get("start_time") or "", task.get("scenario_task_id") or ""))

    database = get_database()
    database.phi_released_schedules.replace_one(
        {"planning_date": planning_date},
        {
            "planning_date": planning_date,
            "confirmed_at": confirmed_at,
            "phi_schedules": dict(by_phi),
        },
        upsert=True,
    )
    return {phi_id: len(phi_tasks) for phi_id, phi_tasks in by_phi.items()}


def get_released_schedule(planning_date, phi_id):
    document = get_database().phi_released_schedules.find_one(
        {"planning_date": planning_date, f"phi_schedules.{phi_id}": {"$exists": True}},
        {"_id": 0, "planning_date": 1, "confirmed_at": 1, f"phi_schedules.{phi_id}": 1},
    )
    if document is None:
        return None
    return {
        "planning_date": document["planning_date"],
        "confirmed_at": document["confirmed_at"],
        "tasks": document.get("phi_schedules", {}).get(phi_id, []),
    }


def get_released_dates(phi_id):
    database = get_database()
    return list(database.phi_released_schedules.find(
        {f"phi_schedules.{phi_id}": {"$exists": True}},
        {"_id": 0, "planning_date": 1, f"phi_schedules.{phi_id}": 1},
    ).sort("planning_date", -1))


def revoke_released_schedule(planning_date):
    if not os.getenv("MONGODB_URI"):
        return
    get_database().phi_released_schedules.delete_one({"planning_date": planning_date})