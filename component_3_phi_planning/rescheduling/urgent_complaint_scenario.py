
"""Isolated synthetic scenario for adaptive urgent-complaint scheduling.

The source database and original schedule are read-only.
A lower-priority Pending task may be deferred if no free slot exists.
In-progress and completed tasks are protected.
"""

import argparse
import csv
import sqlite3
from collections import Counter
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"
PLAN_DIR = ROOT / "optimization" / "output"
OUTPUT_DIR = ROOT / "rescheduling" / "output"

TASK_DURATION_MINUTES = 45
URGENT_TASK_ID = "SIM-URGENT-COMPLAINT-001"

PRIORITY_ORDER = {"High": 0, "Medium": 1, "Low": 2}


def read_csv(path):
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def read_phi_daily(plan_date):
    """Load modeled PHI availability and capacity for the selected date."""
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT phi_id, phi_range, availability, working_start,
                   working_end, daily_capacity, existing_workload
            FROM PHI_Daily
            WHERE date = ?
            ORDER BY phi_id
            """,
            (plan_date,),
        ).fetchall()

    if not rows:
        raise ValueError(f"No PHI availability data for {plan_date}.")

    return {
        row[0]: {
            "phi_range": row[1],
            "availability": row[2],
            "working_start": row[3],
            "working_end": row[4],
            "daily_capacity": int(row[5]),
            "existing_workload": int(row[6]),
        }
        for row in rows
    }


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


def find_free_slot(phi_id, details, plan):
    """Find a valid 45-minute slot within modeled capacity."""
    if details["availability"].strip().lower() != "available":
        return None

    capacity = max(
        0, details["daily_capacity"] - details["existing_workload"]
    )
    assigned_rows = [
        row for row in plan
        if row.get("status") == "Scheduled"
        and row.get("assigned_phi") == phi_id
    ]

    if len(assigned_rows) >= capacity:
        return None

    work_start = to_minutes(details["working_start"])
    work_end = to_minutes(details["working_end"])

    # Synthetic assumption: existing workload occupies 45-minute slots
    # at the beginning of the modeled working day.
    candidate_start = (
        work_start + details["existing_workload"] * TASK_DURATION_MINUTES
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


def insert_urgent_complaint(plan, phi_daily, plan_date):
    """Insert a new urgent task, deferring lower-priority pending work if needed."""
    result = [dict(row) for row in plan]

    if any(
        row.get("scenario_task_id") == URGENT_TASK_ID for row in result
    ):
        raise ValueError(f"Duplicate scenario task ID: {URGENT_TASK_ID}")

    # The caller must explicitly treat missing statuses as Pending only
    # for this synthetic simulation. Real execution status must be supplied.
    for row in result:
        row["task_status"] = row.get("task_status") or "Pending"

    task = {
        key: "" for key in result[0]
    } if result else {}

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

    def assign_task(phi_id, slot, reason):
        start, end = slot
        task.update({
            "assigned_phi": phi_id,
            "phi_range": phi_daily[phi_id]["phi_range"],
            "start_time": to_clock(start),
            "end_time": to_clock(end),
            "status": "Scheduled",
            "reason": reason,
        })

    # First, try to insert the urgent task without changing existing work.
    candidates = sorted(
        phi_daily.items(),
        key=lambda item: (
            sum(
                row.get("status") == "Scheduled"
                and row.get("assigned_phi") == item[0]
                for row in result
            ),
            item[0],
        ),
    )

    for phi_id, details in candidates:
        slot = find_free_slot(phi_id, details, result)
        if slot is not None:
            assign_task(
                phi_id,
                slot,
                "Inserted into a free slot; existing appointments preserved",
            )
            result.append(task)
            return result

    # No free slot: consider only scheduled Pending tasks strictly below
    # the urgent task in the priority ordering.
    urgent_key = priority_key(task)
    eligible = [
        row for row in result
        if row.get("status") == "Scheduled"
        and row.get("task_status") == "Pending"
        and row.get("assigned_phi")
        and row.get("start_time")
        and row.get("end_time")
        and priority_key(row) > urgent_key
    ]

    # Lowest-priority tasks first; ties are resolved deterministically.
    eligible.sort(
        key=lambda row: (
            -PRIORITY_ORDER[row["priority_level"]],
            float(row.get("priority_score") or 0),
            row.get("scenario_task_id", ""),
        )
    )

    for victim in eligible:
        phi_id = victim["assigned_phi"]
        slot = (
            to_minutes(victim["start_time"]),
            to_minutes(victim["end_time"]),
        )

        # Defer only this Pending task. Do not move higher-priority,
        # In Progress, or Completed appointments.
        victim["assigned_phi"] = ""
        victim["start_time"] = ""
        victim["end_time"] = ""
        victim["status"] = "Unscheduled"
        victim["reason"] = (
            "Deferred to accommodate a higher-priority urgent complaint; "
            "requires later replanning"
        )

        # Reuse the freed appointment for the new urgent complaint.
        assign_task(
            phi_id,
            slot,
            f"Inserted by deferring lower-priority Pending task "
            f"{victim['scenario_task_id']}",
        )
        result.append(task)
        return result

    result.append(task)
    return result


def validate_plan(original, updated, phi_daily):
    """Validate preservation, capacity, working hours and conflicts."""
    original_by_id = {row["scenario_task_id"]: row for row in original}
    updated_by_id = {row["scenario_task_id"]: row for row in updated}

    assert len(updated_by_id) == len(updated), "Duplicate task IDs"
    assert set(original_by_id).issubset(updated_by_id), "Original task lost"

    for task_id, old_row in original_by_id.items():
        new_row = updated_by_id[task_id]

        deferred = (
            new_row.get("status") == "Unscheduled"
            and new_row.get("task_status") == "Pending"
            and new_row.get("reason", "").startswith(
                "Deferred to accommodate a higher-priority urgent complaint"
            )
        )

        if deferred:
            assert old_row.get("task_status", "Pending") == "Pending", (
                f"Protected task was deferred: {task_id}"
            )
            continue

        for field in ("assigned_phi", "start_time", "end_time", "status"):
            assert new_row.get(field, "") == old_row.get(field, ""), (
                f"Existing task changed unexpectedly: {task_id}, {field}"
            )

    scheduled = [
        row for row in updated if row.get("status") == "Scheduled"
    ]

    for row in scheduled:
        phi_id = row["assigned_phi"]
        assert phi_id in phi_daily, f"Unknown PHI: {phi_id}"
        details = phi_daily[phi_id]

        assert details["availability"].strip().lower() == "available", (
            f"Unavailable PHI assigned: {row['scenario_task_id']}"
        )

        start = to_minutes(row["start_time"])
        end = to_minutes(row["end_time"])

        assert end - start == TASK_DURATION_MINUTES
        assert start >= to_minutes(details["working_start"])
        assert end <= to_minutes(details["working_end"])

    for phi_id, details in phi_daily.items():
        phi_rows = [
            row for row in scheduled if row["assigned_phi"] == phi_id
        ]
        capacity = max(
            0, details["daily_capacity"] - details["existing_workload"]
        )
        assert len(phi_rows) <= capacity, (
            f"Remaining capacity exceeded for {phi_id}"
        )

        phi_rows.sort(key=lambda row: to_minutes(row["start_time"]))
        for previous, current in zip(phi_rows, phi_rows[1:]):
            assert not overlaps(
                to_minutes(previous["start_time"]),
                to_minutes(previous["end_time"]),
                to_minutes(current["start_time"]),
                to_minutes(current["end_time"]),
            ), f"Appointment conflict for {phi_id}"


def main():
    parser = argparse.ArgumentParser(
        description="Test adaptive insertion of a synthetic urgent complaint."
    )
    parser.add_argument("--date", default="2026-04-01")
    parser.add_argument(
        "--assume-all-pending",
        action="store_true",
        help="Explicitly assume all original tasks are pending in this simulation.",
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
        raise FileNotFoundError(
            f"Schedule not found: {plan_path}. Run phi_scheduler.py first."
        )

    original = read_csv(plan_path)
    if not original:
        raise ValueError("The original schedule contains no tasks.")

    phi_daily = read_phi_daily(args.date)
    updated = insert_urgent_complaint(original, phi_daily, args.date)
    validate_plan(original, updated, phi_daily)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"urgent_complaint_scenario_{args.date}.csv"

    with output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(updated[0].keys()))
        writer.writeheader()
        writer.writerows(updated)

    urgent = next(
        row for row in updated
        if row["scenario_task_id"] == URGENT_TASK_ID
    )

    print("ADAPTIVE URGENT COMPLAINT SCENARIO")
    print("Planning date:", args.date)
    print("Original tasks:", len(original))
    print("Tasks after scenario:", len(updated))
    print("Urgent complaint status:", urgent["status"])
    print("Urgent complaint PHI:", urgent["assigned_phi"] or "None")
    print(
        "Urgent complaint appointment:",
        f"{urgent['start_time']}-{urgent['end_time']}"
        if urgent["start_time"] else "No available slot",
    )
    print(
        "Deferred existing tasks:",
        sum(
            row.get("reason", "").startswith(
                "Deferred to accommodate a higher-priority urgent complaint"
            )
            for row in updated
        ),
    )
    print("PASS: task preservation, capacity, hours and conflicts validated")
    print("Output:", output_path)
    print("Source database and original schedule were not modified.")
    print(
        "Scheduled priority counts:",
        dict(Counter(
            row["priority_level"]
            for row in updated if row["status"] == "Scheduled"
        )),
    )


if __name__ == "__main__":
    main()
