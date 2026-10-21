
"""Initial PHI allocation and scheduling prototype using OR-Tools."""

import argparse
import csv
import sqlite3
from pathlib import Path

from ortools.sat.python import cp_model

from component_3_phi_planning.config import DEFAULT_PLANNING_DATE
from component_3_phi_planning.prioritization.score_tasks import (
    score_cases,
    score_complaints,
)


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PRIORITY_DIR = ROOT / "prioritization" / "output"
OUTPUT_DIR = ROOT / "optimization" / "output"

DB_PATH = DATA_DIR / "Kaduwela_C3_Research_Database_CleanPlanning.sqlite"

# Explicit synthetic modeling assumptions for the first prototype.
DEFAULT_DATE = DEFAULT_PLANNING_DATE
TASK_DURATION_MIN = 45
MAX_CASE_TASKS = 30
MAX_COMPLAINT_TASKS = 20


def load_tasks(plan_date=DEFAULT_DATE):
    """Build a bounded research batch from fresh database-derived priority scores.

    Legacy risk_indicator, initial_priority and historical PHI assignments are
    deliberately not used. This batch is a synthetic evaluation scenario, not
    a claim that all historical records are currently pending.
    """
    if not DB_PATH.is_file():
        raise FileNotFoundError(f"Planning database not found: {DB_PATH}")

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        scored_cases = score_cases(conn, plan_date)
        scored_complaints = score_complaints(conn, plan_date)
        cases = {r["task_id"]: dict(r) for r in conn.execute("SELECT * FROM Case_Notifications")}
        complaints = {r["complaint_id"]: dict(r) for r in conn.execute("SELECT * FROM Citizen_Complaints")}

    tasks = []
    for scored in scored_cases:
        if scored.get("priority_score") is None:
            continue
        source = cases[scored["task_id"]]
        tasks.append({
            "scenario_task_id": f"SIM-CASE-{source['task_id']}",
            "source_id": source["task_id"],
            "task_type": "Dengue Case Inspection",
            "priority_score": float(scored["priority_score"]),
            "priority_level": scored["priority_level"],
            "priority_reason": scored["priority_reason"],
            "priority_factors": scored["priority_factors"],
            "data_quality_status": scored["data_quality_status"],
            "component2_risk_score": scored["component2_risk_score"],
            "component2_risk_level": scored["component2_risk_level"],
            "location_id": source["location_id"],
            "moh_area": source["moh_area"],
            "phi_range": source["phi_range"],
            "village_area": source["village_area"],
            "location_label": source["location_label"],
            "task_date": source["notification_date"],
        })
        if sum(t["task_type"] == "Dengue Case Inspection" for t in tasks) >= MAX_CASE_TASKS:
            break

    complaint_count = 0
    for scored in scored_complaints:
        if scored.get("priority_score") is None:
            continue
        source = complaints[scored["task_id"]]
        if str(source.get("status") or "").strip().lower() == "closed":
            continue
        tasks.append({
            "scenario_task_id": f"SIM-COMPLAINT-{source['complaint_id']}",
            "source_id": source["complaint_id"],
            "task_type": "Citizen Complaint",
            "priority_score": float(scored["priority_score"]),
            "priority_level": scored["priority_level"],
            "priority_reason": scored["priority_reason"],
            "priority_factors": scored["priority_factors"],
            "data_quality_status": scored["data_quality_status"],
            "area_activity_score": scored["activity_score"],
            "component2_risk_score": scored.get("component2_risk_score"),
            "component2_risk_level": scored.get("component2_risk_level"),
            "urgency": source.get("urgency"),
            "complaint_type": source.get("complaint_type"),
            "location_id": source["location_id"],
            "moh_area": source["moh_area"],
            "phi_range": source["phi_range"],
            "village_area": source["village_area"],
            "location_label": source["location_label"],
            "task_date": source["received_date"],
        })
        complaint_count += 1
        if complaint_count >= MAX_COMPLAINT_TASKS:
            break

    # Across task types, numeric scores are provisional research assumptions.
    tasks.sort(key=lambda t: (-t["priority_score"], t["task_type"], t["scenario_task_id"]))
    return tasks


def load_phis(plan_date):
    """Load date-specific PHI availability/capacity plus master-area information."""
    if not DB_PATH.is_file():
        raise FileNotFoundError(f"Planning database not found: {DB_PATH}")

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT d.phi_id, d.phi_range, d.availability, d.working_start,
                   d.working_end, d.daily_capacity, d.existing_workload,
                   m.moh_area, m.primary_village_area
            FROM PHI_Daily AS d
            JOIN PHI_Master AS m ON m.phi_id = d.phi_id
            WHERE d.date = ?
            ORDER BY d.phi_id
            """,
            (plan_date,),
        ).fetchall()

    if not rows:
        raise ValueError(
            f"No PHI availability data for {plan_date}. "
            "Choose a supported date from 2026-04-01 to 2026-09-30."
        )

    phis = []
    for row in rows:
        phi = dict(row)
        phi["remaining_capacity"] = max(
            0, int(phi["daily_capacity"]) - int(phi["existing_workload"])
        )
        if str(phi["availability"]).strip().lower() == "available":
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

            # A PHI must belong to the same MOH area when both area fields exist.
            # Range mismatch is allowed within that MOH area so an overloaded
            # local PHI can be backed up by another available PHI.
            task_area = task.get("moh_area")
            phi_area = phi.get("moh_area")
            if task_area and phi_area and str(task_area).strip().casefold() != str(phi_area).strip().casefold():
                continue

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

        phi = next(p for p in phis if p["phi_id"] == phi_id)
        same_range_bonus = 2 if (
            task.get("phi_range") and phi.get("phi_range")
            and str(task["phi_range"]).strip().casefold()
                == str(phi["phi_range"]).strip().casefold()
        ) else 0
        workload_penalty = min(int(phi.get("existing_workload", 0)), 10)
        tie_break = same_range_bonus - workload_penalty
        score_tiebreak = round(float(task.get("priority_score") or 0) * 10)
        # Tier weights dominate the maximum possible sum of score/range/workload
        # tie-breaks; the score then distinguishes tasks within the same tier.
        objective_value = weight * 100_000 + score_tiebreak + tie_break
        priority_terms.append(objective_value * item["assigned"])

    model.Maximize(sum(priority_terms))
    
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 42
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
