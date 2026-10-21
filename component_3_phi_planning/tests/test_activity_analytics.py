"""Tests for location-level monthly activity and analytics API behavior."""

import sqlite3
from datetime import date, timedelta

from fastapi.testclient import TestClient

from component_3_phi_planning.api.main import app
from component_3_phi_planning.api.routes import planning as planning_routes
from component_3_phi_planning.prioritization.activity_analytics import (
    get_monthly_location_analytics,
)


client = TestClient(app)


def make_analytics_database(path):
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT PRIMARY KEY,
                village_area TEXT
            );
            CREATE TABLE Case_Notifications (
                task_id TEXT,
                location_id TEXT,
                notification_date TEXT
            );
            CREATE TABLE Citizen_Complaints (
                complaint_id TEXT,
                location_id TEXT,
                received_date TEXT
            );
            INSERT INTO Locations VALUES
                ('LOC001', 'Area One'), ('LOC002', 'Area Two');
            """
        )
        day = date(2025, 1, 1)
        end = date(2025, 2, 28)
        while day <= end:
            # LOC002 proves global source coverage even when LOC001 has zero.
            connection.execute(
                "INSERT INTO Case_Notifications VALUES (?, ?, ?)",
                (f"BASE-{day.isoformat()}", "LOC002", day.isoformat()),
            )
            connection.execute(
                "INSERT INTO Citizen_Complaints VALUES (?, ?, ?)",
                (f"CB-{day.isoformat()}", "LOC002", day.isoformat()),
            )
            day += timedelta(days=1)
        connection.executemany(
            "INSERT INTO Case_Notifications VALUES (?, ?, ?)",
            [
                ("CASE-JAN-A", "LOC001", "2025-01-31"),
                ("CASE-JAN-A", "LOC001", "2025-01-31"),
                ("CASE-JAN-B", "LOC001", "2025-01-31"),
            ],
        )
        connection.executemany(
            "INSERT INTO Citizen_Complaints VALUES (?, ?, ?)",
            [
                ("COMPLAINT-JAN-A", "LOC001", "2025-01-31"),
                ("COMPLAINT-JAN-A", "LOC001", "2025-01-31"),
            ],
        )


def test_monthly_analytics_location_year_boundaries_zero_and_dedup(tmp_path):
    database_path = tmp_path / "analytics.sqlite"
    make_analytics_database(database_path)

    with sqlite3.connect(database_path) as connection:
        result = get_monthly_location_analytics(
            connection, "LOC001", 2025, "cases"
        )

    assert len(result["months"]) == 12
    assert result["months"][0]["month"] == "2025-01"
    assert result["months"][0]["count"] == 2
    assert result["months"][0]["coverage_status"] == "complete"
    assert result["months"][1]["count"] == 0
    assert result["months"][1]["coverage_status"] == "complete"
    assert result["months"][2]["count"] is None
    assert result["months"][2]["coverage_status"] == "unavailable"
    assert result["months"][1]["month_over_month_change_pct"] == -100
    assert result["months"][2]["month_over_month_change_pct"] is None


def test_monthly_analytics_metric_and_location_are_filtered(tmp_path):
    database_path = tmp_path / "analytics.sqlite"
    make_analytics_database(database_path)

    with sqlite3.connect(database_path) as connection:
        cases = get_monthly_location_analytics(
            connection, "LOC002", 2025, "cases"
        )
        complaints = get_monthly_location_analytics(
            connection, "LOC001", 2025, "complaints"
        )

    assert cases["months"][0]["count"] == 31
    assert cases["months"][1]["count"] == 28
    assert complaints["months"][0]["count"] == 1
    assert complaints["months"][1]["count"] == 0


def test_monthly_analytics_api_validates_location_and_returns_source_data(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "analytics.sqlite"
    make_analytics_database(database_path)
    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)

    response = client.get(
        "/api/v1/planning/analytics/monthly"
        "?location_id=LOC001&year=2025&metric=cases"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_mode"] == "synthetic_research_data"
    assert body["months"][0]["count"] == 2
    assert body["months"][1]["count"] == 0

    unknown = client.get(
        "/api/v1/planning/analytics/monthly?location_id=LOC999&year=2025"
    )
    assert unknown.status_code == 422

    invalid_metric = client.get(
        "/api/v1/planning/analytics/monthly"
        "?location_id=LOC001&year=2025&metric=weather"
    )
    assert invalid_metric.status_code == 422


def test_monthly_analytics_empty_period_returns_unavailable_months(tmp_path):
    database_path = tmp_path / "analytics.sqlite"
    make_analytics_database(database_path)
    with sqlite3.connect(database_path) as connection:
        result = get_monthly_location_analytics(
            connection, "LOC001", 2024, "cases"
        )

    assert len(result["months"]) == 12
    assert all(month["count"] is None for month in result["months"])
    assert all(month["coverage_status"] == "unavailable" for month in result["months"])