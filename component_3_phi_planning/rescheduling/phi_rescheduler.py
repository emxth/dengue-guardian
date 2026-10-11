
"""Adaptive PHI rescheduling prototype.

Uses synthetic research data. Does not modify the source database
or overwrite the original schedule.

Execution statuses:
- Pending: can be reassigned.
- In Progress: protected from reassignment.
- Completed: protected from reassignment.

The current generated schedule does not contain execution status.
Use --assume-all-pending only for an explicitly simulated scenario.
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

VALID_TASK_STATUSES = {
    "pending": "Pending",
    "in progress": "In Progress",
    "completed": "Completed",
}

PRIORITY_ORDER = {
    "High": 0,
    "Medium": 1,
    "Low": 2,
}


def read_csv(path):
    """Read a CSV file as a list of dictionaries."""
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def read_phi_daily(plan_date):
    """Read modeled PHI availability, working hours and capacity."""
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT phi_id, availability, working_start, working_end,
                   daily_capacity, existing_workload
            FROM PHI_Daily
            WHERE date = ?
            """,
            (plan_date,),
        ).fetchall()

    return {
        row[0]: {
            "availability": row[1],
            "working_start": row[2],
            "working_end": row[3],
            "daily_capacity": int(row[4]),
            "existing_workload": int(row[5]),
        }
        for row in rows
    }


def time_to_minutes(value):
    """Convert HH:MM into minutes after midnight."""
    parsed = datetime.strptime(value, "%H:%M")
    return parsed.hour * 60 + parsed.minute


def minutes_to_time(value):
    """Convert minutes after midnight into HH:MM."""
    return f"{value // 60:02d}:{value % 60:02d}"


def overlaps(start_a, end_a, start_b, end_b):
    """Return True when two appointment intervals overlap."""
    return start_a < end_b and start_b < end_a


def normalize_task_statuses(plan, assume_all_pending=False):
    """Validate execution statuses without silently assuming their values."""
    result = [dict(row) for row in plan]

    for row in result:
        raw_status = row.get("task_status", "").strip()

        if not raw_status:
            if not assume_all_pending:
                task_id = row.get("scenario_task_id", "unknown task")
                raise ValueError(
                    f"Execution status is missing for {task_id}. "
                    "Provide task_status values or explicitly use "
                    "--assume-all-pending for a synthetic simulation."
                )

            row["task_status"] = "Pending"
            continue

        normalized = raw_status.lower()

        if normalized not in VALID_TASK_STATUSES:
            task_id = row.get("scenario_task_id", "unknown task")
            raise ValueError(
                f"Invalid task_status '{raw_status}' for {task_id}. "
                "Allowed values: Pending, In Progress, Completed."
            )

        row["task_status"] = VALID_TASK_STATUSES[normalized]

    return result


