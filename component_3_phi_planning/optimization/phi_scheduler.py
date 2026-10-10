
"""Initial PHI allocation and scheduling prototype using OR-Tools."""

import argparse
import csv
import sqlite3
from pathlib import Path

from ortools.sat.python import cp_model


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PRIORITY_DIR = ROOT / "prioritization" / "output"
OUTPUT_DIR = ROOT / "optimization" / "output"

DB_PATH = DATA_DIR / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"

# Explicit synthetic modeling assumptions for the first prototype.
DEFAULT_DATE = "2026-04-01"
TASK_DURATION_MIN = 45
MAX_CASE_TASKS = 30
MAX_COMPLAINT_TASKS = 20


def read_csv(path):
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def load_tasks():
    """Build a separate hypothetical batch; do not reuse history as pending work."""
    case_scores = read_csv(PRIORITY_DIR / "case_priority_scores.csv")
    complaint_scores = read_csv(PRIORITY_DIR / "complaint_priority_scores.csv")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    cases = {
        row["task_id"]: dict(row)
        for row in conn.execute("SELECT * FROM Case_Notifications")
    }
    complaints = {
        row["complaint_id"]: dict(row)
        for row in conn.execute("SELECT * FROM Citizen_Complaints")
    }
    conn.close()

    case_scores.sort(
        key=lambda r: float(r["priority_score"]), reverse=True
    )
    complaint_scores.sort(
        key=lambda r: float(r["priority_score"]), reverse=True
    )

    tasks = []

    for score_row in case_scores[:MAX_CASE_TASKS]:
        source_id = score_row["task_id"]
        source = cases[source_id]

        tasks.append({
            "scenario_task_id": f"SIM-CASE-{source_id}",
            "source_id": source_id,
            "task_type": "Dengue Case Inspection",
            "priority_score": float(score_row["priority_score"]),
            "priority_level": score_row["priority_level"],
            "location_id": source["location_id"],
            "phi_range": source["phi_range"],
            "village_area": source["village_area"],
        })

    complaint_count = 0
    for score_row in complaint_scores:
        source_id = score_row["task_id"]
        source = complaints[source_id]

        # Closed complaints must not be added to this simulated task batch.
        if source["status"].strip().lower() == "closed":
            continue

        tasks.append({
            "scenario_task_id": f"SIM-COMPLAINT-{source_id}",
            "source_id": source_id,
            "task_type": "Citizen Complaint",
            "priority_score": float(score_row["priority_score"]),
            "priority_level": score_row["priority_level"],
            "location_id": source["location_id"],
            "phi_range": source["phi_range"],
            "village_area": source["village_area"],
        })

        complaint_count += 1
        if complaint_count >= MAX_COMPLAINT_TASKS:
            break

    # Numeric scores are provisional across task types; this ordering is a
    # prototype assumption, not a validated operational priority policy.
    tasks.sort(key=lambda t: t["priority_score"], reverse=True)
    return tasks


def load_phis(plan_date):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        """
        SELECT phi_id, phi_range, availability, working_start, working_end,
               daily_capacity, existing_workload
        FROM PHI_Daily
        WHERE date = ?
        ORDER BY phi_id
        """,
        (plan_date,),
    ).fetchall()
    conn.close()

    if not rows:
        raise ValueError(
            f"No PHI availability data for {plan_date}. "
            "Choose a date from 2026-04-01 to 2026-09-30."
        )

    phis = []
    for row in rows:
        phi = dict(row)
        phi["remaining_capacity"] = max(
            0, int(phi["daily_capacity"]) - int(phi["existing_workload"])
        )

        if phi["availability"].strip().lower() == "available":
            phis.append(phi)

    return phis


def to_minutes(clock):
    hours, minutes = map(int, clock.split(":"))
    return hours * 60 + minutes


