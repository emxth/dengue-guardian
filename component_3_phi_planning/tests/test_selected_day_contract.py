"""Selected-day task loading regressions using temporary SQLite fixtures."""

import sqlite3

from component_3_phi_planning.optimization import phi_scheduler


def _scored(task_id, date_key, date_field):
    return {
        "task_id": task_id,
        date_field: date_key,
        "priority_score": 80.0,
        "priority_level": "High",
        "priority_reason": "fixture score",
        "priority_factors": {},
        "data_quality_status": "complete",
        "component2_risk_score": 0.8,
        "component2_risk_level": "High",
        "activity_score": 50,
    }


def test_load_tasks_only_imports_selected_day_case_and_complaint_rows(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "selected-day.sqlite"
    date_rows = [
        ("2026-07-30", "CASE-TODAY"),
        ("2026-07-01", "CASE-JULY-1"),
        ("2026-07-02", "CASE-JULY-2"),
        ("2026-06-03", "CASE-JUNE-3"),
        ("2026-04-30", "CASE-APRIL-30"),
    ]
    complaint_rows = [
        ("2026-07-30", "COMPLAINT-TODAY"),
        ("2026-07-01", "COMPLAINT-JULY-1"),
        ("2026-07-02", "COMPLAINT-JULY-2"),
        ("2026-06-03", "COMPLAINT-JUNE-3"),
        ("2026-04-30", "COMPLAINT-APRIL-30"),
    ]
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Case_Notifications (
                task_id TEXT, notification_date TEXT, inspection_required TEXT,
                location_id TEXT, moh_area TEXT, phi_range TEXT,
                village_area TEXT, location_label TEXT
            );
            CREATE TABLE Citizen_Complaints (
                complaint_id TEXT, received_date TEXT, status TEXT,
                location_id TEXT, moh_area TEXT, phi_range TEXT,
                village_area TEXT, location_label TEXT, urgency TEXT,
                complaint_type TEXT
            );
            """
        )
        connection.executemany(
            "INSERT INTO Case_Notifications VALUES (?, ?, 'Yes', 'LOC1', 'Kaduwela', 'Range A', 'Village', 'Point')",
            [(task_id, date_key) for date_key, task_id in date_rows],
        )
        connection.executemany(
            "INSERT INTO Citizen_Complaints VALUES (?, ?, 'Open', 'LOC1', 'Kaduwela', 'Range A', 'Village', 'Point', 'High', 'Water')",
            [(task_id, date_key) for date_key, task_id in complaint_rows],
        )

    monkeypatch.setattr(phi_scheduler, "DB_PATH", database_path)
    monkeypatch.setattr(
        phi_scheduler,
        "score_cases",
        lambda _connection, _date: [
            _scored(task_id, date_key, "notification_date")
            for date_key, task_id in date_rows
        ],
    )
    monkeypatch.setattr(
        phi_scheduler,
        "score_complaints",
        lambda _connection, _date: [
            _scored(task_id, date_key, "received_date")
            for date_key, task_id in complaint_rows
        ],
    )

    tasks = phi_scheduler.load_tasks("2026-07-30")

    assert {task["scenario_task_id"] for task in tasks} == {
        "SIM-CASE-CASE-TODAY",
        "SIM-COMPLAINT-COMPLAINT-TODAY",
    }
    assert {task["task_date"] for task in tasks} == {"2026-07-30"}
