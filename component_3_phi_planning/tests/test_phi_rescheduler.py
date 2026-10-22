
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

        # The original input must remain unchanged.
        self.assertEqual(plan[1]["assigned_phi"], "PHI02")
        self.assertEqual(plan[1]["start_time"], "08:00")

    def test_marks_task_unscheduled_when_capacity_is_full(self):
        plan = [
            task("TASK-1", "PHI01", "08:00", "08:45"),
            task("TASK-2", "PHI02", "08:00", "08:45"),
        ]

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
        plan = [task("TASK-1", "PHI01", "08:00", "08:45")]
        availability = {"PHI01": phi()}

        with self.assertRaises(ValueError):
            reschedule_tasks(plan, availability, "PHI99")

    def test_completed_task_is_not_reassigned(self):
        plan = [
            task(
                "TASK-1", "PHI02", "08:00", "08:45",
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
                "TASK-1", "PHI02", "08:00", "08:45",
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
        active = by_id["TASK-1"]

        self.assertEqual(active["task_status"], "In Progress")
        self.assertEqual(active["assigned_phi"], "PHI02")
        self.assertEqual(active["start_time"], "08:00")
        self.assertEqual(active["end_time"], "08:45")
        self.assertEqual(active["status"], "Scheduled")

    def test_missing_execution_status_is_rejected(self):
        plan = [task("TASK-1", "PHI01", "08:00", "08:45")]
        del plan[0]["task_status"]

        with self.assertRaisesRegex(ValueError, "Execution status is missing"):
            reschedule_tasks(plan, {"PHI01": phi()}, "PHI01")

    def test_explicit_pending_simulation_is_supported(self):
        plan = [task("TASK-1", "PHI01", "08:00", "08:45")]
        del plan[0]["task_status"]

        result = reschedule_tasks(
            plan,
            {"PHI01": phi()},
            "PHI01",
            assume_all_pending=True,
        )

        self.assertEqual(result[0]["task_status"], "Pending")

    def test_reassignment_respects_existing_workload_time(self):
        plan = [
            task("TASK-1", "PHI02", "08:00", "08:45"),
        ]

        # PHI01 has two existing workload tasks.
        # The first 90 minutes (08:00-09:30) are reserved.
        availability = {
            "PHI01": phi(capacity=4, workload=2),
            "PHI02": phi(capacity=4),
        }

        result = reschedule_tasks(plan, availability, "PHI02")
        reassigned = result[0]

        self.assertEqual(reassigned["status"], "Scheduled")
        self.assertEqual(reassigned["assigned_phi"], "PHI01")
        self.assertGreaterEqual(
            int(reassigned["start_time"][:2]) * 60
            + int(reassigned["start_time"][3:]),
            9 * 60 + 30,
            "Reassigned task must start after the reserved 90 minutes.",
        )

    def test_reassignment_respects_workload_and_existing_appointments(self):
        plan = [
            task("TASK-1", "PHI01", "09:30", "10:15"),
            task("TASK-2", "PHI02", "08:00", "08:45"),
        ]

        availability = {
            # One workload task reserves 08:00-08:45.
            # TASK-1 already occupies 09:30-10:15.
            "PHI01": phi(capacity=4, workload=1),
            "PHI02": phi(capacity=4),
        }

        result = reschedule_tasks(plan, availability, "PHI02")
        by_id = {row["scenario_task_id"]: row for row in result}
        reassigned = by_id["TASK-2"]

        self.assertEqual(reassigned["status"], "Scheduled")
        self.assertEqual(reassigned["assigned_phi"], "PHI01")
        self.assertEqual(reassigned["start_time"], "08:45")
        self.assertEqual(reassigned["end_time"], "09:30")

    def test_rejects_invalid_execution_status(self):
        plan = [
            task(
                "TASK-1", "PHI01", "08:00", "08:45",
                task_status="Unknown",
            )
        ]

        with self.assertRaisesRegex(ValueError, "Invalid task_status"):
            reschedule_tasks(plan, {"PHI01": phi()}, "PHI01")


if __name__ == "__main__":
    unittest.main()
