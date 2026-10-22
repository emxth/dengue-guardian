"""Isolated synthetic scenario for adaptive urgent-complaint scheduling.

The source database and original schedule are read-only. A lower-priority
Pending task may be deferred for an urgent complaint and replanned to another
valid slot/date. In-progress and completed tasks are protected.

All data and outcomes from this scenario are synthetic.
"""

import argparse
import csv
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "Kaduwela_C3_Updated_New_ver.sqlite"
PLAN_DIR = ROOT / "optimization" / "output"
OUTPUT_DIR = ROOT / "rescheduling" / "output"

TASK_DURATION_MINUTES = 45
URGENT_TASK_ID = "SIM-URGENT-COMPLAINT-001"
DEFERRED_REASON_PREFIX = (
    "Deferred to accommodate a higher-priority urgent complaint"
)
PRIORITY_ORDER = {"High": 0, "Medium": 1, "Low": 2}


def read_csv(path):
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def _daily_details(rows):
    return {
        row[0]: {
            "phi_range": row[1],
            "availability": row[2],
            "working_start": row[3],
            "working_end": row[4],
            "daily_capacity": int(row[5]),
            "existing_workload": int(row[6]),
            "moh_area": row[7],
        }
        for row in rows
    }


def read_phi_daily(plan_date):
    """Load modeled PHI availability and capacity for one date."""
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT d.phi_id, d.phi_range, d.availability, d.working_start,
                   d.working_end, d.daily_capacity, d.existing_workload, m.moh_area
            FROM PHI_Daily AS d
            JOIN PHI_Master AS m ON m.phi_id = d.phi_id
            WHERE d.date = ?
            ORDER BY d.phi_id
            """,
            (plan_date,),
        ).fetchall()
    if not rows:
        raise ValueError(f"No PHI availability data for {plan_date}.")
    return _daily_details(rows)


def read_future_phi_daily(start_date):
    """Load PHI daily details from start_date through the last modeled date."""
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT d.date, d.phi_id, d.phi_range, d.availability, d.working_start,
                   d.working_end, d.daily_capacity, d.existing_workload, m.moh_area
            FROM PHI_Daily AS d
            JOIN PHI_Master AS m ON m.phi_id = d.phi_id
            WHERE d.date >= ?
            ORDER BY d.date, d.phi_id
            """,
            (start_date,),
        ).fetchall()
    if not rows:
        raise ValueError(f"No PHI availability data on or after {start_date}.")
    result = defaultdict(dict)
    for row in rows:
        date, phi_id, phi_range, availability, start, end, capacity, workload, moh_area = row
        result[date][phi_id] = {
            "phi_range": phi_range,
            "availability": availability,
            "working_start": start,
            "working_end": end,
            "daily_capacity": int(capacity),
            "existing_workload": int(workload),
            "moh_area": moh_area,
        }
    return dict(result)


def to_minutes(value):
    parsed = datetime.strptime(value, "%H:%M")
    return parsed.hour * 60 + parsed.minute


def to_clock(value):
    return f"{value // 60:02d}:{value % 60:02d}"


def overlaps(start_a, end_a, start_b, end_b):
    return start_a < end_b and start_b < end_a


def priority_key(task):
    """Lower tuple means higher priority; score breaks ties within a tier."""
    level = task.get("priority_level", "")
    if level not in PRIORITY_ORDER:
        raise ValueError(f"Unknown priority level: {level}")
    return (
        PRIORITY_ORDER[level],
        -float(task.get("priority_score") or 0),
        task.get("scenario_task_id", ""),
    )


def _rows_for_phi_date(plan, phi_id, plan_date):
    return [
        row for row in plan
        if row.get("status") == "Scheduled"
        and row.get("assigned_phi") == phi_id
        and row.get("planning_date") == plan_date
    ]


