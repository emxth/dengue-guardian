
from component_3_phi_planning.optimization.phi_scheduler import solve_schedule


def test_high_priority_selected_when_only_one_slot_exists():
    tasks = [
        {
            "scenario_task_id": "TEST-LOW",
            "priority_score": 20,
            "priority_level": "Low",
        },
        {
            "scenario_task_id": "TEST-MEDIUM",
            "priority_score": 60,
            "priority_level": "Medium",
        },
        {
            "scenario_task_id": "TEST-HIGH",
            "priority_score": 90,
            "priority_level": "High",
        },
    ]

    phis = [
        {
            "phi_id": "TEST-PHI",
            "remaining_capacity": 1,
            "working_start": "08:00",
            "working_end": "08:45",
            "existing_workload": 0,
        }
    ]

    plan, status = solve_schedule(
        tasks=tasks,
        phis=phis,
        plan_date="2026-04-01",
    )

    assert status == "OPTIMAL"

    scheduled = [
        task for task in plan
        if task["status"] == "Scheduled"
    ]

    assert len(scheduled) == 1
    assert scheduled[0]["scenario_task_id"] == "TEST-HIGH"

    print("PASS: High-priority task selected with one available slot.")


def test_medium_selected_over_low_when_no_high_tasks_exist():
    tasks = [
        {
            "scenario_task_id": "TEST-LOW",
            "priority_score": 20,
            "priority_level": "Low",
        },
        {
            "scenario_task_id": "TEST-MEDIUM",
            "priority_score": 60,
            "priority_level": "Medium",
        },
    ]

    phis = [
        {
            "phi_id": "TEST-PHI",
            "remaining_capacity": 1,
            "working_start": "08:00",
            "working_end": "08:45",
            "existing_workload": 0,
        }
    ]

    plan, status = solve_schedule(tasks, phis, "2026-04-01")

    scheduled = [t for t in plan if t["status"] == "Scheduled"]

    assert status == "OPTIMAL"
    assert len(scheduled) == 1
    assert scheduled[0]["scenario_task_id"] == "TEST-MEDIUM"

    print("PASS: Medium-priority task selected over Low-priority task.")


def test_tasks_remain_unscheduled_when_capacity_is_zero():
    tasks = [
        {
            "scenario_task_id": "TEST-HIGH",
            "priority_score": 90,
            "priority_level": "High",
        },
    ]

    phis = [
        {
            "phi_id": "TEST-PHI",
            "remaining_capacity": 0,
            "working_start": "08:00",
            "working_end": "16:00",
            "existing_workload": 6,
        }
    ]

    plan, status = solve_schedule(tasks, phis, "2026-04-01")

    assert status == "OPTIMAL"
    assert len(plan) == 1
    assert plan[0]["status"] == "Unscheduled"
    assert plan[0]["assigned_phi"] == ""

    print("PASS: Task remains unscheduled when capacity is zero.")
