"""Regression tests for deadline-free PHI scheduling and task lifecycle."""

from component_3_phi_planning.api.plan_store import plan_fingerprint

from component_3_phi_planning.optimization.phi_scheduler import (
    prepare_scheduling_task,
    solve_schedule,
)


def _phi(capacity=1, start="08:00", end="08:45"):
    return {
        "phi_id": "PHI01",
        "phi_range": "TEST-RANGE",
        "availability": "Available",
        "daily_capacity": capacity,
        "remaining_capacity": capacity,
        "working_start": start,
        "working_end": end,
        "existing_workload": 0,
    }


def test_prepare_preserves_original_date_and_strips_legacy_deadline_fields():
    task = {
        "scenario_task_id": "OLD-TASK",
        "task_date": "2026-04-01",
        "priority_score": 70,
        "priority_level": "High",
        "deadline_date": "2026-04-03",
        "deadline_at_risk": True,
        "overdue": True,
    }

    prepared = prepare_scheduling_task(task)

    assert prepared["task_date"] == "2026-04-01"
    assert not {"deadline_date", "deadline_at_risk", "overdue"} & prepared.keys()


def test_old_task_date_does_not_prevent_assignment():
    task = prepare_scheduling_task({
        "scenario_task_id": "CARRIED-OLD-TASK",
        "task_date": "2026-03-01",
        "priority_score": 70,
        "priority_level": "High",
        "scheduling_priority_level": "High",
    })

    plan, status = solve_schedule([task], [_phi()], "2026-07-01")

    assert status in {"OPTIMAL", "FEASIBLE"}
    assert plan[0]["status"] == "Scheduled"
    assert plan[0]["task_date"] == "2026-03-01"


def test_deadline_metadata_does_not_override_priority_score():
    older_lower_score = {
        "scenario_task_id": "OLDER-LOWER-SCORE",
        "task_date": "2026-07-01",
        "priority_score": 55,
        "priority_level": "High",
        "scheduling_priority_level": "High",
        "deadline_date": "2026-07-01",
    }
    newer_higher_score = {
        "scenario_task_id": "NEWER-HIGHER-SCORE",
        "task_date": "2026-07-01",
        "priority_score": 75,
        "priority_level": "High",
        "scheduling_priority_level": "High",
        "deadline_date": "2026-07-10",
    }

    plan, status = solve_schedule(
        [older_lower_score, newer_higher_score],
        [_phi()],
        "2026-07-01",
    )

    assert status in {"OPTIMAL", "FEASIBLE"}
    scheduled = [row for row in plan if row["status"] == "Scheduled"]
    assert [row["scenario_task_id"] for row in scheduled] == ["NEWER-HIGHER-SCORE"]


def test_legacy_deadline_metadata_does_not_change_plan_fingerprint():
    task = {
        "scenario_task_id": "TASK-1",
        "assigned_phi": "PHI01",
        "start_time": "08:00",
        "end_time": "08:45",
        "status": "Scheduled",
        "task_status": "Pending",
        "priority_score": 70,
        "priority_level": "High",
        "deadline_date": "2026-07-01",
    }
    changed_deadline = {**task, "deadline_date": "2026-07-30"}

    assert plan_fingerprint([task]) == plan_fingerprint([changed_deadline])


def test_review_fallback_tier_remains_schedulable():
    low_fallback = {
        "scenario_task_id": "REVIEW-LOW",
        "priority_score": None,
        "priority_level": "Review",
        "scheduling_priority_level": "Low",
        "priority_fallback": True,
    }
    high_fallback = {
        "scenario_task_id": "REVIEW-HIGH",
        "priority_score": None,
        "priority_level": "Review",
        "scheduling_priority_level": "High",
        "priority_fallback": True,
    }

    plan, status = solve_schedule(
        [low_fallback, high_fallback],
        [_phi()],
        "2026-07-01",
    )

    assert status in {"OPTIMAL", "FEASIBLE"}
    scheduled = [row for row in plan if row["status"] == "Scheduled"]
    assert [row["scenario_task_id"] for row in scheduled] == ["REVIEW-HIGH"]