def find_free_slot(phi_id, details, plan, plan_date):
    """Find the earliest valid 45-minute slot for one PHI on one date."""
    if details["availability"].strip().lower() != "available":
        return None

    capacity = max(0, details["daily_capacity"] - details["existing_workload"])
    assigned_rows = _rows_for_phi_date(plan, phi_id, plan_date)
    if len(assigned_rows) >= capacity:
        return None

    work_start = to_minutes(details["working_start"])
    work_end = to_minutes(details["working_end"])
    candidate_start = work_start + (
        details["existing_workload"] * TASK_DURATION_MINUTES
    )
    while candidate_start + TASK_DURATION_MINUTES <= work_end:
        candidate_end = candidate_start + TASK_DURATION_MINUTES
        conflict = any(
            overlaps(
                candidate_start,
                candidate_end,
                to_minutes(row["start_time"]),
                to_minutes(row["end_time"]),
            )
            for row in assigned_rows
            if row.get("start_time") and row.get("end_time")
        )
        if not conflict:
            return candidate_start, candidate_end
        candidate_start += TASK_DURATION_MINUTES
    return None


def _set_appointment(row, phi_id, details, slot, plan_date, reason):
    start, end = slot
    row.update({
        "planning_date": plan_date,
        "assigned_phi": phi_id,
        "phi_range": details["phi_range"],
        "start_time": to_clock(start),
        "end_time": to_clock(end),
        "status": "Scheduled",
        "reason": reason,
    })


def _find_slot_across_days(task, plan, daily_by_date, start_date):
    """Search from start_date forward, then across available PHIs per date."""
    for plan_date in sorted(date for date in daily_by_date if date >= start_date):
        phi_daily = daily_by_date[plan_date]
        candidates = sorted(
            phi_daily.items(),
            key=lambda item: (
                len(_rows_for_phi_date(plan, item[0], plan_date)),
                item[0],
            ),
        )
        for phi_id, details in candidates:
            task_area = task.get("moh_area")
            phi_area = details.get("moh_area")
            if task_area and phi_area and str(task_area).strip().casefold() != str(phi_area).strip().casefold():
                continue
            slot = find_free_slot(phi_id, details, plan, plan_date)
            if slot is not None:
                return plan_date, phi_id, details, slot
    return None


def replan_deferred_tasks(plan, daily_by_date, start_date):
    """Try to schedule tasks deferred by the urgent complaint on a later slot."""
    deferred_rows = sorted(
        [
            row for row in plan
            if row.get("status") == "Unscheduled"
            and row.get("task_status") == "Pending"
            and row.get("reason", "").startswith(DEFERRED_REASON_PREFIX)
        ],
        key=priority_key,
    )
    for row in deferred_rows:
        candidate = _find_slot_across_days(row, plan, daily_by_date, start_date)
        if candidate is None:
            row["reason"] = (
                DEFERRED_REASON_PREFIX
                + "; no feasible slot found in the modeled planning horizon"
            )
            continue
        plan_date, phi_id, details, slot = candidate
        _set_appointment(
            row, phi_id, details, slot, plan_date,
            "Replanned after urgent complaint; assigned to earliest feasible slot",
        )
    return plan


