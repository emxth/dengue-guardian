
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


def task(task_id, assigned_phi, start, end, priority="High", score=90):
    return {
        "scenario_task_id": task_id,
        "assigned_phi": assigned_phi,
        "start_time": start,
        "end_time": end,
        "status": "Scheduled",
        "priority_level": priority,
        "priority_score": str(score),
        "reason": "Original assignment",
    }


class TestPhiRescheduler(unittest.TestCase):

    def test_reassigns_task_to_available_phi(self):
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

        # The input plan must remain unchanged.
        self.assertEqual(plan[1]["assigned_phi"], "PHI02")
        self.assertEqual(plan[1]["start_time"], "08:00")

    def test_marks_task_unscheduled_when_capacity_is_full(self):
        plan = [
            task("TASK-1", "PHI01", "08:00", "08:45"),
            task("TASK-2", "PHI02", "08:00", "08:45"),
        ]

        availability = {
            "PHI01": phi(capacity=1),
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


if __name__ == "__main__":
    unittest.main()
