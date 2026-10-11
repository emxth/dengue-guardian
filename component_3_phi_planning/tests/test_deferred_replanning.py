"""Unit tests for multi-day deferred-task replanning."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "rescheduling"))

from urgent_complaint_scenario import (
    DEFERRED_REASON_PREFIX,
    URGENT_TASK_ID,
    insert_urgent_complaint,
    replan_deferred_tasks,
    validate_plan,
)


def details(capacity=1, workload=0, availability="Available", start="08:00", end="09:30"):
    return {
        "phi_range": "Test Range",
        "availability": availability,
        "working_start": start,
        "working_end": end,
        "daily_capacity": capacity,
        "existing_workload": workload,
    }


def task(task_id, priority="Medium", score="60", phi="PHI01",
         start="08:00", end="08:45", date="2026-04-01", status="Scheduled",
         task_status="Pending"):
    return {
        "scenario_task_id": task_id,
        "source_id": task_id,
        "task_type": "Dengue Case Inspection",
        "priority_score": score,
        "priority_level": priority,
        "location_id": "LOC001",
        "phi_range": "Test Range",
        "village_area": "Test Area",
        "planning_date": date,
        "assigned_phi": phi if status == "Scheduled" else "",
        "start_time": start if status == "Scheduled" else "",
        "end_time": end if status == "Scheduled" else "",
        "status": status,
        "reason": "Original appointment",
        "task_status": task_status,
    }


class DeferredReplanningTests(unittest.TestCase):
    def setUp(self):
        self.date1 = "2026-04-01"
        self.date2 = "2026-04-02"
        self.day1 = {"PHI01": details(capacity=1, start="08:00", end="08:45")}
        self.day2 = {"PHI01": details(capacity=1, start="08:00", end="08:45")}

    def test_deferred_task_is_replanned_to_next_day(self):
        original = [task("TASK-MEDIUM")]
        inserted = insert_urgent_complaint(original, self.day1, self.date1)
        self.assertEqual(
            next(row for row in inserted if row["scenario_task_id"] == "TASK-MEDIUM")["status"],
            "Unscheduled",
        )

        daily_by_date = {self.date1: self.day1, self.date2: self.day2}
        replanned = replan_deferred_tasks(inserted, daily_by_date, self.date1)
        deferred = next(row for row in replanned if row["scenario_task_id"] == "TASK-MEDIUM")
        urgent = next(row for row in replanned if row["scenario_task_id"] == URGENT_TASK_ID)

        self.assertEqual(deferred["status"], "Scheduled")
        self.assertEqual(deferred["planning_date"], self.date2)
        self.assertEqual(deferred["assigned_phi"], "PHI01")
        self.assertEqual(urgent["planning_date"], self.date1)
        validate_plan(original, replanned, daily_by_date)

    def test_no_future_slot_leaves_deferred_task_unscheduled(self):
        original = [task("TASK-MEDIUM")]
        inserted = insert_urgent_complaint(original, self.day1, self.date1)
        replanned = replan_deferred_tasks(
            inserted, {self.date1: self.day1}, self.date1
        )
        deferred = next(row for row in replanned if row["scenario_task_id"] == "TASK-MEDIUM")
        self.assertEqual(deferred["status"], "Unscheduled")
        self.assertIn("no feasible slot", deferred["reason"])
        validate_plan(original, replanned, {self.date1: self.day1})

    def test_completed_task_is_not_deferred(self):
        original = [
            task("TASK-COMPLETED", priority="Low", score="10",
                 start="08:00", end="08:45", task_status="Completed")
        ]
        inserted = insert_urgent_complaint(original, self.day1, self.date1)
        completed = next(row for row in inserted if row["scenario_task_id"] == "TASK-COMPLETED")
        self.assertEqual(completed["status"], "Scheduled")
        self.assertEqual(completed["start_time"], "08:00")
        self.assertFalse(completed["reason"].startswith(DEFERRED_REASON_PREFIX))

    def test_in_progress_task_is_not_deferred(self):
        original = [
            task("TASK-IN-PROGRESS", priority="Low", score="10",
                 start="08:00", end="08:45", task_status="In Progress")
        ]
        inserted = insert_urgent_complaint(original, self.day1, self.date1)
        current = next(row for row in inserted if row["scenario_task_id"] == "TASK-IN-PROGRESS")
        self.assertEqual(current["status"], "Scheduled")
        self.assertEqual(current["start_time"], "08:00")
        self.assertFalse(current["reason"].startswith(DEFERRED_REASON_PREFIX))


if __name__ == "__main__":
    unittest.main()
