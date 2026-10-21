
"""Constraint tests for the PHI scheduling prototype.

These fixtures are used only to test the scheduling algorithm.
They are not application records or PP1 demonstration data.
"""

from component_3_phi_planning.optimization.phi_scheduler import solve_schedule


def make_task(task_id, priority_level):
    return {
        "scenario_task_id": task_id,
        "source_id": task_id,
        "task_type": "Dengue Case Inspection",
        "priority_score": 90 if priority_level == "High" else 60,
        "priority_level": priority_level,
        "location_id": "TEST-LOCATION",
        "phi_range": "TEST-RANGE",
        "village_area": "TEST-AREA",
    }


def make_phi(capacity=2, start="08:00", end="09:30"):
    return {
        "phi_id": "TEST-PHI",
        "phi_range": "TEST-RANGE",
        "availability": "available",
        "working_start": start,
        "working_end": end,
        "daily_capacity": capacity,
        "existing_workload": 0,
        "remaining_capacity": capacity,
    }


def test_two_tasks_for_one_phi_do_not_overlap():
    tasks = [
        make_task("TEST-1", "High"),
        make_task("TEST-2", "Medium"),
    ]
    phis = [make_phi()]

    plan, _ = solve_schedule(tasks, phis, "2026-04-01")

    scheduled = [row for row in plan if row["status"] == "Scheduled"]

    assert len(scheduled) == 2

    intervals = sorted(
        (row["start_time"], row["end_time"])
        for row in scheduled
    )

    for index in range(len(intervals) - 1):
        assert intervals[index][1] <= intervals[index + 1][0], (
            "The PHI has overlapping appointments."
        )


def test_each_task_is_assigned_to_at_most_one_phi():
    tasks = [make_task("TEST-1", "High")]
    phis = [
        make_phi(),
        {
            **make_phi(),
            "phi_id": "TEST-PHI-2",
        },
    ]

    plan, _ = solve_schedule(tasks, phis, "2026-04-01")

    scheduled = [
        row for row in plan
        if row["scenario_task_id"] == "TEST-1"
        and row["status"] == "Scheduled"
    ]

    assert len(scheduled) <= 1


def test_task_is_unscheduled_when_working_time_is_insufficient():
    tasks = [make_task("TEST-1", "High")]
    phis = [make_phi(capacity=2, start="08:00", end="08:30")]

    plan, _ = solve_schedule(tasks, phis, "2026-04-01")

    assert len(plan) == 1
    assert plan[0]["status"] == "Unscheduled"
    assert plan[0]["assigned_phi"] == ""
