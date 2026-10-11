
"""Prototype for rescheduling tasks when a PHI becomes unavailable.

Uses synthetic research data. Does not modify the source database
or overwrite the original schedule.
"""

import argparse
import csv
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"
PLAN_DIR = ROOT / "optimization" / "output"
OUTPUT_DIR = ROOT / "rescheduling" / "output"

TASK_DURATION_MINUTES = 45


def read_csv(path):
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def read_phi_daily(plan_date):
    """Read modeled PHI availability, hours and capacity for a date."""
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
    parsed = datetime.strptime(value, "%H:%M")
    return parsed.hour * 60 + parsed.minute


def minutes_to_time(value):
    return f"{value // 60:02d}:{value % 60:02d}"


def overlaps(start_a, end_a, start_b, end_b):
    return start_a < end_b and start_b < end_a


def reschedule_tasks(plan, phi_daily, unavailable_phi):
    """Reassign affected tasks when capacity and free time permit."""
    result = [dict(row) for row in plan]
    scheduled = [
        row for row in result if row["status"] == "Scheduled"
    ]

    if unavailable_phi not in phi_daily:
        raise ValueError(f"Unknown PHI: {unavailable_phi}")

    if phi_daily[unavailable_phi]["availability"] != "Available":
        # A PHI may already be marked unavailable in the source data.
        pass

    affected = [
        row for row in scheduled
        if row["assigned_phi"] == unavailable_phi
    ]

    # Completed tasks are never moved.
    affected = [
        row for row in affected
        if row.get("task_status", "").strip().lower() != "completed"
    ]

    for row in affected:
        row["status"] = "Pending rescheduling"
        row["reason"] = f"{unavailable_phi} unavailable; reassignment pending"

    # Do not treat the unavailable PHI's tasks as occupying its schedule.
    for row in result:
        if row in affected:
            row["assigned_phi"] = ""
            row["start_time"] = ""
            row["end_time"] = ""

    # Candidate PHIs must be available and different from the unavailable PHI.
    candidates = [
        phi_id for phi_id, details in phi_daily.items()
        if phi_id != unavailable_phi
        and details["availability"] == "Available"
        and details["daily_capacity"] > details["existing_workload"]
    ]

    # Higher-priority tasks are attempted first; retain stable order within tiers.
    priority_order = {"High": 0, "Medium": 1, "Low": 2}
    affected.sort(
        key=lambda row: (
            priority_order.get(row.get("priority_level", ""), 99),
            -float(row.get("priority_score") or 0),
        )
    )

    assigned_counts = Counter(
        row["assigned_phi"]
        for row in result
        if row["status"] == "Scheduled" and row["assigned_phi"]
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

            # Search in 45-minute increments from the modeled workday start.
            candidate_start = work_start
            while candidate_start + TASK_DURATION_MINUTES <= work_end:
                candidate_end = candidate_start + TASK_DURATION_MINUTES

                has_conflict = False
                for other in result:
                    if (
                        other["status"] != "Scheduled"
                        or other["assigned_phi"] != phi_id
                        or not other["start_time"]
                        or not other["end_time"]
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default="2026-04-01")
    parser.add_argument("--unavailable-phi", required=True)
    args = parser.parse_args()

    plan_path = PLAN_DIR / f"phi_plan_{args.date}.csv"
    if not plan_path.exists():
        raise FileNotFoundError(
            f"Schedule not found: {plan_path}. Run phi_scheduler.py first."
        )

    plan = read_csv(plan_path)
    phi_daily = read_phi_daily(args.date)

    updated = reschedule_tasks(
        plan,
        phi_daily,
        args.unavailable_phi,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = (
        OUTPUT_DIR / f"rescheduled_phi_plan_{args.date}.csv"
    )

    if updated:
        with output_path.open(
            "w", newline="", encoding="utf-8"
        ) as file:
            writer = csv.DictWriter(
                file, fieldnames=list(updated[0].keys())
            )
            writer.writeheader()
            writer.writerows(updated)

    print("ADAPTIVE PHI RESCHEDULING PROTOTYPE")
    print("Planning date:", args.date)
    print("Unavailable PHI:", args.unavailable_phi)
    print("Original scheduled tasks:", sum(
        row["status"] == "Scheduled" for row in plan
    ))
    print("Scheduled after rescheduling:", sum(
        row["status"] == "Scheduled" for row in updated
    ))
    print("Unscheduled tasks:", sum(
        row["status"] == "Unscheduled" for row in updated
    ))
    print("Output:", output_path)
    print("Source database and original schedule were not modified.")


if __name__ == "__main__":
    main()
