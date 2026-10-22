
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


def test_higher_numeric_score_is_selected_independent_of_task_order():
    higher_score = {
        "scenario_task_id": "TEST-HIGHER-SCORE",
        "priority_score": 90,
        "priority_level": "High",
        "moh_area": "TEST-MOH",
        "phi_range": "TEST-RANGE",
    }
    lower_score = {
        "scenario_task_id": "TEST-LOWER-SCORE",
        "priority_score": 80,
        "priority_level": "High",
        "moh_area": "TEST-MOH",
        "phi_range": "TEST-RANGE",
    }
    phis = [{
        "phi_id": "TEST-PHI",
        "moh_area": "TEST-MOH",
        "phi_range": "TEST-RANGE",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }]

    for tasks in ([higher_score, lower_score], [lower_score, higher_score]):
        plan, status = solve_schedule(tasks, phis, "2026-04-01")

        scheduled = [row for row in plan if row["status"] == "Scheduled"]
        assert status == "OPTIMAL"
        assert [row["scenario_task_id"] for row in scheduled] == [
            "TEST-HIGHER-SCORE"
        ]


def test_matching_phi_range_breaks_equal_score_tie():
    tasks = [
        {
            "scenario_task_id": "TEST-CROSS-RANGE",
            "priority_score": 80,
            "priority_level": "High",
            "moh_area": "TEST-MOH",
            "phi_range": "OTHER-RANGE",
        },
        {
            "scenario_task_id": "TEST-MATCHING-RANGE",
            "priority_score": 80,
            "priority_level": "High",
            "moh_area": "TEST-MOH",
            "phi_range": "TEST-RANGE",
        },
    ]
    phis = [{
        "phi_id": "TEST-PHI",
        "moh_area": "TEST-MOH",
        "phi_range": "TEST-RANGE",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }]

    plan, status = solve_schedule(tasks, phis, "2026-04-01")

    scheduled = [row for row in plan if row["status"] == "Scheduled"]
    assert status == "OPTIMAL"
    assert [row["scenario_task_id"] for row in scheduled] == [
        "TEST-MATCHING-RANGE"
    ]


def test_older_high_priority_selected_over_newer_medium_task():
    tasks = [
        {
            "scenario_task_id": "TEST-OLDER-HIGH",
            "priority_score": 95,
            "priority_level": "High",
            "scheduling_priority_level": "High",
            "task_date": "2026-04-01",
        },
        {
            "scenario_task_id": "TEST-NEWER-MEDIUM",
            "priority_score": 55,
            "priority_level": "Medium",
            "scheduling_priority_level": "Medium",
            "task_date": "2026-04-03",
        },
    ]
    phis = [{
        "phi_id": "TEST-PHI",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }]

    plan, status = solve_schedule(tasks, phis, "2026-04-03")

    scheduled = [row for row in plan if row["status"] == "Scheduled"]
    assert status == "OPTIMAL"
    assert [row["scenario_task_id"] for row in scheduled] == [
        "TEST-OLDER-HIGH"
    ]
def test_higher_score_selected_without_deadline_metadata():
    tasks = [
        {
            "scenario_task_id": "TEST-OLDER-LOWER-SCORE",
            "priority_score": 55,
            "priority_level": "Medium",
            "scheduling_priority_level": "Medium",
            "task_date": "2026-04-03",
        },
        {
            "scenario_task_id": "TEST-NEWER-HIGHER-SCORE",
            "priority_score": 75,
            "priority_level": "Medium",
            "scheduling_priority_level": "Medium",
            "task_date": "2026-04-03",
        },
    ]
    phis = [{
        "phi_id": "TEST-PHI",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }]

    plan, status = solve_schedule(tasks, phis, "2026-04-03")

    scheduled = [row for row in plan if row["status"] == "Scheduled"]
    assert status == "OPTIMAL"
    assert [row["scenario_task_id"] for row in scheduled] == [
        "TEST-NEWER-HIGHER-SCORE"
    ]