def insert_urgent_complaint(plan, phi_daily, plan_date):
    """Insert a new urgent task, deferring lower-priority pending work if needed."""
    result = [dict(row) for row in plan]
    if any(row.get("scenario_task_id") == URGENT_TASK_ID for row in result):
        raise ValueError(f"Duplicate scenario task ID: {URGENT_TASK_ID}")

    for row in result:
        row["task_status"] = row.get("task_status") or "Pending"

    task = {key: "" for key in result[0]} if result else {}
    task.update({
        "scenario_task_id": URGENT_TASK_ID,
        "source_id": "SYNTHETIC-NEW-COMPLAINT",
        "task_type": "Citizen Complaint",
        "priority_score": "90",
        "priority_level": "High",
        "location_id": "LOC007",
        "phi_range": "Malabe Range",
        "village_area": "Synthetic Test Location",
        "planning_date": plan_date,
        "assigned_phi": "",
        "start_time": "",
        "end_time": "",
        "status": "Unscheduled",
        "reason": "No feasible slot found",
        "task_status": "Pending",
    })

    def assign_urgent(phi_id, details, slot, reason):
        _set_appointment(task, phi_id, details, slot, plan_date, reason)

    candidates = sorted(
        phi_daily.items(),
        key=lambda item: (
            len(_rows_for_phi_date(result, item[0], plan_date)),
            item[0],
        ),
    )
    for phi_id, details in candidates:
        slot = find_free_slot(phi_id, details, result, plan_date)
        if slot is not None:
            assign_urgent(
                phi_id, details, slot,
                "Inserted into a free slot; existing appointments preserved",
            )
            result.append(task)
            return result

    urgent_key = priority_key(task)
    eligible = [
        row for row in result
        if row.get("status") == "Scheduled"
        and row.get("task_status") == "Pending"
        and row.get("planning_date") == plan_date
        and row.get("assigned_phi")
        and row.get("start_time")
        and row.get("end_time")
        and priority_key(row) > urgent_key
    ]
    eligible.sort(
        key=lambda row: (
            -PRIORITY_ORDER[row["priority_level"]],
            float(row.get("priority_score") or 0),
            row.get("scenario_task_id", ""),
        )
    )

    for victim in eligible:
        phi_id = victim["assigned_phi"]
        slot = (to_minutes(victim["start_time"]), to_minutes(victim["end_time"]))
        victim["assigned_phi"] = ""
        victim["start_time"] = ""
        victim["end_time"] = ""
        victim["status"] = "Unscheduled"
        victim["reason"] = DEFERRED_REASON_PREFIX + "; awaiting adaptive replanning"
        assign_urgent(
            phi_id, phi_daily[phi_id], slot,
            f"Inserted by deferring lower-priority Pending task "
            f"{victim['scenario_task_id']}",
        )
        result.append(task)
        return result

    result.append(task)
    return result


def _normalize_daily_by_date(daily_data, original, updated):
    """Accept either {date: {phi_id: details}} or legacy {phi_id: details}."""
    if not daily_data:
        return {}
    first_value = next(iter(daily_data.values()))
    if isinstance(first_value, dict) and "availability" in first_value:
        # Legacy one-day PHI dictionary; infer the date from the plan rows.
        dates = {
            row.get("planning_date", "")
            for row in list(original) + list(updated)
            if row.get("planning_date")
        }
        if not dates:
            raise AssertionError("Cannot infer planning date for legacy PHI data")
        if len(dates) != 1:
            raise AssertionError(
                "Legacy PHI data can only validate a single planning date"
            )
        return {next(iter(dates)): daily_data}
    return daily_data


def validate_plan(original, updated, phi_daily):
    """Validate preservation, date-specific capacity, working hours and conflicts."""
    daily_by_date = _normalize_daily_by_date(phi_daily, original, updated)
    original_by_id = {row["scenario_task_id"]: row for row in original}
    updated_by_id = {row["scenario_task_id"]: row for row in updated}
    assert len(updated_by_id) == len(updated), "Duplicate task IDs"
    assert set(original_by_id).issubset(updated_by_id), "Original task lost"

    for task_id, old_row in original_by_id.items():
        new_row = updated_by_id[task_id]
        deferred_or_replanned = (
            old_row.get("task_status", "Pending") == "Pending"
            and (
                new_row.get("reason", "").startswith(DEFERRED_REASON_PREFIX)
                or new_row.get("reason", "").startswith("Replanned after urgent complaint")
                or old_row.get("reason", "").startswith(DEFERRED_REASON_PREFIX)
            )
        )
        if deferred_or_replanned:
            assert old_row.get("task_status", "Pending") == "Pending", (
                f"Protected task was deferred: {task_id}"
            )
            continue

        for field in ("assigned_phi", "start_time", "end_time", "status", "planning_date"):
            assert new_row.get(field, "") == old_row.get(field, ""), (
                f"Existing task changed unexpectedly: {task_id}, {field}"
            )

    scheduled = [row for row in updated if row.get("status") == "Scheduled"]
    grouped = defaultdict(list)
    for row in scheduled:
        plan_date = row.get("planning_date", "")
        phi_id = row.get("assigned_phi", "")
        assert plan_date in daily_by_date, (
            f"No modeled availability for {plan_date}: {row['scenario_task_id']}"
        )
        assert phi_id in daily_by_date[plan_date], (
            f"Unknown PHI {phi_id} on {plan_date}"
        )
        details = daily_by_date[plan_date][phi_id]
        assert details["availability"].strip().lower() == "available", (
            f"Unavailable PHI assigned: {row['scenario_task_id']}"
        )
        start, end = to_minutes(row["start_time"]), to_minutes(row["end_time"])
        assert end - start == TASK_DURATION_MINUTES
        assert start >= to_minutes(details["working_start"])
        assert end <= to_minutes(details["working_end"])
        grouped[(plan_date, phi_id)].append(row)

    for (plan_date, phi_id), phi_rows in grouped.items():
        details = daily_by_date[plan_date][phi_id]
        capacity = max(0, details["daily_capacity"] - details["existing_workload"])
        assert len(phi_rows) <= capacity, (
            f"Remaining capacity exceeded for {phi_id} on {plan_date}"
        )
        phi_rows.sort(key=lambda row: to_minutes(row["start_time"]))
        for previous, current in zip(phi_rows, phi_rows[1:]):
            assert not overlaps(
                to_minutes(previous["start_time"]), to_minutes(previous["end_time"]),
                to_minutes(current["start_time"]), to_minutes(current["end_time"]),
            ), f"Appointment conflict for {phi_id} on {plan_date}"


