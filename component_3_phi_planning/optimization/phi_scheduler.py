
"""Initial PHI allocation and scheduling prototype using OR-Tools."""

import argparse
import csv
import sqlite3
from datetime import date
from pathlib import Path

from ortools.sat.python import cp_model

from component_3_phi_planning.api.availability_store import (
    load_phi_daily_defaults,
)
from component_3_phi_planning.config import DEFAULT_PLANNING_DATE
from component_3_phi_planning.prioritization.score_tasks import (
    score_cases,
    score_complaints,
)


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PRIORITY_DIR = ROOT / "prioritization" / "output"
OUTPUT_DIR = ROOT / "optimization" / "output"

DB_PATH = DATA_DIR / "Kaduwela_C3_Updated_New_ver.sqlite"

# Explicit synthetic modeling assumptions for the first prototype.
DEFAULT_DATE = DEFAULT_PLANNING_DATE
TASK_DURATION_MIN = 45
MAX_TASK_WAIT_TARGET_DAYS = 3
WAITING_DAY_WEIGHT = 1_100
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

    database_uri = DB_PATH.resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(database_uri, uri=True) as conn:
        conn.row_factory = sqlite3.Row
        scored_cases = score_cases(conn, plan_date)
        scored_complaints = score_complaints(conn, plan_date)
        cases = {r["task_id"]: dict(r) for r in conn.execute("SELECT * FROM Case_Notifications")}
        complaints = {r["complaint_id"]: dict(r) for r in conn.execute("SELECT * FROM Citizen_Complaints")}

    selected_date = str(plan_date)[:10]

    tasks = []
    for scored in scored_cases:
        task_date = scored.get("notification_date")
        if task_date != selected_date:
            continue
        source = cases[scored["task_id"]]
        if str(source.get("inspection_required") or "").strip().lower() != "yes":
            continue
        tasks.append({
            "scenario_task_id": f"SIM-CASE-{source['task_id']}",
            "source_id": source["task_id"],
            "task_type": "Dengue Case Inspection",
            "priority_score": (
                float(scored["priority_score"])
                if scored.get("priority_score") is not None else None
            ),
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
            "task_status": "Pending",
        })

    for scored in scored_complaints:
        task_date = scored.get("received_date")
        if task_date != selected_date:
            continue
        source = complaints[scored["task_id"]]
        if str(source.get("status") or "").strip().lower() == "closed":
            continue
        tasks.append({
            "scenario_task_id": f"SIM-COMPLAINT-{source['complaint_id']}",
            "source_id": source["complaint_id"],
            "task_type": "Citizen Complaint",
            "priority_score": (
                float(scored["priority_score"])
                if scored.get("priority_score") is not None else None
            ),
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
            "task_status": "Pending",
        })

    tasks = [prepare_scheduling_task(task) for task in tasks]

    tasks.sort(key=lambda task: (
        task["priority_score"] is None,
        -(task["priority_score"] or 0),
        task["task_type"],
        task["scenario_task_id"],
    ))
    return tasks


def _review_fallback_level(task):
    """Choose a labeled scheduling tier without fabricating a score."""
    tier_order = {"Low": 0, "Medium": 1, "High": 2}
    candidates = []
    risk_level = str(task.get("component2_risk_level") or "").title()
    if risk_level in tier_order:
        candidates.append(risk_level)

    urgency = str(task.get("urgency") or "").strip().lower()
    urgency_levels = {"high": "High", "medium": "Medium", "low": "Low"}
    if urgency in urgency_levels:
        candidates.append(urgency_levels[urgency])
    elif task.get("task_type") == "Dengue Case Inspection":
        candidates.append("Medium")

    return max(candidates, key=tier_order.get) if candidates else "Low"


def prepare_scheduling_task(task):
    """Add explicit fallback fields without changing scored priority."""
    prepared = dict(task)
    for field in ("deadline_date", "deadline_at_risk", "overdue"):
        prepared.pop(field, None)

    if prepared.get("priority_score") is None:
        prepared["priority_level"] = "Review"
        prepared["scheduling_priority_level"] = _review_fallback_level(prepared)
        prepared["priority_fallback"] = True
        prepared["priority_fallback_reason"] = (
            "Review task scheduled provisionally from known risk/urgency; "
            "no numeric priority score is asserted."
        )
    else:
        prepared.setdefault("scheduling_priority_level", prepared["priority_level"])
        prepared["priority_fallback"] = False
    return prepared


