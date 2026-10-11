
import unittest

from component_3_phi_planning.rescheduling.phi_rescheduler import (
    reschedule_tasks,
)


def phi(availability="Available", capacity=3, workload=0):
    return {
        "availability": availability,
        "working_start": "08:00",
        "working_end": "16:00",
        "daily_capacity": capacity,
        "existing_workload": workload,
    }


def task(
    task_id,
    assigned_phi,
    start,
    end,
    priority="High",
    score=90,
    task_status="Pending",
):
    return {
        "scenario_task_id": task_id,
        "assigned_phi": assigned_phi,
        "start_time": start,
        "end_time": end,
        "status": "Scheduled",
        "priority_level": priority,
        "priority_score": str(score),
        "reason": "Original assignment",
        "task_status": task_status,
    }


class TestPhiRescheduler(unittest.TestCase):

    def test_reassigns_pending_task_to_available_phi(self):
        plan = [
            task("TASK-1", "PHI01", "08:00", "08:45"),
            task("TASK-2", "PHI02", "08:00", "08:45"),
        ]

        availability = {
            "PHI01": phi(capacity=3),
            "PHI02": phi(capacity=3),
        }

        result = reschedule_tasks(plan, availability, "PHI02")
        by_id = {row["scenario_task_id"]: row for row in result}

        self.assertEqual(by_id["TASK-2"]["status"], "Scheduled")
        self.assertEqual(by_id["TASK-2"]["assigned_phi"], "PHI01")
        self.assertNotEqual(by_id["TASK-2"]["start_time"], "08:00")
        self.assertEqual(len(result), 2)

        # The original input must not be modified.
        self.assertEqual(plan[1]["assigned_phi"], "PHI02")
        self.assertEqual(plan[1]["start_time"], "08:00")

    def test_marks_task_unscheduled_when_capacity_is_full(self):
        plan = [
            task("TASK-1", "PHI01", "08:00", "08:45"),
            task("TASK-2", "PHI02", "08:00", "08:45"),
        ]

        # PHI01 has no remaining capacity for reassignment.
        availability = {
            "PHI01": phi(capacity=1, workload=1),
            "PHI02": phi(capacity=3),
        }

        result = reschedule_tasks(plan, availability, "PHI02")
        by_id = {row["scenario_task_id"]: row for row in result}

        self.assertEqual(by_id["TASK-2"]["status"], "Unscheduled")
        self.assertEqual(by_id["TASK-2"]["assigned_phi"], "")
        self.assertEqual(len(result), 2)

    def test_rejects_unknown_phi(self):
        plan = [
            task("TASK-1", "PHI01", "08:00", "08:45")
        ]
        availability = {"PHI01": phi()}

        with self.assertRaises(ValueError):
            reschedule_tasks(plan, availability, "PHI99")

    def test_completed_task_is_not_reassigned(self):
        plan = [
            task(
                "TASK-1",
                "PHI02",
                "08:00",
                "08:45",
                task_status="Completed",
            ),
            task("TASK-2", "PHI02", "08:45", "09:30"),
        ]

        availability = {
            "PHI01": phi(capacity=3),
            "PHI02": phi(capacity=3),
        }

        result = reschedule_tasks(plan, availability, "PHI02")
        by_id = {row["scenario_task_id"]: row for row in result}

        completed = by_id["TASK-1"]
        self.assertEqual(completed["task_status"], "Completed")
        self.assertEqual(completed["assigned_phi"], "PHI02")
        self.assertEqual(completed["start_time"], "08:00")
        self.assertEqual(completed["end_time"], "08:45")
        self.assertEqual(completed["status"], "Scheduled")

    def test_in_progress_task_is_not_reassigned(self):
        plan = [
            task(
                "TASK-1",
                "PHI02",
                "08:00",
                "08:45",
                task_status="In Progress",
            ),
            task("TASK-2", "PHI02", "08:45", "09:30"),
        ]

        availability = {
            "PHI01": phi(capacity=3),
            "PHI02": phi(capacity=3),
        }

        result = reschedule_tasks(plan, availability, "PHI02")
        by_id = {row["scenario_task_id"]: row for row in result}

        in_progress = by_id["TASK-1"]
        self.assertEqual(in_progress["task_status"], "In Progress")
        self.assertEqual(in_progress["assigned_phi"], "PHI02")
        self.assertEqual(in_progress["start_time"], "08:00")
        self.assertEqual(in_progress["end_time"], "08:45")
        self.assertEqual(in_progress["status"], "Scheduled")

    def test_missing_execution_status_is_rejected(self):
        plan = [
            task("TASK-1", "PHI01", "08:00", "08:45")
        ]
        del plan[0]["task_status"]

        with self.assertRaisesRegex(ValueError, "Execution status is missing"):
            reschedule_tasks(plan, {"PHI01": phi()}, "PHI01")

    def test_explicit_pending_simulation_is_supported(self):
        plan = [
            task("TASK-1", "PHI01", "08:00", "08:45")
        ]
        del plan[0]["task_status"]

        result = reschedule_tasks(
            plan,
            {"PHI01": phi()},
            "PHI01",
            assume_all_pending=True,
        )

        self.assertEqual(result[0]["task_status"], "Pending")


if __name__ == "__main__":
    unittest.main()