def reschedule_tasks(
    plan,
    phi_daily,
    unavailable_phi,
    assume_all_pending=False,
):
    """Reassign pending tasks when a PHI becomes unavailable.

    Completed and in-progress tasks are not reassigned. The input plan
    is copied, so the original list and its dictionaries remain unchanged.
    """
    if unavailable_phi not in phi_daily:
        raise ValueError(f"Unknown PHI: {unavailable_phi}")

    result = normalize_task_statuses(
        plan,
        assume_all_pending=assume_all_pending,
    )

    # Only pending, scheduled tasks assigned to the unavailable PHI
    # are eligible for reassignment.
    affected = [
        row for row in result
        if row.get("status") == "Scheduled"
        and row.get("assigned_phi") == unavailable_phi
        and row.get("task_status") == "Pending"
    ]

    # Remove affected tasks from their original slots.
    for row in affected:
        row["status"] = "Pending rescheduling"
        row["reason"] = (
            f"{unavailable_phi} unavailable; pending task needs reassignment"
        )
        row["assigned_phi"] = ""
        row["start_time"] = ""
        row["end_time"] = ""

    # Only available PHIs with modeled remaining task capacity are candidates.
    candidates = [
        phi_id
        for phi_id, details in phi_daily.items()
        if phi_id != unavailable_phi
        and details["availability"] == "Available"
        and details["daily_capacity"] > details["existing_workload"]
    ]

    # Attempt high-priority tasks first; then use descending score.
    affected.sort(
        key=lambda row: (
            PRIORITY_ORDER.get(row.get("priority_level", ""), 99),
            -float(row.get("priority_score") or 0),
            row.get("scenario_task_id", ""),
        )
    )

    # Count already scheduled tasks assigned to each PHI.
    assigned_counts = Counter(
        row["assigned_phi"]
        for row in result
        if row.get("status") == "Scheduled" and row.get("assigned_phi")
    )

    for task in affected:
        choices = []

        for phi_id in candidates:
            details = phi_daily[phi_id]

            capacity_left = (
                details["daily_capacity"]
                - details["existing_workload"]
                - assigned_counts[phi_id]
            )

            if capacity_left <= 0:
                continue

            work_start = time_to_minutes(details["working_start"])
            work_end = time_to_minutes(details["working_end"])

            candidate_start = work_start

            while candidate_start + TASK_DURATION_MINUTES <= work_end:
                candidate_end = candidate_start + TASK_DURATION_MINUTES
                has_conflict = False

                # Existing scheduled tasks, including protected tasks,
                # reserve their appointment intervals.
                for other in result:
                    if (
                        other.get("status") != "Scheduled"
                        or other.get("assigned_phi") != phi_id
                        or not other.get("start_time")
                        or not other.get("end_time")
                    ):
                        continue

                    if overlaps(
                        candidate_start,
                        candidate_end,
                        time_to_minutes(other["start_time"]),
                        time_to_minutes(other["end_time"]),
                    ):
                        has_conflict = True
                        break

                if not has_conflict:
                    choices.append(
                        (
                            assigned_counts[phi_id],
                            candidate_start,
                            phi_id,
                            candidate_end,
                        )
                    )
                    break

                candidate_start += TASK_DURATION_MINUTES

        if not choices:
            task["status"] = "Unscheduled"
            task["reason"] = (
                "No available PHI has both remaining capacity "
                "and a free 45-minute slot."
            )
            continue

        _, start, phi_id, end = min(choices)

        task["assigned_phi"] = phi_id
        task["start_time"] = minutes_to_time(start)
        task["end_time"] = minutes_to_time(end)
        task["status"] = "Scheduled"
        task["reason"] = f"Reassigned from unavailable {unavailable_phi}"

        assigned_counts[phi_id] += 1

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Simulate adaptive PHI task rescheduling."
    )
    parser.add_argument(
        "--date",
        default="2026-04-01",
        help="Planning date in YYYY-MM-DD format.",
    )
    parser.add_argument(
        "--unavailable-phi",
        required=True,
        help="PHI identifier that becomes unavailable.",
    )
    parser.add_argument(
        "--assume-all-pending",
        action="store_true",
        help=(
            "Explicitly simulate that all tasks are pending when "
            "execution status is missing."
        ),
    )

    args = parser.parse_args()

    plan_path = PLAN_DIR / f"phi_plan_{args.date}.csv"

    if not plan_path.exists():
        raise FileNotFoundError(
            f"Schedule not found: {plan_path}. Run phi_scheduler.py first."
        )

    if not DB_PATH.exists():
        raise FileNotFoundError(f"Research database not found: {DB_PATH}")

    plan = read_csv(plan_path)
    phi_daily = read_phi_daily(args.date)

    updated = reschedule_tasks(
        plan,
        phi_daily,
        args.unavailable_phi,
        assume_all_pending=args.assume_all_pending,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"rescheduled_phi_plan_{args.date}.csv"

    if updated:
        # Preserve the existing fields and include task_status if needed.
        fieldnames = list(updated[0].keys())

        if "task_status" not in fieldnames:
            fieldnames.append("task_status")

        with output_path.open(
            "w",
            newline="",
            encoding="utf-8",
        ) as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(updated)

    print("ADAPTIVE PHI RESCHEDULING PROTOTYPE")
    print("Planning date:", args.date)
    print("Unavailable PHI:", args.unavailable_phi)
    print(
        "Execution-status mode:",
        "Assumed pending (synthetic scenario)"
        if args.assume_all_pending
        else "Provided in input data",
    )
    print(
        "Original scheduled tasks:",
        sum(row.get("status") == "Scheduled" for row in plan),
    )
    print(
        "Scheduled after rescheduling:",
        sum(row.get("status") == "Scheduled" for row in updated),
    )
    print(
        "Unscheduled tasks:",
        sum(row.get("status") == "Unscheduled" for row in updated),
    )
    print(
        "Protected completed tasks:",
        sum(row.get("task_status") == "Completed" for row in updated),
    )
    print(
        "Protected in-progress tasks:",
        sum(row.get("task_status") == "In Progress" for row in updated),
    )
    print("Output:", output_path)
    print("Source database and original schedule were not modified.")


if __name__ == "__main__":
    main()