def main():
    parser = argparse.ArgumentParser(
        description="Simulate adaptive insertion and replanning of an urgent complaint."
    )
    parser.add_argument("--date", default="2026-04-01")
    parser.add_argument(
        "--assume-all-pending", action="store_true",
        help="Explicitly assume all original tasks are pending in this synthetic simulation.",
    )
    args = parser.parse_args()
    if not args.assume_all_pending:
        parser.error(
            "The generated schedule has no execution statuses. "
            "Use --assume-all-pending only for this synthetic simulation."
        )
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Research database not found: {DB_PATH}")

    plan_path = PLAN_DIR / f"phi_plan_{args.date}.csv"
    if not plan_path.exists():
        raise FileNotFoundError(f"Schedule not found: {plan_path}. Run phi_scheduler.py first.")
    original = read_csv(plan_path)
    if not original:
        raise ValueError("The original schedule contains no tasks.")

    current_daily = read_phi_daily(args.date)
    updated = insert_urgent_complaint(original, current_daily, args.date)
    all_daily = read_future_phi_daily(args.date)
    updated = replan_deferred_tasks(updated, all_daily, args.date)
    validate_plan(original, updated, all_daily)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"urgent_complaint_scenario_{args.date}.csv"
    with output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(updated[0].keys()))
        writer.writeheader()
        writer.writerows(updated)

    urgent = next(row for row in updated if row["scenario_task_id"] == URGENT_TASK_ID)
    deferred_rows = [
        row for row in updated
        if row.get("reason", "").startswith(DEFERRED_REASON_PREFIX)
        or row.get("reason", "").startswith("Replanned after urgent complaint")
    ]
    replanned_rows = [
        row for row in updated
        if row.get("status") == "Scheduled"
        and row.get("reason", "").startswith("Replanned after urgent complaint")
    ]
    still_unscheduled = [
        row for row in updated
        if row.get("status") == "Unscheduled"
        and row.get("reason", "").startswith(DEFERRED_REASON_PREFIX)
    ]

    print("ADAPTIVE URGENT COMPLAINT SCENARIO")
    print("Planning date:", args.date)
    print("Original tasks:", len(original))
    print("Tasks after scenario:", len(updated))
    print("Urgent complaint status:", urgent["status"])
    print("Urgent complaint PHI:", urgent["assigned_phi"] or "None")
    print(
        "Urgent complaint appointment:",
        f"{urgent['planning_date']} {urgent['start_time']}-{urgent['end_time']}"
        if urgent["start_time"] else "No available slot",
    )
    print("Deferred/replanned tasks:", len(deferred_rows))
    print("Deferred tasks successfully replanned:", len(replanned_rows))
    print("Deferred tasks still unscheduled:", len(still_unscheduled))
    print("PASS: preservation, availability, date-specific capacity, hours and conflicts validated")
    print("Output:", output_path)
    print("Source database and original schedule were not modified.")
    print(
        "Scheduled priority counts:",
        dict(Counter(row["priority_level"] for row in updated if row["status"] == "Scheduled")),
    )


if __name__ == "__main__":
    main()