def task_waiting_days(task, plan_date):
    """Return elapsed calendar days since receipt without changing task_date."""
    raw_task_date = task.get("task_date") or task.get("notification_date") or task.get("received_date")
    try:
        received = date.fromisoformat(str(raw_task_date)[:10])
        selected = date.fromisoformat(str(plan_date)[:10])
    except (TypeError, ValueError):
        return 0
    return max(0, (selected - received).days)


def load_phis(plan_date):
    """Load date-specific PHI availability/capacity plus master-area information."""
    if not DB_PATH.is_file():
        raise FileNotFoundError(f"Planning database not found: {DB_PATH}")

    database_uri = DB_PATH.resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(database_uri, uri=True) as conn:
        conn.row_factory = sqlite3.Row
        all_phis = load_phi_daily_defaults(conn, plan_date)
    return [
        phi for phi in all_phis.values()
        if str(phi["availability"]).strip().lower() == "available"
    ]


def to_minutes(clock):
    hours, minutes = map(int, clock.split(":"))
    return hours * 60 + minutes


def solve_schedule(tasks, phis, plan_date, reserved_tasks=None):
    reserved_tasks = reserved_tasks or []
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

    # Existing in-progress appointments occupy capacity and time but cannot move.
    reserved_counts = {phi["phi_id"]: 0 for phi in phis}
    for reserved_index, task in enumerate(reserved_tasks):
        phi_id = task.get("assigned_phi")
        if phi_id not in reserved_counts:
            continue
        reserved_counts[phi_id] += 1
        if task.get("start_time") and task.get("end_time"):
            start = to_minutes(task["start_time"])
            end = to_minutes(task["end_time"])
            if end > start:
                intervals[phi_id].append(
                    model.NewIntervalVar(
                        start,
                        end - start,
                        end,
                        f"reserved_{reserved_index}_{phi_id}",
                    )
                )

    # Enforce capacity and prevent overlapping modeled appointments.
    for phi in phis:
        phi_id = phi["phi_id"]
        assigned_vars = [
            item["assigned"]
            for (idx, assigned_phi), item in variables.items()
            if assigned_phi == phi_id
        ]

        model.Add(
            sum(assigned_vars)
            <= max(0, phi["remaining_capacity"] - reserved_counts[phi_id])
        )

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
    max_waiting_bonus = max(
        (
            task_waiting_days(task, plan_date) * WAITING_DAY_WEIGHT
            + max(0, task_waiting_days(task, plan_date) - MAX_TASK_WAIT_TARGET_DAYS)
            for task in tasks
        ),
        default=0,
    )
    max_score_tiebreak = max(
        (abs(round(float(task.get("priority_score") or 0) * 10)) for task in tasks),
        default=0,
    )
    same_day_bonus = max_waiting_bonus + max_score_tiebreak + 32
    secondary_bound = same_day_bonus + max_waiting_bonus + max_score_tiebreak + 32
    tier_unit = task_count * secondary_bound + 1
    medium_weight = task_count + 1
    high_weight = (task_count + 1) ** 2

    priority_terms = []

    for (task_index, phi_id), item in variables.items():
        candidate_task = tasks[task_index]
        level = candidate_task.get(
            "scheduling_priority_level", candidate_task["priority_level"]
        ).strip().lower()

        if level == "high":
            weight = high_weight
        elif level == "medium":
            weight = medium_weight
        elif level == "low":
            weight = 1
        else:
            # Treat any unresolved level (e.g. "review" without a fallback tier)
            # as Low weight so the task remains schedulable.  prepare_scheduling_task
            # always resolves Review tasks to a High/Medium/Low scheduling tier, so
            # this branch is only reached when solve_schedule is called directly
            # without going through that helper.
            weight = 1

        phi = next(p for p in phis if p["phi_id"] == phi_id)
        task_village = str(candidate_task.get("village_area") or "").strip().casefold()
        phi_village = str(phi.get("primary_village_area") or "").strip().casefold()
        same_village_bonus = 100 if task_village and task_village == phi_village else 0
        same_range_bonus = 20 if (
            candidate_task.get("phi_range") and phi.get("phi_range")
            and str(candidate_task["phi_range"]).strip().casefold()
                == str(phi["phi_range"]).strip().casefold()
        ) else 0
        workload_penalty = min(int(phi.get("existing_workload", 0)), 10)
        tie_break = same_village_bonus + same_range_bonus - workload_penalty
        score_tiebreak = round(float(candidate_task.get("priority_score") or 0) * 10)
        waiting_days = task_waiting_days(candidate_task, plan_date)
        is_new_today = waiting_days == 0
        waiting_bonus = waiting_days * WAITING_DAY_WEIGHT + max(
            0, waiting_days - MAX_TASK_WAIT_TARGET_DAYS
        )

        # Priority tier dominates. Same-day work leads within each tier;
        # older carried work leads the carry queue before score/range ties.
        freshness_bonus = same_day_bonus if is_new_today else 0
        objective_value = (
            weight * tier_unit
            + freshness_bonus
            + waiting_bonus
            + score_tiebreak
            + tie_break
        )
        priority_terms.append(objective_value * item["assigned"])

    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 42
    solver.parameters.max_time_in_seconds = 20

    model.Maximize(sum(priority_terms))
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(
            f"No feasible solution returned: {solver.StatusName(status)}"
        )

    assigned_counts = dict(reserved_counts)
    busy_intervals = {phi["phi_id"]: [] for phi in phis}
    for task in reserved_tasks:
        phi_id = task.get("assigned_phi")
        if phi_id not in busy_intervals:
            continue
        if task.get("start_time") and task.get("end_time"):
            start = to_minutes(task["start_time"])
            end = to_minutes(task["end_time"])
            if end > start:
                busy_intervals[phi_id].append((start, end))
    for (task_index, phi_id), item in variables.items():
        if solver.Value(item["assigned"]):
            assigned_counts[phi_id] += 1
            busy_intervals[phi_id].append((
                solver.Value(item["start"]),
                solver.Value(item["end"]),
            ))

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
        row["waiting_days"] = task_waiting_days(task, plan_date)

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
            task_area = task.get("moh_area")
            eligible_phis = [
                phi for phi in phis
                if not task_area or not phi.get("moh_area")
                or str(task_area).strip().casefold()
                    == str(phi["moh_area"]).strip().casefold()
            ]
            if not eligible_phis:
                reason = "No available PHI is eligible for this MOH area."
            elif not any(
                phi["remaining_capacity"] > assigned_counts[phi["phi_id"]]
                for phi in eligible_phis
            ):
                reason = "No eligible PHI has remaining daily capacity."
            else:
                has_open_slot = False
                for phi in eligible_phis:
                    phi_id = phi["phi_id"]
                    if phi["remaining_capacity"] <= assigned_counts[phi_id]:
                        continue
                    earliest = to_minutes(phi["working_start"]) + (
                        int(phi["existing_workload"]) * TASK_DURATION_MIN
                    )
                    latest = to_minutes(phi["working_end"]) - TASK_DURATION_MIN
                    for start in range(earliest, latest + 1):
                        if not any(
                            start < busy_end and busy_start < start + TASK_DURATION_MIN
                            for busy_start, busy_end in busy_intervals[phi_id]
                        ):
                            has_open_slot = True
                            break
                    if has_open_slot:
                        break
                if has_open_slot:
                    reason = (
                        "Not selected by the effective priority objective; "
                        "available capacity was allocated to higher-priority work."
                    )
                else:
                    reason = (
                        "No feasible 45-minute slot remains within eligible "
                        "PHI working hours."
                    )
            row.update({
                "assigned_phi": "",
                "start_time": "",
                "end_time": "",
                "status": "Unscheduled",
                "reason": reason,
            })

        output.append(row)

    return output, solver.StatusName(status)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=DEFAULT_DATE)
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    tasks = load_tasks(args.date)
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