def test_pending_task_waiting_beyond_three_days_keeps_queue_priority():
    tasks = [
        {
            "scenario_task_id": "NEWER-HIGHER-SCORE",
            "priority_score": 100,
            "priority_level": "High",
            "scheduling_priority_level": "High",
            "task_date": "2026-05-05",
        },
        {
            "scenario_task_id": "OLDER-PENDING",
            "priority_score": 40,
            "priority_level": "High",
            "scheduling_priority_level": "High",
            "task_date": "2026-05-01",
        },
    ]
    phis = [{
        "phi_id": "TEST-PHI",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }]

    plan, status = solve_schedule(tasks, phis, "2026-05-06")

    scheduled = [row for row in plan if row["status"] == "Scheduled"]
    assert status == "OPTIMAL"
    assert scheduled[0]["scenario_task_id"] == "OLDER-PENDING"
    assert scheduled[0]["waiting_days"] == 5


def test_same_day_task_uses_capacity_before_carried_task_in_same_tier():
    tasks = [
        {
            "scenario_task_id": "CARRIED-TASK",
            "priority_score": 100,
            "priority_level": "High",
            "scheduling_priority_level": "High",
            "task_date": "2026-05-04",
        },
        {
            "scenario_task_id": "TASK-RECEIVED-TODAY",
            "priority_score": 40,
            "priority_level": "High",
            "scheduling_priority_level": "High",
            "task_date": "2026-05-06",
        },
    ]
    phi = {
        "phi_id": "TEST-PHI",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }

    plan, status = solve_schedule(tasks, [phi], "2026-05-06")

    scheduled = [row for row in plan if row["status"] == "Scheduled"]
    assert status == "OPTIMAL"
    assert scheduled[0]["scenario_task_id"] == "TASK-RECEIVED-TODAY"


def test_priority_tier_remains_above_waiting_age():
    tasks = [
        {
            "scenario_task_id": "OLD-MEDIUM",
            "priority_score": 100,
            "priority_level": "Medium",
            "scheduling_priority_level": "Medium",
            "task_date": "2026-04-01",
        },
        {
            "scenario_task_id": "NEW-HIGH",
            "priority_score": 70,
            "priority_level": "High",
            "scheduling_priority_level": "High",
            "task_date": "2026-05-06",
        },
    ]
    phi = {
        "phi_id": "TEST-PHI",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }

    plan, status = solve_schedule(tasks, [phi], "2026-05-06")

    scheduled = [row for row in plan if row["status"] == "Scheduled"]
    assert status == "OPTIMAL"
    assert scheduled[0]["scenario_task_id"] == "NEW-HIGH"


def test_primary_village_phi_is_preferred_for_task_location():
    task = {
        "scenario_task_id": "TASK-LOCAL-VILLAGE",
        "priority_score": 80,
        "priority_level": "High",
        "scheduling_priority_level": "High",
        "moh_area": "TEST-MOH",
        "phi_range": "TEST-RANGE",
        "village_area": "Village A",
    }
    phis = [
        {
            "phi_id": "PHI-B",
            "moh_area": "TEST-MOH",
            "phi_range": "TEST-RANGE",
            "primary_village_area": "Village B",
            "remaining_capacity": 1,
            "working_start": "08:00",
            "working_end": "08:45",
            "existing_workload": 0,
        },
        {
            "phi_id": "PHI-A",
            "moh_area": "TEST-MOH",
            "phi_range": "TEST-RANGE",
            "primary_village_area": "Village A",
            "remaining_capacity": 1,
            "working_start": "08:00",
            "working_end": "08:45",
            "existing_workload": 0,
        },
    ]

    plan, status = solve_schedule([task], phis, "2026-05-06")

    assert status == "OPTIMAL"
    assert plan[0]["assigned_phi"] == "PHI-A"
