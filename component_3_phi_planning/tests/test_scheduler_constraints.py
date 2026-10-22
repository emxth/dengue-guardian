
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
    assert all(
        row["start_time"] >= "08:00" and row["end_time"] <= "09:30"
        for row in scheduled
    )

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
    assert "working hours" in plan[0]["reason"].lower()


def test_daily_capacity_limits_assignments_even_with_available_time():
    tasks = [
        make_task("TEST-1", "High"),
        make_task("TEST-2", "Medium"),
    ]
    phi = make_phi(capacity=1, start="08:00", end="10:00")

    plan, status = solve_schedule(tasks, [phi], "2026-04-01")

    assert status == "OPTIMAL"
    assert sum(row["status"] == "Scheduled" for row in plan) == 1
    unscheduled = [row for row in plan if row["status"] == "Unscheduled"]
    assert len(unscheduled) == 1
    assert "remaining daily capacity" in unscheduled[0]["reason"].lower()


def test_all_twelve_eligible_phis_are_used_when_tasks_and_capacity_allow():
    tasks = [make_task(f"TASK-{index:02d}", "High") for index in range(12)]
    phis = [
        {
            **make_phi(capacity=1, end="08:45"),
            "phi_id": f"PHI{index:02d}",
            "moh_area": "TEST-MOH",
        }
        for index in range(1, 13)
    ]
    for task in tasks:
        task["moh_area"] = "TEST-MOH"

    plan, status = solve_schedule(tasks, phis, "2026-07-30")

    assert status == "OPTIMAL"
    scheduled = [row for row in plan if row["status"] == "Scheduled"]
    assert len(scheduled) == 12
    assert {row["assigned_phi"] for row in scheduled} == {
        f"PHI{index:02d}" for index in range(1, 13)
    }


def test_unavailable_local_phi_is_backed_up_by_same_area_phi():
    task = {
        **make_task("TASK-BACKUP", "High"),
        "moh_area": "TEST-MOH",
        "phi_range": "LOCAL-RANGE",
    }
    phis = [
        {
            **make_phi(capacity=0),
            "phi_id": "PHI-LOCAL",
            "moh_area": "TEST-MOH",
            "phi_range": "LOCAL-RANGE",
        },
        {
            **make_phi(capacity=1),
            "phi_id": "PHI-BACKUP",
            "moh_area": "TEST-MOH",
            "phi_range": "OTHER-RANGE",
        },
    ]

    plan, status = solve_schedule([task], phis, "2026-07-30")

    assert status == "OPTIMAL"
    assert plan[0]["status"] == "Scheduled"
    assert plan[0]["assigned_phi"] == "PHI-BACKUP"


def test_responsible_range_phi_is_preferred_when_feasible():
    task = {
        **make_task("TASK-LOCAL", "High"),
        "moh_area": "TEST-MOH",
        "phi_range": "LOCAL-RANGE",
    }
    phis = [
        {
            **make_phi(capacity=1),
            "phi_id": "PHI-BACKUP",
            "moh_area": "TEST-MOH",
            "phi_range": "OTHER-RANGE",
        },
        {
            **make_phi(capacity=1),
            "phi_id": "PHI-LOCAL",
            "moh_area": "TEST-MOH",
            "phi_range": "LOCAL-RANGE",
        },
    ]

    plan, status = solve_schedule([task], phis, "2026-07-30")

    assert status == "OPTIMAL"
    assert plan[0]["assigned_phi"] == "PHI-LOCAL"


def test_task_outside_phi_moh_area_is_not_assigned():
    task = {
        **make_task("TEST-OTHER-AREA", "High"),
        "moh_area": "OTHER-MOH",
    }
    phi = {
        **make_phi(),
        "moh_area": "TEST-MOH",
    }

    plan, status = solve_schedule([task], [phi], "2026-04-01")

    assert status == "OPTIMAL"
    assert plan[0]["status"] == "Unscheduled"
    assert plan[0]["assigned_phi"] == ""
