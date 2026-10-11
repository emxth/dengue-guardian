
"""Tests for urgent complaint insertion and priority-aware deferral."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "rescheduling"))

from urgent_complaint_scenario import (
    insert_urgent_complaint,
    validate_plan,
)


def make_task(task_id, score, level, start="09:00", end="09:45"):
    return {
        "scenario_task_id": task_id,
        "source_id": task_id,
        "task_type": "Dengue Case Inspection",
        "priority_score": str(score),
        "priority_level": level,
        "location_id": "LOC001",
        "phi_range": "Test Range",
        "village_area": "Test Area",
        "planning_date": "2026-04-01",
        "assigned_phi": "PHI01",
        "start_time": start,
        "end_time": end,
        "status": "Scheduled",
        "reason": "Existing appointment",
        "task_status": "Pending",
    }


def make_phi_daily(start="09:00", end="09:45", capacity=1):
    return {
        "PHI01": {
            "phi_range": "Test Range",
            "availability": "Available",
            "working_start": start,
            "working_end": end,
            "daily_capacity": capacity,
            "existing_workload": 0,
        }
    }


class UrgentComplaintCapacityTests(unittest.TestCase):

    def test_urgent_complaint_remains_unscheduled_if_higher_priority_task_exists(self):
        plan = [make_task("SIM-HIGHER-001", 95, "High")]
        phi_daily = make_phi_daily()

        updated = insert_urgent_complaint(
            plan, phi_daily, "2026-04-01"
        )
        urgent = next(
            row for row in updated
            if row["scenario_task_id"] == "SIM-URGENT-COMPLAINT-001"
        )

        self.assertEqual(urgent["status"], "Unscheduled")
        self.assertEqual(updated[0]["start_time"], "09:00")
        self.assertEqual(updated[0]["end_time"], "09:45")
        validate_plan(plan, updated, phi_daily)

    def test_urgent_complaint_defers_lower_priority_pending_task(self):
        plan = [make_task("SIM-MEDIUM-001", 60, "Medium")]
        phi_daily = make_phi_daily()

        updated = insert_urgent_complaint(
            plan, phi_daily, "2026-04-01"
        )
        urgent = next(
            row for row in updated
            if row["scenario_task_id"] == "SIM-URGENT-COMPLAINT-001"
        )
        deferred = next(
            row for row in updated
            if row["scenario_task_id"] == "SIM-MEDIUM-001"
        )

        self.assertEqual(urgent["status"], "Scheduled")
        self.assertEqual(urgent["assigned_phi"], "PHI01")
        self.assertEqual(urgent["start_time"], "09:00")
        self.assertEqual(urgent["end_time"], "09:45")

        self.assertEqual(deferred["status"], "Unscheduled")
        self.assertEqual(deferred["task_status"], "Pending")
        self.assertEqual(deferred["assigned_phi"], "")
        self.assertIn("Deferred to accommodate", deferred["reason"])

        validate_plan(plan, updated, phi_daily)

    def test_duplicate_urgent_task_id_is_rejected(self):
        plan = [{
            "scenario_task_id": "SIM-URGENT-COMPLAINT-001",
            "status": "Unscheduled",
            "assigned_phi": "",
            "start_time": "",
            "end_time": "",
            "priority_score": "90",
            "priority_level": "High",
        }]

        with self.assertRaisesRegex(ValueError, "Duplicate scenario task ID"):
            insert_urgent_complaint(
                plan, {}, "2026-04-01"
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
