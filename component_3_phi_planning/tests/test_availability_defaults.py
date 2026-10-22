"""Regression coverage for master-backed default PHI availability."""

import sqlite3

from component_3_phi_planning.api import availability_store
from component_3_phi_planning.optimization import phi_scheduler
from component_3_phi_planning.rescheduling import phi_rescheduler


def _create_master_database(path, daily_rows=()):
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE PHI_Master (
                phi_id TEXT, moh_area TEXT, phi_range TEXT,
                primary_village_area TEXT, working_start TEXT,
                working_end TEXT, nominal_daily_capacity INTEGER
            );
            CREATE TABLE PHI_Daily (
                date TEXT, phi_id TEXT, phi_range TEXT, availability TEXT,
                working_start TEXT, working_end TEXT,
                daily_capacity INTEGER, existing_workload INTEGER
            );
            """
        )
        connection.executemany(
            "INSERT INTO PHI_Master VALUES (?, 'Kaduwela', ?, ?, '08:00', '16:00', 6)",
            [
                (f"PHI{index:02d}", f"Range {index}", f"Village {index}")
                for index in range(1, 13)
            ],
        )
        connection.executemany(
            "INSERT INTO PHI_Daily VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            daily_rows,
        )


def test_all_twelve_master_phis_default_available_without_daily_rows(tmp_path):
    database_path = tmp_path / "no-daily-rows.sqlite"
    override_path = tmp_path / "availability.json"
    _create_master_database(database_path)

    with sqlite3.connect(database_path) as connection:
        phis = availability_store.load_phi_daily_defaults(
            connection,
            "2026-10-12",
            override_path,
        )

    assert len(phis) == 12
    assert all(phi["availability"] == "Available" for phi in phis.values())
    assert sum(phi["remaining_capacity"] for phi in phis.values()) == 72
    assert all(phi["working_start"] == "08:00" for phi in phis.values())
    assert not override_path.exists()


def test_unavailable_override_is_date_specific_and_overrides_default(tmp_path):
    database_path = tmp_path / "date-specific.sqlite"
    override_path = tmp_path / "availability.json"
    _create_master_database(database_path)
    availability_store.save_availability_override(
        "PHI01", "2026-10-12", "Unavailable", override_path
    )

    with sqlite3.connect(database_path) as connection:
        selected = availability_store.load_phi_daily_defaults(
            connection,
            "2026-10-12",
            override_path,
        )
        other_date = availability_store.load_phi_daily_defaults(
            connection,
            "2026-10-13",
            override_path,
        )

    assert selected["PHI01"]["availability"] == "Unavailable"
    assert selected["PHI01"]["remaining_capacity"] == 6
    assert other_date["PHI01"]["availability"] == "Available"
    assert len(selected) == len(other_date) == 12


def test_daily_capacity_and_workload_rows_are_preserved_with_default_availability(
    tmp_path,
):
    database_path = tmp_path / "capacity-from-daily.sqlite"
    _create_master_database(database_path, [(
        "2026-10-12", "PHI01", "Range 1", "Unavailable",
        "09:00", "11:15", 3, 1,
    )])

    with sqlite3.connect(database_path) as connection:
        phis = availability_store.load_phi_daily_defaults(
            connection,
            "2026-10-12",
            tmp_path / "availability.json",
        )

    phi = phis["PHI01"]
    assert phi["availability"] == "Available"
    assert phi["daily_capacity"] == 3
    assert phi["existing_workload"] == 1
    assert phi["remaining_capacity"] == 2
    assert phi["working_start"] == "09:00"
    assert phi["working_end"] == "11:15"


def test_scheduler_can_allocate_using_master_defaults_without_daily_rows(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "scheduler-defaults.sqlite"
    override_path = tmp_path / "availability.json"
    _create_master_database(database_path)
    monkeypatch.setattr(phi_scheduler, "DB_PATH", database_path)
    monkeypatch.setattr(availability_store, "PHI_AVAILABILITY_PATH", override_path)

    phis = phi_scheduler.load_phis("2026-10-12")
    plan, status = phi_scheduler.solve_schedule(
        [{
            "scenario_task_id": "TASK-DEFAULT-PHI",
            "task_type": "Dengue Case Inspection",
            "task_date": "2026-10-12",
            "moh_area": "Kaduwela",
            "phi_range": "Range 1",
            "priority_score": 80,
            "priority_level": "High",
        }],
        phis,
        "2026-10-12",
    )

    assert len(phis) == 12
    assert status in {"OPTIMAL", "FEASIBLE"}
    assert plan[0]["status"] == "Scheduled"
    assert plan[0]["assigned_phi"] == "PHI01"
    assert plan[0]["start_time"] == "08:00"


def test_rescheduler_defaults_roster_and_respects_unavailable_override(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "rescheduler-defaults.sqlite"
    override_path = tmp_path / "availability.json"
    _create_master_database(database_path)
    monkeypatch.setattr(phi_rescheduler, "DB_PATH", database_path)
    monkeypatch.setattr(availability_store, "PHI_AVAILABILITY_PATH", override_path)

    roster = phi_rescheduler.read_phi_daily("2026-10-12")
    assert len(roster) == 12
    assert all(row["availability"] == "Available" for row in roster.values())

    availability_store.save_availability_override(
        "PHI01", "2026-10-12", "Unavailable", override_path
    )
    roster = phi_rescheduler.read_phi_daily("2026-10-12")
    result = phi_rescheduler.reschedule_tasks(
        [{
            "scenario_task_id": "TASK-RESCHEDULE-DEFAULT",
            "assigned_phi": "PHI01",
            "start_time": "08:00",
            "end_time": "08:45",
            "status": "Scheduled",
            "task_status": "Pending",
            "priority_level": "High",
            "priority_score": "90",
            "moh_area": "Kaduwela",
            "phi_range": "Range 1",
        }],
        roster,
        "PHI01",
    )

    assert result[0]["status"] == "Scheduled"
    assert result[0]["assigned_phi"] != "PHI01"
    assert result[0]["task_status"] == "Pending"
