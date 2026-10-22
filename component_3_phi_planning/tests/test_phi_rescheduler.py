
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

    def test_cancelled_task_is_not_reassigned(self):
        plan = [
            task(
                "TASK-CANCELLED", "PHI02", "08:00", "08:45",
                task_status="Cancelled",
            ),
            task("TASK-PENDING", "PHI02", "08:45", "09:30"),
        ]
        availability = {
            "PHI01": phi(capacity=3),
            "PHI02": phi(capacity=3),
        }

        result = reschedule_tasks(plan, availability, "PHI02")
        cancelled = next(
            row for row in result
            if row["scenario_task_id"] == "TASK-CANCELLED"
        )

        self.assertEqual(cancelled["task_status"], "Cancelled")
        self.assertEqual(cancelled["assigned_phi"], "PHI02")
        self.assertEqual(cancelled["start_time"], "08:00")

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

    def test_higher_score_is_reassigned_before_older_lower_score_task(self):
        plan = [
            {**task("TASK-OLDER-LOWER", "PHI02", "08:00", "08:45", score=80),
             "task_date": "2026-03-01"},
            {**task("TASK-NEWER-HIGHER", "PHI02", "08:45", "09:30", score=99),
             "task_date": "2026-04-03"},
        ]
        availability = {
            "PHI01": phi(capacity=1),
            "PHI02": phi(capacity=2),
        }

        result = reschedule_tasks(
            plan,
            availability,
            "PHI02",
        )

        higher_score = next(row for row in result if row["scenario_task_id"] == "TASK-NEWER-HIGHER")
        older_lower_score = next(row for row in result if row["scenario_task_id"] == "TASK-OLDER-LOWER")
        self.assertEqual(higher_score["assigned_phi"], "PHI01")
        self.assertEqual(older_lower_score["status"], "Unscheduled")

    def test_review_fallback_tier_orders_adaptive_reassignment(self):
        low_fallback = task(
            "TASK-LOW-FALLBACK", "PHI02", "08:00", "08:45", score=0,
        )
        high_fallback = task(
            "TASK-HIGH-FALLBACK", "PHI02", "08:45", "09:30", score=0,
        )
        for row, fallback in (
            (low_fallback, "Low"),
            (high_fallback, "High"),
        ):
            row.update({
                "priority_score": None,
                "priority_level": "Review",
                "scheduling_priority_level": fallback,
                "priority_fallback": True,
            })

        result = reschedule_tasks(
            [low_fallback, high_fallback],
            {
                "PHI01": phi(capacity=1),
                "PHI02": phi(capacity=2, availability="Unavailable"),
            },
            "PHI02",
        )
        by_id = {row["scenario_task_id"]: row for row in result}

        self.assertEqual(by_id["TASK-HIGH-FALLBACK"]["assigned_phi"], "PHI01")
        self.assertEqual(by_id["TASK-HIGH-FALLBACK"]["status"], "Scheduled")
        self.assertEqual(by_id["TASK-LOW-FALLBACK"]["status"], "Unscheduled")

    def test_reassignment_prefers_responsible_range_when_feasible(self):
        pending = task("TASK-LOCAL", "PHI-UNAVAILABLE", "08:00", "08:45")
        pending.update({"moh_area": "Kaduwela", "phi_range": "Local Range"})
        plan = [pending]
        availability = {
            "PHI-UNAVAILABLE": {
                **phi(availability="Unavailable"),
                "moh_area": "Kaduwela",
                "phi_range": "Local Range",
            },
            "PHI-BACKUP": {
                **phi(capacity=2),
                "moh_area": "Kaduwela",
                "phi_range": "Other Range",
            },
            "PHI-LOCAL": {
                **phi(capacity=2),
                "moh_area": "Kaduwela",
                "phi_range": "Local Range",
            },
        }

        result = reschedule_tasks(plan, availability, "PHI-UNAVAILABLE")

        self.assertEqual(result[0]["status"], "Scheduled")
        self.assertEqual(result[0]["assigned_phi"], "PHI-LOCAL")

    def test_reassignment_prefers_primary_village_phi(self):
        pending = task("TASK-VILLAGE", "PHI-UNAVAILABLE", "08:00", "08:45")
        pending.update({"moh_area": "Kaduwela", "village_area": "Village A"})
        availability = {
            "PHI-UNAVAILABLE": {
                **phi(availability="Unavailable"),
                "moh_area": "Kaduwela",
                "primary_village_area": "Village A",
            },
            "PHI-B": {
                **phi(capacity=2),
                "moh_area": "Kaduwela",
                "primary_village_area": "Village B",
            },
            "PHI-A": {
                **phi(capacity=2),
                "moh_area": "Kaduwela",
                "primary_village_area": "Village A",
            },
        }

        result = reschedule_tasks(plan=[pending], phi_daily=availability, unavailable_phi="PHI-UNAVAILABLE")

        self.assertEqual(result[0]["status"], "Scheduled")
        self.assertEqual(result[0]["assigned_phi"], "PHI-A")

    def test_reassignment_attempts_same_day_before_carried_task(self):
        carried = task("TASK-CARRIED", "PHI-UNAVAILABLE", "08:00", "08:45", score=100)
        carried.update({"task_date": "2026-05-04", "moh_area": "Kaduwela"})
        today = task("TASK-TODAY", "PHI-UNAVAILABLE", "08:45", "09:30", score=40)
        today.update({"task_date": "2026-05-06", "moh_area": "Kaduwela"})
        roster = {
            "PHI-UNAVAILABLE": {
                **phi(availability="Unavailable", capacity=2),
                "moh_area": "Kaduwela",
            },
            "PHI-OTHER": {
                **phi(capacity=1),
                "moh_area": "Kaduwela",
                "phi_range": "Other Range",
            },
        }

        result = reschedule_tasks(
            [carried, today],
            roster,
            "PHI-UNAVAILABLE",
            planning_date="2026-05-06",
        )
        by_id = {row["scenario_task_id"]: row for row in result}

        self.assertEqual(by_id["TASK-TODAY"]["assigned_phi"], "PHI-OTHER")
        self.assertEqual(by_id["TASK-CARRIED"]["status"], "Unscheduled")

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