def solve_schedule(tasks, phis, plan_date):
    model = cp_model.CpModel()
    variables = {}
    intervals = {phi["phi_id"]: [] for phi in phis}

    for task_index, task in enumerate(tasks):
        for phi in phis:
            phi_id = phi["phi_id"]

            if phi["remaining_capacity"] <= 0:
                continue

            day_start = to_minutes(phi["working_start"])
            day_end = to_minutes(phi["working_end"])

            # Simplified carry-in workload assumption: reserve 45 minutes
            # per existing task at the start of the modeled working day.
            earliest = day_start + (
                int(phi["existing_workload"]) * TASK_DURATION_MIN
            )
            latest = day_end

            if earliest + TASK_DURATION_MIN > latest:
                continue

            assigned = model.NewBoolVar(f"assign_{task_index}_{phi_id}")
            start = model.NewIntVar(
                earliest, latest - TASK_DURATION_MIN,
                f"start_{task_index}_{phi_id}",
            )
            end = model.NewIntVar(
                earliest + TASK_DURATION_MIN, latest,
                f"end_{task_index}_{phi_id}",
            )
            interval = model.NewOptionalIntervalVar(
                start, TASK_DURATION_MIN, end, assigned,
                f"interval_{task_index}_{phi_id}",
            )

            variables[(task_index, phi_id)] = {
                "assigned": assigned,
                "start": start,
                "end": end,
            }
            intervals[phi_id].append(interval)

    # A task can be assigned to at most one PHI.
    for task_index in range(len(tasks)):
        candidates = [
            item["assigned"]
            for (idx, _), item in variables.items()
            if idx == task_index
        ]
        if candidates:
            model.Add(sum(candidates) <= 1)

    # Enforce capacity and prevent overlapping modeled appointments.
    for phi in phis:
        phi_id = phi["phi_id"]
        assigned_vars = [
            item["assigned"]
            for (idx, assigned_phi), item in variables.items()
            if assigned_phi == phi_id
        ]

        model.Add(sum(assigned_vars) <= phi["remaining_capacity"])

        if intervals[phi_id]:
            model.AddNoOverlap(intervals[phi_id])

    #    # Lexicographically prioritize task levels:
    # 1. Maximize the number of High-priority tasks scheduled.
    # 2. Then maximize Medium-priority tasks.
    # 3. Then maximize Low-priority tasks.
    #
    # The weights ensure one additional higher-tier task is worth more
    # than scheduling every possible task from the lower tiers combined.
    task_count = len(tasks)
    medium_weight = task_count + 1
    high_weight = (task_count + 1) ** 2

    priority_terms = []

    for (task_index, phi_id), item in variables.items():
        level = tasks[task_index]["priority_level"].strip().lower()

        if level == "high":
            weight = high_weight
        elif level == "medium":
            weight = medium_weight
        elif level == "low":
            weight = 1
        else:
            raise ValueError(
                f"Unknown priority level for task "
                f"{tasks[task_index]['scenario_task_id']}: "
                f"{tasks[task_index]['priority_level']}"
            )

        priority_terms.append(weight * item["assigned"])

    model.Maximize(sum(priority_terms))
    
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 20
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(
            f"No feasible solution returned: {solver.StatusName(status)}"
        )

    output = []
    for task_index, task in enumerate(tasks):
        selected = None

        for phi in phis:
            item = variables.get((task_index, phi["phi_id"]))
            if item and solver.Value(item["assigned"]):
                selected = (phi, item)
                break

        row = dict(task)
        row["planning_date"] = plan_date

        if selected:
            phi, item = selected
            start = solver.Value(item["start"])
            end = solver.Value(item["end"])

            row.update({
                "assigned_phi": phi["phi_id"],
                "start_time": f"{start // 60:02d}:{start % 60:02d}",
                "end_time": f"{end // 60:02d}:{end % 60:02d}",
                "status": "Scheduled",
                "reason": "Assigned within modeled capacity and working hours",
            })
        else:
            row.update({
                "assigned_phi": "",
                "start_time": "",
                "end_time": "",
                "status": "Unscheduled",
                "reason": "Insufficient eligible capacity or working time",
            })

        output.append(row)

    return output, solver.StatusName(status)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=DEFAULT_DATE)
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    tasks = load_tasks()
    phis = load_phis(args.date)

    if not tasks:
        raise ValueError("No eligible tasks found in the synthetic batch.")

    plan, status = solve_schedule(tasks, phis, args.date)

    output_path = OUTPUT_DIR / f"phi_plan_{args.date}.csv"
    with output_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(plan[0].keys()))
        writer.writeheader()
        writer.writerows(plan)

    scheduled = sum(row["status"] == "Scheduled" for row in plan)

    print("SYNTHETIC PHI ALLOCATION AND SCHEDULING")
    print(f"Planning date: {args.date}")
    print(f"Solver status: {status}")
    print(f"Available PHIs: {len(phis)}")
    print(f"Scenario tasks: {len(tasks)}")
    print(f"Scheduled tasks: {scheduled}")
    print(f"Unscheduled tasks: {len(plan) - scheduled}")
    print(f"CSV output: {output_path}")
    print("This is a synthetic research simulation, not a live operational plan.")


if __name__ == "__main__":
    main()
