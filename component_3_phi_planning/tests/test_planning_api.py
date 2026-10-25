
"""Automated tests for the C3 PHI Planning API."""

import csv
import sqlite3

import pytest
from fastapi.testclient import TestClient

from component_3_phi_planning.api import availability_store, plan_store, task_store
from component_3_phi_planning.api.routes import planning as planning_routes

from component_3_phi_planning.api.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_submitted_task_store(tmp_path, monkeypatch):
    monkeypatch.setattr(
        task_store,
        "TASK_STORE_PATH",
        tmp_path / "submitted_tasks.json",
    )
    monkeypatch.setattr(
        availability_store,
        "PHI_AVAILABILITY_PATH",
        tmp_path / "phi_availability_overrides.json",
    )
    monkeypatch.setattr(
        plan_store,
        "PLAN_STATE_PATH",
        tmp_path / "schedule_states.json",
    )


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["data_mode"] == "synthetic_research_data"


def test_completed_inspections_are_date_scoped_and_hide_submission_uuid(monkeypatch):
    class Cursor(list):
        def sort(self, key, direction):
            return Cursor(sorted(self, key=lambda row: row.get(key, ""), reverse=direction < 0))

    class Reports:
        def find(self, query, _projection):
            assert query == {
                "report_status": "Submitted",
                "inspection_date": "2026-10-23",
            }
            return Cursor([{
                "report_id": "private-report-id",
                "report_status": "Submitted",
                "inspection_date": "2026-10-23",
                "submitted_at": "2026-10-23T07:00:00Z",
                "phi_id": "PHI01",
                "task": {"scenario_task_id": "TASK-1"},
                "form": {
                    "client_submission_id": "private-submission-id",
                    "actions_taken": "Removed standing water",
                },
            }])

    database = type("Database", (), {"inspection_reports": Reports()})()
    monkeypatch.setattr(planning_routes, "get_database", lambda: database)
    local_client = TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000))

    response = local_client.get(
        "/api/v1/planning/completed-inspections?inspection_date=2026-10-23"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["reports"][0]["form"] == {"actions_taken": "Removed standing water"}
    assert "report_id" not in body["reports"][0]


def test_priorities_endpoint():
    response = client.get("/api/v1/planning/priorities?limit=5")

    assert response.status_code == 200
    body = response.json()

    assert body["data_mode"] == "synthetic_research_data"
    assert body["scoring_policy"] == "provisional"
    assert body["total_cases"] == 6050
    assert body["total_complaints"] == 811
    assert body["date_coverage"] == {
        "task_date_from": "2026-04-01",
        "task_date_to": "2026-09-30",
        "score_as_of_max": "2026-09-30",
    }
    assert len(body["tasks"]) == 5
    assert len(body["cases"]) + len(body["complaints"]) == 5


def test_priorities_includes_location_information():
    response = client.get("/api/v1/planning/priorities?limit=50")

    assert response.status_code == 200
    body = response.json()

    assert "locations" in body
    assert "LOC001" in body["locations"]
    assert body["locations"]["LOC001"]["location_name"] == "Malabe East"
    assert "Synthetic Point" in body["locations"]["LOC001"]["location_label"]

    first_case = body["cases"][0]
    assert "location_id" in first_case
    assert "location_name" in first_case
    assert "location_label" in first_case
    assert first_case["location_name"] != ""

    first_complaint = body["complaints"][0]
    assert "location_id" in first_complaint
    assert "location_name" in first_complaint
    assert "location_label" in first_complaint
    assert first_complaint["location_name"] != ""


def test_priorities_rejects_invalid_limit():
    response = client.get("/api/v1/planning/priorities?limit=0")

    assert response.status_code == 422


def test_priority_pages_have_no_gaps_and_aggregates_cover_full_filtered_set(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "priority-pages.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, village_area TEXT, location_label TEXT,
                phi_range TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
            );
            CREATE TABLE Case_Notifications (notification_date TEXT);
            CREATE TABLE Citizen_Complaints (received_date TEXT);
            INSERT INTO Case_Notifications VALUES ('2026-07-02');
            INSERT INTO Citizen_Complaints VALUES ('2026-07-02');
            INSERT INTO Locations VALUES
                ('LOC001', 'Area One', 'Point One', 'Range One'),
                ('LOC002', 'Area Two', 'Point Two', 'Range Two');
            INSERT INTO Component2_Location_Risk VALUES
                ('LOC001', 0.8, 'High', 'test'),
                ('LOC002', 0.4, 'Medium', 'test');
            """
        )

    cases = [
        {
            "task_id": f"DNG{i:05d}",
            "task_type": "Dengue Case Inspection",
            "notification_date": "2026-07-01",
            "location_id": "LOC001" if i % 2 == 0 else "LOC002",
            "location_name": "Area One" if i % 2 == 0 else "Area Two",
            "priority_score": float(90 - i),
            "priority_level": "High" if i < 3 else "Medium",
        }
        for i in range(7)
    ]
    complaints = [
        {
            "task_id": f"CMP{i:05d}",
            "task_type": "Citizen Complaint",
            "received_date": "2026-07-02",
            "location_id": "LOC001",
            "location_name": "Area One",
            "priority_score": 60.0,
            "priority_level": "Medium",
        }
        for i in range(4)
    ]
    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    monkeypatch.setattr(planning_routes, "score_cases", lambda _connection, _date: cases)
    monkeypatch.setattr(planning_routes, "score_complaints", lambda _connection, _date: complaints)
    monkeypatch.setattr(
        planning_routes,
        "calculate_location_activity",
        lambda _connection, _location, _date: {"activity_score": 50},
    )
    monkeypatch.setattr(planning_routes, "_PRIORITY_SNAPSHOT_CACHE", {})

    pages = []
    for offset in (0, 3, 6, 9):
        response = client.get(
            "/api/v1/planning/priorities?limit=3&offset="
            f"{offset}&planning_date=2026-07-02&date_from=2026-07-01&date_to=2026-07-02"
        )
        assert response.status_code == 200
        pages.extend(response.json()["tasks"])
        if offset == 0:
            first_body = response.json()

    task_ids = [row["task_id"] for row in pages]
    assert len(task_ids) == 11
    assert len(set(task_ids)) == 11
    assert first_body["total_matching"] == 11
    assert first_body["summary"] == {
        "high": 3,
        "medium": 8,
        "low": 0,
        "review": 0,
        "total": 11,
    }
    loc001 = next(
        row for row in first_body["location_summary"]
        if row["location_id"] == "LOC001"
    )
    assert loc001["total"] == 8
    assert loc001["high"] == 2
    assert loc001["medium"] == 6

    filtered = client.get(
        "/api/v1/planning/priorities?limit=2&location_id=LOC002"
        "&planning_date=2026-07-02&date_from=2026-07-01&date_to=2026-07-02"
    ).json()
    assert filtered["total_matching"] == 3
    assert all(row["location_id"] == "LOC002" for row in filtered["tasks"])
    assert filtered["location_summary"][0]["total"] == 3


def test_new_task_after_historical_period_is_returned_in_later_range(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "future-priority.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, village_area TEXT, location_label TEXT,
                phi_range TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
            );
            CREATE TABLE Case_Notifications (notification_date TEXT);
            CREATE TABLE Citizen_Complaints (received_date TEXT);
            INSERT INTO Locations VALUES ('LOC001', 'Area One', 'Point', 'Range');
            INSERT INTO Component2_Location_Risk VALUES ('LOC001', 0.8, 'High', 'test');
            INSERT INTO Case_Notifications VALUES ('2027-01-02');
            INSERT INTO Citizen_Complaints VALUES ('2027-01-02');
            """
        )
    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    monkeypatch.setattr(planning_routes, "_PRIORITY_SNAPSHOT_CACHE", {})
    monkeypatch.setattr(
        planning_routes,
        "score_cases",
        lambda _connection, _date: [{
            "task_id": "DNG-NEW",
            "task_type": "Dengue Case Inspection",
            "notification_date": "2027-01-02",
            "location_id": "LOC001",
            "location_name": "Area One",
            "priority_score": 75.0,
            "priority_level": "High",
        }],
    )
    monkeypatch.setattr(planning_routes, "score_complaints", lambda _connection, _date: [])
    monkeypatch.setattr(
        planning_routes,
        "calculate_location_activity",
        lambda _connection, _location, _date: {"activity_score": 50},
    )

    response = client.get(
        "/api/v1/planning/priorities?planning_date=2027-01-02"
        "&date_from=2027-01-01&date_to=2027-01-31"
    )
    assert response.status_code == 200
    assert [row["task_id"] for row in response.json()["tasks"]] == ["DNG-NEW"]


def test_priority_snapshot_reused_for_pages_and_invalidated_by_task_store(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "priority-cache.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, village_area TEXT, location_label TEXT,
                phi_range TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
            );
            CREATE TABLE Case_Notifications (notification_date TEXT);
            CREATE TABLE Citizen_Complaints (received_date TEXT);
            INSERT INTO Locations VALUES ('LOC001', 'Area One', 'Point', 'Range');
            INSERT INTO Component2_Location_Risk VALUES ('LOC001', 0.8, 'High', 'test');
            INSERT INTO Case_Notifications VALUES ('2026-07-02');
            INSERT INTO Citizen_Complaints VALUES ('2026-07-02');
            """
        )

    cases = [{
        "task_id": "DNG00001",
        "task_type": "Dengue Case Inspection",
        "notification_date": "2026-07-02",
        "location_id": "LOC001",
        "location_name": "Area One",
        "priority_score": 80.0,
        "priority_level": "High",
    }]
    calls = {"cases": 0, "complaints": 0}

    def score_case_rows(_connection, _date):
        calls["cases"] += 1
        return list(cases)

    def score_complaint_rows(_connection, _date):
        calls["complaints"] += 1
        return []

    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    task_store_path = tmp_path / "submitted_tasks.json"
    monkeypatch.setattr(task_store, "TASK_STORE_PATH", task_store_path)
    monkeypatch.setattr(planning_routes, "score_cases", score_case_rows)
    monkeypatch.setattr(planning_routes, "score_complaints", score_complaint_rows)
    monkeypatch.setattr(
        planning_routes,
        "calculate_location_activity",
        lambda _connection, _location, _date: {"activity_score": 50},
    )
    monkeypatch.setattr(planning_routes, "_PRIORITY_SNAPSHOT_CACHE", {})

    first = client.get(
        "/api/v1/planning/priorities?limit=1&planning_date=2026-07-02"
    )
    second = client.get(
        "/api/v1/planning/priorities?limit=1&offset=1&planning_date=2026-07-02"
    )
    assert first.status_code == second.status_code == 200
    assert calls == {"cases": 1, "complaints": 1}

    task_store_path.write_text("[]", encoding="utf-8")
    third = client.get(
        "/api/v1/planning/priorities?limit=1&planning_date=2026-07-02"
    )
    assert third.status_code == 200
    assert calls == {"cases": 2, "complaints": 2}


def test_priority_filters_are_applied_before_pagination_and_match_aggregates(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "priority-filter.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, village_area TEXT, location_label TEXT,
                phi_range TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
            );
            CREATE TABLE Case_Notifications (notification_date TEXT);
            CREATE TABLE Citizen_Complaints (received_date TEXT);
            INSERT INTO Locations VALUES ('LOC001', 'Area One', 'Point', 'Range');
            INSERT INTO Component2_Location_Risk VALUES ('LOC001', 0.8, 'High', 'test');
            INSERT INTO Case_Notifications VALUES ('2026-07-02');
            INSERT INTO Citizen_Complaints VALUES ('2026-07-02');
            """
        )
    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    monkeypatch.setattr(planning_routes, "_PRIORITY_SNAPSHOT_CACHE", {})
    monkeypatch.setattr(planning_routes, "score_cases", lambda *_: [
        {"task_id": f"DNG-{i}", "task_type": "Dengue Case Inspection",
         "notification_date": "2026-07-02", "location_id": "LOC001",
         "location_name": "Area One", "priority_score": float(80 + i),
         "priority_level": "High", "priority_reason": "test"}
        for i in range(4)
    ])
    monkeypatch.setattr(planning_routes, "score_complaints", lambda *_: [])
    monkeypatch.setattr(
        planning_routes,
        "calculate_location_activity",
        lambda *_: {"activity_score": 50},
    )

    response = client.get(
        "/api/v1/planning/priorities?limit=2&offset=0&task_type=cases"
        "&priority_level=High&location_id=LOC001&search=DNG-"
        "&planning_date=2026-07-02&date_from=2026-07-01&date_to=2026-07-02"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_matching"] == 4
    assert body["summary"]["high"] == 4
    assert body["summary"]["total"] == 4
    assert body["location_summary"][0]["total"] == 4
    assert len(body["tasks"]) == 2
    assert all(task["task_id"].startswith("DNG-") for task in body["tasks"])


def test_priorities_use_selected_as_of_date_and_exclude_future_tasks():
    response = client.get(
        "/api/v1/planning/priorities?limit=25&planning_date=2026-07-01"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["planning_date"] == "2026-07-01"
    assert all(
        task["notification_date"] <= body["planning_date"]
        for task in body["cases"]
    )
    assert all(
        task["received_date"] <= body["planning_date"]
        for task in body["complaints"]
    )


def test_priority_range_returns_all_historical_tasks_inclusive_of_boundaries():
    pages = []
    first_body = None
    for offset in range(0, 7000, 200):
        response = client.get(
            "/api/v1/planning/priorities?limit=200&offset="
            f"{offset}&planning_date=2026-09-30&date_from=2026-04-01&date_to=2026-09-30"
        )
        assert response.status_code == 200
        body = response.json()
        if first_body is None:
            first_body = body
        pages.extend(body["tasks"])
        if not body["has_next"]:
            break

    case_rows = [task for task in pages if task["task_type"] != "Citizen Complaint"]
    complaint_rows = [task for task in pages if task["task_type"] == "Citizen Complaint"]
    assert first_body["date_from"] == "2026-04-01"
    assert first_body["date_to"] == "2026-09-30"
    assert first_body["planning_date"] == "2026-09-30"
    assert first_body["total_cases"] == 6050
    assert first_body["total_complaints"] == 811
    assert len(case_rows) == 6050
    assert len(complaint_rows) == 811
    assert len({task["task_id"] for task in pages}) == 6861
    assert all(task["priority_score"] is not None for task in case_rows)
    assert all(task["priority_score"] is not None for task in complaint_rows)
    assert first_body["quality_summary"]["review"] == 0
    assert first_body["quality_summary"]["provisional_assumption"] == 6050
    assert all("2026-04-01" <= task["notification_date"] <= "2026-09-30" for task in case_rows)
    assert all("2026-04-01" <= task["received_date"] <= "2026-09-30" for task in complaint_rows)


def test_priority_range_rejects_reversed_dates():
    reversed_dates = client.get(
        "/api/v1/planning/priorities?date_from=2026-09-30&date_to=2026-04-01"
    )

    assert reversed_dates.status_code == 422


def test_score_as_of_after_data_does_not_remove_historical_tasks():
    pages = []
    first_body = None
    for offset in range(0, 7000, 200):
        response = client.get(
            "/api/v1/planning/priorities?limit=200&offset="
            f"{offset}&planning_date=2026-10-06&date_from=2026-04-01&date_to=2026-09-30"
        )
        assert response.status_code == 200
        body = response.json()
        if first_body is None:
            first_body = body
        pages.extend(body["tasks"])
        if not body["has_next"]:
            break


    def test_may_second_scenario_returns_scored_cases_and_complaints():
        pages = []
        first_body = None
        for offset in range(0, 1400, 200):
            response = client.get(
                "/api/v1/planning/priorities?limit=200&offset="
                f"{offset}&planning_date=2026-05-02"
                "&date_from=2026-04-01&date_to=2026-05-02"
            )
            assert response.status_code == 200
            body = response.json()
            if first_body is None:
                first_body = body
            pages.extend(body["tasks"])
            if not body["has_next"]:
                break

        cases = [row for row in pages if row["task_type"] != "Citizen Complaint"]
        complaints = [row for row in pages if row["task_type"] == "Citizen Complaint"]
        assert first_body["planning_date"] == "2026-05-02"
        assert first_body["total_cases"] == 1067
        assert first_body["total_complaints"] == 139
        assert len(cases) == 1067
        assert len(complaints) == 139
        assert all(row["priority_score"] is not None for row in cases + complaints)
        assert all(row["priority_level"] in {"High", "Medium", "Low"} for row in cases + complaints)
        assert first_body["quality_summary"]["review"] == 0
        assert first_body["quality_summary"]["provisional_assumption"] == len(cases)

    case_rows = [row for row in pages if row["task_type"] != "Citizen Complaint"]
    complaint_rows = [row for row in pages if row["task_type"] == "Citizen Complaint"]
    assert first_body["planning_date"] == "2026-10-06"
    assert len(case_rows) == 6050
    assert len(complaint_rows) == 811
    assert all("2026-04-01" <= row["notification_date"] <= "2026-09-30" for row in case_rows)
    assert all("2026-04-01" <= row["received_date"] <= "2026-09-30" for row in complaint_rows)
    assert all(row["priority_score"] is None for row in pages)
    assert all(row["priority_level"] == "Review" for row in pages)
    assert all(row["priority_fallback"] is True for row in pages)
    assert all(row["scheduling_priority_level"] in {"High", "Medium", "Low"} for row in pages)
    assert first_body["quality_summary"]["review"] == 6861


def test_locations_returns_component2_risk_and_null_when_missing(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "synthetic.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT,
                moh_area TEXT,
                phi_range TEXT,
                village_area TEXT,
                location_label TEXT,
                data_status TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT,
                risk_score REAL,
                risk_level TEXT,
                score_source TEXT
            );
            INSERT INTO Locations VALUES
                ('LOC001', 'MOH', 'Range A', 'Village A', 'Point A', 'SYNTHETIC'),
                ('LOC002', 'MOH', 'Range B', 'Village B', 'Point B', 'SYNTHETIC');
            INSERT INTO Component2_Location_Risk VALUES
                ('LOC001', 0.6, 'Medium', 'component2'),
                ('LOC002', NULL, NULL, 'component2');
            """
        )

    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    response = client.get("/api/v1/planning/locations")

    assert response.status_code == 200
    locations = {
        location["location_id"]: location
        for location in response.json()["locations"]
    }
    assert locations["LOC001"]["location_name"] == "Village A"
    assert locations["LOC001"]["component2_risk_score"] == pytest.approx(0.6)
    assert locations["LOC001"]["component2_risk_level"] == "Medium"
    assert locations["LOC002"]["component2_risk_score"] is None


def test_case_task_uses_component2_location_risk_and_rejects_submitted_risk(
    tmp_path,
    monkeypatch,
):
    response = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Dengue Case Inspection",
            "location_id": "LOC001",
            "planning_date": "2026-07-01",
            "urgency": "High",
        },
    )

    assert response.status_code == 201, response.text
    task = response.json()["task"]
    locations_response = client.get("/api/v1/planning/locations")
    location = next(
        row for row in locations_response.json()["locations"]
        if row["location_id"] == "LOC001"
    )
    assert task["component2_risk_score"] == location["component2_risk_score"]
    assert task["priority_score"] == sum(
        factor["contribution"]
        for factor in task["priority_factors"].values()
    )
    assert task["priority_factors"]["location_risk"]["score"] == round(
        location["component2_risk_score"] * 100,
        2,
    )
    assert set(task["priority_factors"]) == {
        "location_risk",
        "area_activity",
        "waiting_time",
        "task_urgency",
    }

    rejected = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Dengue Case Inspection",
            "location_id": "LOC001",
            "planning_date": "2026-07-01",
            "urgency": "High",
            "component2_risk_score": 0.99,
        },
    )
    assert rejected.status_code == 422


def test_citizen_complaint_keeps_urgency_scoring():
    response = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Citizen Complaint",
            "location_id": "LOC001",
            "planning_date": "2026-07-01",
            "urgency": "High",
            "complaint_type": "Potential mosquito breeding site",
        },
    )

    assert response.status_code == 201, response.text
    task = response.json()["task"]
    assert task["priority_score"] == sum(
        factor["contribution"]
        for factor in task["priority_factors"].values()
    )
    assert task["priority_factors"]["task_urgency"]["score"] == 90
    assert task["component2_risk_score"] is not None


def test_review_task_creation_returns_provisional_fallback_metadata():
    response = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Citizen Complaint",
            "location_id": "LOC001",
            "planning_date": "2026-07-01",
            "complaint_type": "Standing water",
        },
    )

    assert response.status_code == 201, response.text
    task = response.json()["task"]
    assert task["priority_score"] is None
    assert task["priority_level"] == "Review"
    assert task["priority_fallback"] is True
    assert task["scheduling_priority_level"] in {"High", "Medium", "Low"}
    assert task["priority_fallback_reason"]


def test_submitted_case_is_in_priorities_response():
    created = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Dengue Case Inspection",
            "location_id": "LOC001",
            "planning_date": "2026-07-01",
            "urgency": "High",
        },
    )
    assert created.status_code == 201, created.text
    submitted = created.json()["task"]

    response = client.get(
        "/api/v1/planning/priorities?limit=50&planning_date=2026-07-01"
        "&date_from=2026-07-01&date_to=2026-07-01"
    )

    assert response.status_code == 200
    body = response.json()
    returned = next(
        task for task in body["cases"]
        if task["task_id"] == submitted["scenario_task_id"]
    )
    assert returned["task_type"] == submitted["task_type"]
    assert returned["location_id"] == submitted["location_id"]
    assert returned["priority_score"] == submitted["priority_score"]
    assert returned["priority_level"] == submitted["priority_level"]
    assert returned["priority_score"] is not None
    assert returned["component2_risk_score"] is not None
    assert set(returned["priority_factors"]) == {
        "location_risk",
        "area_activity",
        "waiting_time",
        "task_urgency",
    }
    assert returned["notification_date"] == submitted["planning_date"]


def test_submitted_complaint_is_in_priorities_response():
    created = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Citizen Complaint",
            "location_id": "LOC001",
            "planning_date": "2026-07-01",
            "urgency": "High",
            "complaint_type": "Potential mosquito breeding site",
        },
    )
    assert created.status_code == 201, created.text
    submitted = created.json()["task"]

    response = client.get(
        "/api/v1/planning/priorities?limit=50&planning_date=2026-07-01"
        "&date_from=2026-07-01&date_to=2026-07-01"
    )

    assert response.status_code == 200
    body = response.json()
    returned = next(
        task for task in body["complaints"]
        if task["task_id"] == submitted["scenario_task_id"]
    )
    assert returned["task_type"] == submitted["task_type"]
    assert returned["complaint_type"] == submitted["complaint_type"]
    assert returned["urgency"] == submitted["urgency"]
    assert returned["location_id"] == submitted["location_id"]
    assert returned["priority_score"] == submitted["priority_score"]
    assert returned["priority_level"] == submitted["priority_level"]
    assert returned["received_date"] == submitted["planning_date"]


def test_schedule_includes_only_matching_date_tasks_and_marks_capacity(
    tmp_path,
    monkeypatch,
):
    matching = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Dengue Case Inspection",
            "location_id": "LOC001",
            "planning_date": "2026-07-01",
            "urgency": "High",
        },
    )
    other_date = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Citizen Complaint",
            "location_id": "LOC001",
            "planning_date": "2026-07-15",
            "urgency": "Medium",
            "complaint_type": "Standing water",
        },
    )
    assert matching.status_code == 201
    assert other_date.status_code == 201

    monkeypatch.setattr(planning_routes, "load_tasks", lambda _plan_date: [])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _: [{
        "phi_id": "TEST-PHI",
        "moh_area": "Kaduwela",
        "phi_range": "Malabe Range",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }])
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path)

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )

    assert response.status_code == 200, response.text
    tasks = response.json()["tasks"]
    matching_id = matching.json()["task"]["scenario_task_id"]
    other_id = other_date.json()["task"]["scenario_task_id"]
    returned_by_id = {task["scenario_task_id"]: task for task in tasks}
    assert matching_id in returned_by_id
    assert returned_by_id[matching_id]["status"] == "Scheduled"
    assert returned_by_id[matching_id]["planning_date"] == "2026-07-01"
    assert response.json()["new_tasks"] == 1
    assert response.json()["carried_forward_tasks"] == 0
    assert other_id not in returned_by_id


def test_july_30_schedule_excludes_historical_source_dates_as_new_work(
    tmp_path,
    monkeypatch,
):
    source_rows = [
        {"scenario_task_id": "CASE-TODAY", "source_id": "CASE-TODAY", "task_type": "Dengue Case Inspection", "task_date": "2026-07-30", "priority_score": 90, "priority_level": "High", "scheduling_priority_level": "High", "task_status": "Pending", "moh_area": "Kaduwela"},
        {"scenario_task_id": "CASE-JULY-1", "source_id": "CASE-JULY-1", "task_type": "Dengue Case Inspection", "task_date": "2026-07-01", "priority_score": 80, "priority_level": "High", "scheduling_priority_level": "High", "task_status": "Pending", "moh_area": "Kaduwela"},
        {"scenario_task_id": "CASE-JULY-2", "source_id": "CASE-JULY-2", "task_type": "Dengue Case Inspection", "task_date": "2026-07-02", "priority_score": 80, "priority_level": "High", "scheduling_priority_level": "High", "task_status": "Pending", "moh_area": "Kaduwela"},
        {"scenario_task_id": "CASE-JUNE-3", "source_id": "CASE-JUNE-3", "task_type": "Dengue Case Inspection", "task_date": "2026-06-03", "priority_score": 80, "priority_level": "High", "scheduling_priority_level": "High", "task_status": "Pending", "moh_area": "Kaduwela"},
        {"scenario_task_id": "CASE-APRIL-30", "source_id": "CASE-APRIL-30", "task_type": "Dengue Case Inspection", "task_date": "2026-04-30", "priority_score": 80, "priority_level": "High", "scheduling_priority_level": "High", "task_status": "Pending", "moh_area": "Kaduwela"},
    ]
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path / "schedules")
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [source_rows[0]])
    monkeypatch.setattr(planning_routes, "load_submitted_tasks", lambda: source_rows[1:])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _date: [{
        "phi_id": "PHI01",
        "moh_area": "Kaduwela",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }])

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-30"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["new_tasks"] == 1
    assert body["carried_forward_tasks"] == 4
    assert body["total_tasks"] == 5
    tasks_by_id = {row["scenario_task_id"]: row for row in body["tasks"]}
    assert tasks_by_id["CASE-TODAY"]["status"] == "Scheduled"
    assert {
        tasks_by_id[task_id]["task_date"]
        for task_id in ("CASE-JULY-1", "CASE-JULY-2", "CASE-JUNE-3", "CASE-APRIL-30")
    } == {"2026-07-01", "2026-07-02", "2026-06-03", "2026-04-30"}
    assert body["scheduled_tasks"] + body["unscheduled_tasks"] == body["total_tasks"]


def test_same_day_cases_and_complaints_both_return_as_scheduled_appointments(
    tmp_path,
    monkeypatch,
):
    planning_date = "2026-04-22"
    tasks = [
        {
            "scenario_task_id": "CASE-APR-22",
            "source_id": "CASE-APR-22",
            "task_type": "Dengue Case Inspection",
            "task_date": planning_date,
            "priority_score": 90,
            "priority_level": "High",
            "scheduling_priority_level": "High",
            "task_status": "Pending",
            "moh_area": "Kaduwela",
            "phi_range": "Range A",
            "village_area": "Village A",
        },
        {
            "scenario_task_id": "COMPLAINT-APR-22",
            "source_id": "COMPLAINT-APR-22",
            "task_type": "Citizen Complaint",
            "task_date": planning_date,
            "priority_score": 70,
            "priority_level": "High",
            "scheduling_priority_level": "High",
            "task_status": "Pending",
            "moh_area": "Kaduwela",
            "phi_range": "Range A",
            "village_area": "Village A",
        },
    ]
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path / "schedules")
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: tasks)
    monkeypatch.setattr(planning_routes, "load_submitted_tasks", lambda: [])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _date: [{
        "phi_id": "PHI01",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "primary_village_area": "Village A",
        "remaining_capacity": 2,
        "working_start": "08:00",
        "working_end": "09:30",
        "existing_workload": 0,
    }])

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": planning_date},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["new_tasks"] == 2
    assert body["scheduled_tasks"] == 2
    assert {row["task_type"] for row in body["tasks"]} == {
        "Dengue Case Inspection",
        "Citizen Complaint",
    }
    assert all(
        row["status"] == "Scheduled"
        and row["assigned_phi"] == "PHI01"
        and row["task_date"] == planning_date
        for row in body["tasks"]
    )


def test_schedule_endpoint():
    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )

    assert response.status_code == 200
    body = response.json()

    assert body["data_mode"] == "synthetic_research_data"
    assert body["planning_date"] == "2026-07-01"
    assert body["solver_status"] in {"OPTIMAL", "FEASIBLE"}
    assert body["scheduled_tasks"] + body["unscheduled_tasks"] == (
        body["total_tasks"]
    )
    assert len(body["tasks"]) == body["total_tasks"]


def test_april_review_tasks_are_scheduled_or_visible_without_api_error(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path)
    database_path = tmp_path / "review-schedule.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, moh_area TEXT, phi_range TEXT,
                village_area TEXT, location_label TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT,
                score_source TEXT
            );
            CREATE TABLE Citizen_Complaints (
                complaint_id TEXT, status TEXT
            );
            INSERT INTO Locations VALUES
                ('LOC001', 'Kaduwela', 'Range A', 'Village A', 'Point A');
            INSERT INTO Component2_Location_Risk VALUES
                ('LOC001', NULL, NULL, 'missing');
            """
        )
    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    monkeypatch.setattr(planning_routes, "load_submitted_tasks", lambda: [])
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [{
        "scenario_task_id": "CASE-REVIEW-APRIL",
        "source_id": "CASE-REVIEW-APRIL",
        "task_type": "Dengue Case Inspection",
        "task_date": "2026-04-16",
        "notification_date": "2026-04-16",
        "location_id": "LOC001",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "priority_score": None,
        "priority_level": "Review",
        "component2_risk_score": None,
        "component2_risk_level": None,
        "urgency": None,
    }])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _date: [{
        "phi_id": "PHI-A",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }])

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-04-16"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["planning_date"] == "2026-04-16"
    assert body["total_tasks"] > 0
    assert body["review_tasks"] > 0
    assert all(task["priority_score"] is None for task in body["tasks"] if task["priority_fallback"])
    assert all(task["task_status"] == "Pending" for task in body["tasks"])


def test_pending_task_carries_forward_and_repeated_generation_is_idempotent(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [])
    available_phi = {
        "phi_id": "TEST-PHI",
        "moh_area": "Kaduwela",
        "phi_range": "Malabe Range",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }
    monkeypatch.setattr(
        planning_routes,
        "load_phis",
        lambda planning_date: [] if planning_date == "2026-07-01" else [available_phi],
    )
    created = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Dengue Case Inspection",
            "location_id": "LOC001",
            "planning_date": "2026-07-01",
            "urgency": "High",
        },
    )
    assert created.status_code == 201, created.text
    task_id = created.json()["task"]["scenario_task_id"]

    first = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert first.status_code == 200, first.text
    first_task = next(row for row in first.json()["tasks"] if row["scenario_task_id"] == task_id)
    assert first_task["status"] == "Unscheduled"
    assert first_task["task_status"] == "Pending"
    assert first_task["waiting_days"] == 0

    second = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-02"},
    )
    third = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-02"},
    )
    assert second.status_code == third.status_code == 200
    for body in (second.json(), third.json()):
        task_rows = [row for row in body["tasks"] if row["scenario_task_id"] == task_id]
        assert len(task_rows) == 1
        assert task_rows[0]["status"] == "Scheduled"
        assert task_rows[0]["task_date"] == "2026-07-01"
        assert task_rows[0]["waiting_days"] == 1
        assert task_rows[0]["current_planning_date"] == "2026-07-02"
        assert task_rows[0]["carried_forward"] is True
        assert body["new_tasks"] == 0
        assert body["carried_forward_tasks"] == 1
        assert body["total_tasks"] == (
            body["scheduled_tasks"]
            + body["unscheduled_tasks"]
            + body["completed_tasks"]
            + body["cancelled_tasks"]
        )
        assert body["carried_forward_tasks"] == 1
        assert body["scheduled_tasks"] + body["unscheduled_tasks"] == body["total_tasks"]

    stored = [row for row in task_store.load_submitted_tasks() if row["scenario_task_id"] == task_id]
    assert len(stored) == 1
    assert len(stored[0]["schedule_history"]) == 2


def test_same_day_inspection_history_does_not_complete_same_day_case(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "same-day-history.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, moh_area TEXT, phi_range TEXT,
                village_area TEXT, location_label TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
            );
            CREATE TABLE Citizen_Complaints (complaint_id TEXT, status TEXT);
            CREATE TABLE Inspection_History (task_id TEXT, inspection_date TEXT);
            INSERT INTO Locations VALUES
                ('LOC001', 'Kaduwela', 'Range A', 'Village', 'Point');
            INSERT INTO Component2_Location_Risk VALUES
                ('LOC001', 0.8, 'High', 'fixture');
            INSERT INTO Inspection_History VALUES
                ('CASE-SAME-DAY', '2026-07-30');
            """
        )
    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path / "schedules")
    monkeypatch.setattr(planning_routes, "load_submitted_tasks", lambda: [])
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [{
        "scenario_task_id": "CASE-SAME-DAY",
        "source_id": "CASE-SAME-DAY",
        "task_type": "Dengue Case Inspection",
        "task_date": "2026-07-30",
        "priority_score": 80,
        "priority_level": "High",
        "scheduling_priority_level": "High",
        "task_status": "Pending",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "location_id": "LOC001",
    }])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _date: [{
        "phi_id": "PHI01",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }])

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-30"},
    )

    assert response.status_code == 200, response.text
    task = response.json()["tasks"][0]
    assert task["task_status"] == "Pending"
    assert task["status"] == "Scheduled"
    assert task["task_date"] == "2026-07-30"


def test_completed_execution_status_is_persisted_and_not_reassigned(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _date: [{
        "phi_id": "PHI01",
        "moh_area": "Kaduwela",
        "phi_range": "Malabe Range",
        "remaining_capacity": 1,
        "working_start": "08:00",
        "working_end": "08:45",
        "existing_workload": 0,
    }])
    created = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Citizen Complaint",
            "location_id": "LOC001",
            "planning_date": "2026-07-01",
            "urgency": "High",
            "complaint_type": "Standing water",
        },
    )
    assert created.status_code == 201
    task_id = created.json()["task"]["scenario_task_id"]
    generated = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert generated.status_code == 200
    assert any(row["scenario_task_id"] == task_id for row in generated.json()["tasks"])

    updated = client.patch(
        f"/api/v1/planning/tasks/{task_id}/status",
        json={"task_status": "Completed"},
    )
    assert updated.status_code == 200
    assert updated.json()["task"]["task_status"] == "Completed"

    same_day = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert same_day.status_code == 200
    completed_row = next(
        row for row in same_day.json()["tasks"]
        if row["scenario_task_id"] == task_id
    )
    assert completed_row["task_status"] == "Completed"
    assert completed_row["status"] == "Completed"
    assert same_day.json()["completed_tasks"] == 1
    assert same_day.json()["total_tasks"] == (
        same_day.json()["scheduled_tasks"]
        + same_day.json()["unscheduled_tasks"]
        + same_day.json()["completed_tasks"]
        + same_day.json()["cancelled_tasks"]
    )

    next_day = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-02"},
    )
    assert next_day.status_code == 200
    assert all(row["scenario_task_id"] != task_id for row in next_day.json()["tasks"])


def test_explicit_in_progress_status_wins_over_inspection_history(tmp_path, monkeypatch):
    database_path = tmp_path / "in-progress-history.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, moh_area TEXT, phi_range TEXT,
                village_area TEXT, location_label TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
            );
            CREATE TABLE Citizen_Complaints (complaint_id TEXT, status TEXT);
            CREATE TABLE Inspection_History (task_id TEXT, inspection_date TEXT);
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
            INSERT INTO Locations VALUES
                ('LOC001', 'Kaduwela', 'Range A', 'Village', 'Point');
            INSERT INTO Component2_Location_Risk VALUES
                ('LOC001', 0.8, 'High', 'fixture');
            INSERT INTO Inspection_History VALUES
                ('CASE-IN-PROGRESS', '2026-07-01');
            INSERT INTO PHI_Master VALUES
                ('PHI01', 'Kaduwela', 'Range A', 'Village', '08:00', '16:00', 6);
            INSERT INTO PHI_Daily VALUES
                ('2026-07-01', 'PHI01', 'Range A', 'Available', '08:00', '09:30', 2, 0);
            """
        )
    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path / "schedules")
    task_store.save_task_records([{
        "scenario_task_id": "CASE-IN-PROGRESS",
        "source_id": "CASE-IN-PROGRESS",
        "task_type": "Dengue Case Inspection",
        "task_date": "2026-06-30",
        "planning_date": "2026-07-01",
        "current_planning_date": "2026-07-01",
        "priority_score": 80,
        "priority_level": "High",
        "scheduling_priority_level": "High",
        "task_status": "In Progress",
        "status": "Scheduled",
        "assigned_phi": "PHI01",
        "start_time": "08:00",
        "end_time": "08:45",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
    }])
    from component_3_phi_planning.optimization import phi_scheduler
    monkeypatch.setattr(phi_scheduler, "DB_PATH", database_path)
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _date: [{
        "phi_id": "PHI01",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "remaining_capacity": 2,
        "working_start": "08:00",
        "working_end": "09:30",
        "existing_workload": 0,
    }])

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )

    assert response.status_code == 200, response.text
    task = next(
        row for row in response.json()["tasks"]
        if row["scenario_task_id"] == "CASE-IN-PROGRESS"
    )
    assert task["task_status"] == "In Progress"
    assert task["assigned_phi"] == "PHI01"
    assert task["start_time"] == "08:00"


def test_empty_day_returns_informative_empty_schedule(tmp_path, monkeypatch):
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _date: [])

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-10-01"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total_tasks"] == 0
    assert body["tasks"] == []
    assert body["solver_status"] == "NO_PENDING_TASKS"


def test_no_phi_availability_keeps_old_pending_task_visible_without_deadline_fields(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path)
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [{
        "scenario_task_id": "TASK-OLD-PENDING",
        "source_id": "TASK-OLD-PENDING",
        "task_type": "Dengue Case Inspection",
        "task_date": "2026-04-01",
        "priority_score": 60,
        "priority_level": "Medium",
        "scheduling_priority_level": "Medium",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "task_status": "Pending",
    }])
    monkeypatch.setattr(planning_routes, "load_submitted_tasks", lambda: [])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _date: [])

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-04-04"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_tasks"] == 1
    assert body["tasks"][0]["status"] == "Unscheduled"
    assert body["tasks"][0]["task_status"] == "Pending"
    assert body["tasks"][0]["task_date"] == "2026-04-01"
    assert not {"deadline_date", "deadline_at_risk", "overdue"} & body["tasks"][0].keys()
    assert "availability" in body["tasks"][0]["reason"].lower()

    restored = client.get(
        "/api/v1/planning/schedule?planning_date=2026-04-04"
    )
    assert restored.status_code == 200
    restored_task = restored.json()["tasks"][0]
    assert restored_task["task_date"] == "2026-04-01"
    assert not {"deadline_date", "deadline_at_risk", "overdue"} & restored_task.keys()


def test_phi_availability_override_persists_by_date_and_can_be_restored(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "phi-availability.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, moh_area TEXT, phi_range TEXT,
                village_area TEXT, location_label TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
            );
            CREATE TABLE Citizen_Complaints (complaint_id TEXT, status TEXT);
            CREATE TABLE Inspection_History (task_id TEXT, inspection_date TEXT);
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
            INSERT INTO Locations VALUES
                ('LOC001', 'Kaduwela', 'Range A', 'Village', 'Point');
            INSERT INTO Component2_Location_Risk VALUES
                ('LOC001', 0.8, 'High', 'fixture');
            INSERT INTO PHI_Master VALUES
                ('PHI01', 'Kaduwela', 'Range A', 'Village', '08:00', '16:00', 6),
                ('PHI02', 'Kaduwela', 'Range B', 'Village', '08:00', '16:00', 6),
                ('PHI03', 'Kaduwela', 'Range B', 'Village', '08:00', '16:00', 6);
            INSERT INTO PHI_Daily VALUES
                ('2026-07-01', 'PHI01', 'Range A', 'Available', '08:00', '09:30', 2, 0),
                ('2026-07-01', 'PHI02', 'Range B', 'Available', '08:00', '09:30', 2, 0),
                ('2026-07-01', 'PHI03', 'Range B', 'Unavailable', '08:00', '09:30', 2, 0),
                ('2026-07-02', 'PHI01', 'Range A', 'Available', '08:00', '09:30', 2, 0),
                ('2026-07-02', 'PHI02', 'Range B', 'Available', '08:00', '09:30', 2, 0),
                ('2026-07-02', 'PHI03', 'Range B', 'Available', '08:00', '09:30', 2, 0);
            """
        )
    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path / "schedules")
    monkeypatch.setattr(planning_routes, "load_submitted_tasks", lambda: [])
    monkeypatch.setattr(
        planning_routes,
        "load_tasks",
        lambda planning_date: [{
            "scenario_task_id": "TASK-AVAILABILITY",
            "source_id": "TASK-AVAILABILITY",
            "task_type": "Dengue Case Inspection",
            "task_date": planning_date,
            "priority_score": 80,
            "priority_level": "High",
            "scheduling_priority_level": "High",
            "task_status": "Pending",
            "moh_area": "Kaduwela",
            "phi_range": "Range A",
            "location_id": "LOC001",
        }],
    )
    from component_3_phi_planning.optimization import phi_scheduler
    from component_3_phi_planning.rescheduling import phi_rescheduler
    monkeypatch.setattr(phi_scheduler, "DB_PATH", database_path)
    monkeypatch.setattr(phi_rescheduler, "DB_PATH", database_path)

    base = client.get(
        "/api/v1/planning/phis/availability?planning_date=2026-07-01"
    )
    assert base.status_code == 200
    assert next(row for row in base.json()["phis"] if row["phi_id"] == "PHI01")["availability"] == "Available"
    assert next(row for row in base.json()["phis"] if row["phi_id"] == "PHI03")["availability"] == "Available"

    marked = client.put(
        "/api/v1/planning/phis/PHI01/availability",
        json={"planning_date": "2026-07-01", "availability": "Unavailable"},
    )
    assert marked.status_code == 200
    reloaded = client.get(
        "/api/v1/planning/phis/availability?planning_date=2026-07-01"
    )
    assert next(row for row in reloaded.json()["phis"] if row["phi_id"] == "PHI01")["availability"] == "Unavailable"

    same_day = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert same_day.status_code == 200, same_day.text
    assert same_day.json()["tasks"][0]["assigned_phi"] != "PHI01"

    next_day = client.get(
        "/api/v1/planning/phis/availability?planning_date=2026-07-02"
    )
    assert next_day.status_code == 200
    assert next(row for row in next_day.json()["phis"] if row["phi_id"] == "PHI01")["availability"] == "Available"

    client.put(
        "/api/v1/planning/phis/PHI02/availability",
        json={"planning_date": "2026-07-01", "availability": "Unavailable"},
    )
    restored = client.put(
        "/api/v1/planning/phis/PHI02/availability",
        json={"planning_date": "2026-07-01", "availability": "Available"},
    )
    assert restored.status_code == 200
    restored = client.put(
        "/api/v1/planning/phis/PHI01/availability",
        json={"planning_date": "2026-07-01", "availability": "Available"},
    )
    assert restored.status_code == 200
    confirmed = client.get(
        "/api/v1/planning/phis/availability?planning_date=2026-07-01"
    )
    assert next(row for row in confirmed.json()["phis"] if row["phi_id"] == "PHI01")["availability"] == "Available"

    after_restore = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert after_restore.status_code == 200, after_restore.text
    assert after_restore.json()["tasks"][0]["assigned_phi"] == "PHI01"


def test_missing_daily_rows_default_all_master_phis_available_for_schedule(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "master-default-availability.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, moh_area TEXT, phi_range TEXT,
                village_area TEXT, location_label TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
            );
            CREATE TABLE Citizen_Complaints (complaint_id TEXT, status TEXT);
            CREATE TABLE Inspection_History (task_id TEXT, inspection_date TEXT);
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
            INSERT INTO Locations VALUES
                ('LOC001', 'Kaduwela', 'Range 1', 'Village 1', 'Point 1');
            INSERT INTO Component2_Location_Risk VALUES
                ('LOC001', 0.8, 'High', 'fixture');
            """
        )
        connection.executemany(
            "INSERT INTO PHI_Master VALUES (?, 'Kaduwela', ?, ?, '08:00', '16:00', 6)",
            [
                (f"PHI{index:02d}", f"Range {index}", f"Village {index}")
                for index in range(1, 13)
            ],
        )

    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path / "schedules")
    monkeypatch.setattr(availability_store, "PHI_AVAILABILITY_PATH", tmp_path / "availability.json")
    monkeypatch.setattr(planning_routes, "load_submitted_tasks", lambda: [])
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [{
        "scenario_task_id": "TASK-NO-DAILY-PHI-ROWS",
        "source_id": "TASK-NO-DAILY-PHI-ROWS",
        "task_type": "Dengue Case Inspection",
        "task_date": "2026-10-12",
        "priority_score": 80,
        "priority_level": "High",
        "scheduling_priority_level": "High",
        "task_status": "Pending",
        "moh_area": "Kaduwela",
        "phi_range": "Range 1",
        "location_id": "LOC001",
    }])
    from component_3_phi_planning.optimization import phi_scheduler
    monkeypatch.setattr(phi_scheduler, "DB_PATH", database_path)

    availability = client.get(
        "/api/v1/planning/phis/availability?planning_date=2026-10-12"
    )
    assert availability.status_code == 200, availability.text
    assert len(availability.json()["phis"]) == 12
    assert all(row["availability"] == "Available" for row in availability.json()["phis"])

    unknown_phi = client.put(
        "/api/v1/planning/phis/PHI99/availability",
        json={"planning_date": "2026-10-12", "availability": "Unavailable"},
    )
    assert unknown_phi.status_code == 404

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-10-12"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["solver_status"] != "NO_PHI_AVAILABILITY"
    assert body["scheduled_tasks"] == 1
    assert body["tasks"][0]["assigned_phi"] == "PHI01"


def test_multiple_reschedules_preserve_original_and_assignment_event_chain(
    tmp_path,
    monkeypatch,
):
    database_path = tmp_path / "reschedule-history.sqlite"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE Locations (
                location_id TEXT, moh_area TEXT, phi_range TEXT,
                village_area TEXT, location_label TEXT
            );
            CREATE TABLE Component2_Location_Risk (
                location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
            );
            CREATE TABLE Citizen_Complaints (complaint_id TEXT, status TEXT);
            CREATE TABLE Inspection_History (task_id TEXT, inspection_date TEXT);
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
            INSERT INTO Locations VALUES
                ('LOC001', 'Kaduwela', 'Range A', 'Village', 'Point');
            INSERT INTO Component2_Location_Risk VALUES
                ('LOC001', 0.8, 'High', 'fixture');
            INSERT INTO PHI_Master VALUES
                ('PHI01', 'Kaduwela', 'Range A', 'Village', '08:00', '16:00', 6),
                ('PHI02', 'Kaduwela', 'Range B', 'Village', '08:00', '16:00', 6),
                ('PHI03', 'Kaduwela', 'Range B', 'Village', '08:00', '16:00', 6);
            INSERT INTO PHI_Daily VALUES
                ('2026-07-01', 'PHI01', 'Range A', 'Available', '08:00', '09:30', 2, 0),
                ('2026-07-01', 'PHI02', 'Range B', 'Available', '08:00', '09:30', 2, 0),
                ('2026-07-01', 'PHI03', 'Range B', 'Unavailable', '08:00', '09:30', 2, 0);
            """
        )
    monkeypatch.setattr(planning_routes, "DATABASE_PATH", database_path)
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path / "schedules")
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [{
        "scenario_task_id": "TASK-HISTORY",
        "source_id": "TASK-HISTORY",
        "task_type": "Dengue Case Inspection",
        "task_date": "2026-04-01",
        "deadline_date": "2026-04-03",
        "priority_score": 80,
        "priority_level": "High",
        "scheduling_priority_level": "High",
        "task_status": "Pending",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "location_id": "LOC001",
    }])
    from component_3_phi_planning.optimization import phi_scheduler
    from component_3_phi_planning.rescheduling import phi_rescheduler
    monkeypatch.setattr(phi_scheduler, "DB_PATH", database_path)
    monkeypatch.setattr(phi_rescheduler, "DB_PATH", database_path)

    initial = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert initial.status_code == 200, initial.text
    assert initial.json()["tasks"][0]["assigned_phi"] == "PHI01"
    assert not {"deadline_date", "deadline_at_risk", "overdue"} & initial.json()["tasks"][0].keys()

    first = client.post(
        "/api/v1/planning/reschedule",
        json={"planning_date": "2026-07-01", "unavailable_phi": "PHI01"},
    )
    assert first.status_code == 200, first.text
    assert first.json()["tasks"][0]["assigned_phi"] == "PHI02"
    assert not {"deadline_date", "deadline_at_risk", "overdue"} & first.json()["tasks"][0].keys()
    persisted = client.get(
        "/api/v1/planning/phis/availability?planning_date=2026-07-01"
    )
    assert persisted.status_code == 200
    assert next(
        row for row in persisted.json()["phis"] if row["phi_id"] == "PHI01"
    )["availability"] == "Unavailable"

    client.put(
        "/api/v1/planning/phis/PHI01/availability",
        json={"planning_date": "2026-07-01", "availability": "Available"},
    )
    client.put(
        "/api/v1/planning/phis/PHI02/availability",
        json={"planning_date": "2026-07-01", "availability": "Unavailable"},
    )
    second = client.post(
        "/api/v1/planning/reschedule",
        json={"planning_date": "2026-07-01", "unavailable_phi": "PHI02"},
    )
    assert second.status_code == 200, second.text
    assert second.json()["tasks"][0]["assigned_phi"] == "PHI01"

    stored = task_store.load_submitted_tasks()
    assert sum(row.get("scenario_task_id") == "TASK-HISTORY" for row in stored) == 1
    record = next(row for row in stored if row.get("scenario_task_id") == "TASK-HISTORY")
    assert record["task_date"] == "2026-04-01"
    assert len(record["rescheduling_history"]) == 2
    assert [event["previous_assigned_phi"] for event in record["rescheduling_history"]] == [
        "PHI01", "PHI02"
    ]
    assert [event["assigned_phi"] for event in record["rescheduling_history"]] == [
        "PHI02", "PHI01"
    ]
    assert record["rescheduling_history"][0]["previous_start_time"] == "08:00"
    assert record["rescheduling_history"][0]["previous_end_time"] == "08:45"
    assert record["schedule_history"][0]["assigned_phi"] == "PHI01"

    schedule_path = tmp_path / "schedules" / "phi_plan_2026-07-01.csv"
    assert schedule_path.is_file()
    assert (tmp_path / "schedules" / "phi_plan_2026-07-01_history_1.csv").is_file()


def test_schedule_confirmation_requires_rescheduling_and_is_idempotent(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path / "schedules")
    monkeypatch.setattr(planning_routes, "load_submitted_tasks", lambda: [])
    monkeypatch.setattr(planning_routes, "load_tasks", lambda _date: [{
        "scenario_task_id": "TASK-CONFIRM",
        "source_id": "TASK-CONFIRM",
        "task_type": "Dengue Case Inspection",
        "task_date": "2026-07-01",
        "deadline_date": "2026-07-03",
        "priority_score": 80,
        "priority_level": "High",
        "scheduling_priority_level": "High",
        "task_status": "Pending",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "location_id": "LOC001",
    }])
    phi_rows = [
        {
            "phi_id": "PHI01", "moh_area": "Kaduwela", "phi_range": "Range A",
            "remaining_capacity": 1, "working_start": "08:00",
            "working_end": "08:45", "existing_workload": 0,
        },
        {
            "phi_id": "PHI02", "moh_area": "Kaduwela", "phi_range": "Range B",
            "remaining_capacity": 1, "working_start": "08:00",
            "working_end": "08:45", "existing_workload": 0,
        },
    ]
    monkeypatch.setattr(planning_routes, "load_phis", lambda _date: phi_rows)
    from component_3_phi_planning.rescheduling import phi_rescheduler
    monkeypatch.setattr(phi_rescheduler, "read_phi_daily", lambda _date: {
        row["phi_id"]: {
            **row,
            "availability": row.get("availability", "Available"),
            "daily_capacity": row["remaining_capacity"],
            "existing_workload": 0,
        }
        for row in phi_rows
    })

    generated = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert generated.status_code == 200, generated.text
    body = generated.json()
    assert body["schedule_state"]["status"] == "draft"
    assert body["schedule_state"]["confirmed"] is False
    assert body["schedule_state"]["released_to_phis"] is False
    task = body["tasks"][0]
    assigned_phi = task["assigned_phi"]
    from component_3_phi_planning.api import schedule_release_store
    monkeypatch.setattr(
        schedule_release_store,
        "publish_confirmed_schedule",
        lambda _date, _tasks, _confirmed_at: {assigned_phi: 1},
    )

    unavailable = client.put(
        f"/api/v1/planning/phis/{assigned_phi}/availability",
        json={"planning_date": "2026-07-01", "availability": "Unavailable"},
    )
    assert unavailable.status_code == 200
    blocked = client.post(
        "/api/v1/planning/schedule/confirm",
        json={"planning_date": "2026-07-01"},
    )
    assert blocked.status_code == 409

    from component_3_phi_planning.api import availability_store
    effective_phi_daily = {
        row["phi_id"]: {
            **row,
            "availability": "Available",
            "daily_capacity": row["remaining_capacity"],
            "existing_workload": 0,
        }
        for row in phi_rows
    }
    effective_phi_daily[assigned_phi]["availability"] = "Unavailable"
    monkeypatch.setattr(
        phi_rescheduler,
        "read_phi_daily",
        lambda _date: availability_store.apply_availability_override(
            {key: dict(value) for key, value in effective_phi_daily.items()},
            "2026-07-01",
        ),
    )
    revised = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-07-01",
            "unavailable_phi": assigned_phi,
            "assume_all_pending": False,
        },
    )
    assert revised.status_code == 200, revised.text
    assert revised.json()["schedule_state"]["status"] == "revised_pending_confirmation"
    assert revised.json()["schedule_state"]["confirmed"] is False

    confirmed = client.post(
        "/api/v1/planning/schedule/confirm",
        json={"planning_date": "2026-07-01"},
    )
    repeated = client.post(
        "/api/v1/planning/schedule/confirm",
        json={"planning_date": "2026-07-01"},
    )
    assert confirmed.status_code == repeated.status_code == 200
    assert confirmed.json()["schedule_state"]["confirmed"] is True
    assert confirmed.json()["schedule_state"]["released_to_phis"] is True
    assert confirmed.json()["delivered_to_phis"] is False
    assert confirmed.json()["released_task_count"] == 1
    assert repeated.json()["schedule_state"]["confirmed_at"] == confirmed.json()["schedule_state"]["confirmed_at"]


def test_schedule_rejects_malformed_date():
    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "not-a-date"},
    )

    assert response.status_code == 422


def test_reschedule_endpoint():
    # Generate a schedule first, as rescheduling reads its CSV output.
    schedule_response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert schedule_response.status_code == 200

    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-07-01",
            "unavailable_phi": "PHI02",
            "assume_all_pending": False,
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["data_mode"] == "synthetic_research_data"
    assert body["unavailable_phi"] == "PHI02"
    assert body["assume_all_pending"] is False
    assert body["scheduled_tasks"] + body["unscheduled_tasks"] + (
        body["pending_rescheduling_tasks"]
    ) <= body["total_tasks"]

    assert all(
        task.get("assigned_phi") != "PHI02"
        for task in body["tasks"]
        if task.get("status") == "Scheduled"
    )


def test_reschedule_rejects_missing_execution_statuses(tmp_path, monkeypatch):
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path)
    schedule_response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert schedule_response.status_code == 200

    schedule_path = tmp_path / "phi_plan_2026-07-01.csv"
    with schedule_path.open("r", newline="", encoding="utf-8") as file:
        plan = list(csv.DictReader(file))
    for task in plan:
        task.pop("task_status", None)
    with schedule_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(plan[0]))
        writer.writeheader()
        writer.writerows(plan)

    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-07-01",
            "unavailable_phi": "PHI02",
            "assume_all_pending": False,
        },
    )

    assert response.status_code == 422
    assert "execution status is missing" in (
        response.json()["detail"].lower()
    )


def test_reschedule_rejects_unknown_phi():
    schedule_response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert schedule_response.status_code == 200

    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-07-01",
            "unavailable_phi": "PHI99",
            "assume_all_pending": True,
        },
    )

    assert response.status_code == 422
    assert "unknown phi" in response.json()["detail"].lower()



def test_reschedule_uses_api_generated_schedule(
    tmp_path,
    monkeypatch,
):
    """Rescheduling uses a schedule generated by the API."""

    monkeypatch.setattr(
        planning_routes,
        "API_OUTPUT_DIR",
        tmp_path,
    )

    planning_date = "2026-07-01"
    schedule_path = tmp_path / f"phi_plan_{planning_date}.csv"

    assert not schedule_path.exists()

    schedule_response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": planning_date},
    )

    assert schedule_response.status_code == 200
    assert schedule_response.json()["schedule_saved"] is True
    assert schedule_path.is_file()

    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": planning_date,
            "unavailable_phi": "PHI02",
            "assume_all_pending": True,
        },
    )

    assert response.status_code == 200

    body = response.json()
    assert body["total_tasks"] > 0
    assert body["unavailable_phi"] == "PHI02"

    assert all(
        task.get("assigned_phi") != "PHI02"
        for task in body["tasks"]
        if task.get("status") == "Scheduled"
    )


def test_reschedule_response_contains_transparency_fields():
    """Verify that reschedule response returns transparency metrics and previous assignment details."""
    schedule_response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-07-01"},
    )
    assert schedule_response.status_code == 200

    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-07-01",
            "unavailable_phi": "PHI02",
            "assume_all_pending": True,
        },
    )
    assert response.status_code == 200
    body = response.json()

    # Required transparency summary fields
    assert "affected_tasks" in body
    assert "reassigned_tasks" in body
    assert "deferred_tasks" in body
    assert "remaining_unscheduled_tasks" in body
    assert "unchanged_tasks" in body
    assert "original_tasks" in body
    assert isinstance(body["original_tasks"], list)
    assert len(body["original_tasks"]) == body["total_tasks"]

    # Sum of classifications equals total tasks
    assert (
        body["reassigned_tasks"]
        + body["deferred_tasks"]
        + body["remaining_unscheduled_tasks"]
        + body["unchanged_tasks"]
    ) == body["total_tasks"]

    # Verify per-task fields
    for task in body["tasks"]:
        assert "previous_assigned_phi" in task
        assert "previous_start_time" in task
        assert "previous_end_time" in task
        assert "reassignment_classification" in task
        assert task["reassignment_classification"] in {
            "Reassigned",
            "Unchanged",
            "Deferred",
            "Unscheduled",
        }

    expected_phi02_tasks = [
        task for task in schedule_response.json()["tasks"]
        if task.get("status") == "Scheduled"
        and task.get("assigned_phi") == "PHI02"
    ]
    assert body["affected_tasks"] == len(expected_phi02_tasks)

    phi02_tasks = [
        t for t in body["tasks"]
        if t.get("previous_assigned_phi") == "PHI02"
    ]
    assert len(phi02_tasks) == len(expected_phi02_tasks)

    phi02_reassigned = [t for t in phi02_tasks if t["reassignment_classification"] == "Reassigned"]
    assert all(task["status"] == "Scheduled" for task in phi02_reassigned)

    phi02_unscheduled = [t for t in phi02_tasks if t["reassignment_classification"] == "Unscheduled"]
    assert len(phi02_reassigned) + len(phi02_unscheduled) == len(phi02_tasks)
    for t in phi02_unscheduled:
        assert t["status"] == "Unscheduled"
        assert "capacity" in t.get("reason", "").lower()

    # Verify tasks originally assigned to other PHIs remained unchanged
    other_unchanged = [
        t for t in body["tasks"]
        if t.get("previous_assigned_phi") not in {"", "PHI02"}
        and t.get("status") == "Scheduled"
    ]
    for t in other_unchanged:
        assert t["reassignment_classification"] == "Unchanged"
        assert t["assigned_phi"] == t["previous_assigned_phi"]

    # Verify PHI03 classifications against the same generated schedule.
    response_phi03 = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-07-01",
            "unavailable_phi": "PHI03",
            "assume_all_pending": True,
        },
    )
    assert response_phi03.status_code == 200
    body_phi03 = response_phi03.json()
    expected_phi03_count = sum(
        task.get("status") == "Scheduled"
        and task.get("assigned_phi") == "PHI03"
        for task in schedule_response.json()["tasks"]
    )
    assert body_phi03["affected_tasks"] == expected_phi03_count

    reassigned_tasks = [
        t for t in body_phi03["tasks"]
        if t.get("reassignment_classification") == "Reassigned"
    ]
    assert all(
        task["previous_assigned_phi"] == "PHI03"
        and task["assigned_phi"] != "PHI03"
        and task["status"] == "Scheduled"
        for task in reassigned_tasks
    )
    phi03_unscheduled = [
        task for task in body_phi03["tasks"]
        if task.get("previous_assigned_phi") == "PHI03"
        and task["reassignment_classification"] == "Unscheduled"
    ]
    assert len(reassigned_tasks) + len(phi03_unscheduled) == expected_phi03_count


def test_reschedule_classification_covers_protected_and_deferred(tmp_path, monkeypatch):
    """Verify classification logic explicitly preserves protected tasks and flags deferred tasks."""
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path)
    planning_date = "2026-04-01"
    plan_path = tmp_path / f"phi_plan_{planning_date}.csv"

    # Synthetic schedule with various task execution statuses
    test_plan = [
        {
            "scenario_task_id": "TASK-COMPLETED",
            "source_id": "TASK-COMPLETED",
            "task_type": "Dengue Case Inspection",
            "priority_score": "95.0",
            "priority_level": "High",
            "location_id": "LOC001",
            "phi_range": "Malabe Range",
            "village_area": "Malabe East",
            "planning_date": planning_date,
            "assigned_phi": "PHI02",
            "start_time": "08:00",
            "end_time": "08:45",
            "status": "Scheduled",
            "task_status": "Completed",
            "reason": "Original schedule",
        },
        {
            "scenario_task_id": "TASK-IN-PROGRESS",
            "source_id": "TASK-IN-PROGRESS",
            "task_type": "Dengue Case Inspection",
            "priority_score": "90.0",
            "priority_level": "High",
            "location_id": "LOC001",
            "phi_range": "Malabe Range",
            "village_area": "Malabe East",
            "planning_date": planning_date,
            "assigned_phi": "PHI02",
            "start_time": "08:45",
            "end_time": "09:30",
            "status": "Scheduled",
            "task_status": "In Progress",
            "reason": "Original schedule",
        },
        {
            "scenario_task_id": "TASK-PENDING",
            "source_id": "TASK-PENDING",
            "task_type": "Dengue Case Inspection",
            "priority_score": "85.0",
            "priority_level": "High",
            "location_id": "LOC001",
            "phi_range": "Malabe Range",
            "village_area": "Malabe East",
            "planning_date": planning_date,
            "assigned_phi": "PHI02",
            "start_time": "09:30",
            "end_time": "10:15",
            "status": "Scheduled",
            "task_status": "Pending",
            "reason": "Original schedule",
        },
    ]

    import csv
    with plan_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(test_plan[0].keys()))
        writer.writeheader()
        writer.writerows(test_plan)

    # Call reschedule without assume_all_pending to test real execution status protection
    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": planning_date,
            "unavailable_phi": "PHI02",
            "assume_all_pending": False,
        },
    )
    assert response.status_code == 200
    body = response.json()

    by_id = {t["scenario_task_id"]: t for t in body["tasks"]}

    # Completed task must stay with PHI02 and be classified as Unchanged (protected)
    completed = by_id["TASK-COMPLETED"]
    assert completed["assigned_phi"] == "PHI02"
    assert completed["status"] == "Scheduled"
    assert completed["reassignment_classification"] == "Unchanged"
    assert completed["task_status"] == "Completed"

    # In Progress task must stay with PHI02 and be classified as Unchanged (protected)
    in_prog = by_id["TASK-IN-PROGRESS"]
    assert in_prog["assigned_phi"] == "PHI02"
    assert in_prog["status"] == "Scheduled"
    assert in_prog["reassignment_classification"] == "Unchanged"
    assert in_prog["task_status"] == "In Progress"

    # Pending task is eligible for reassignment
    pending = by_id["TASK-PENDING"]
    assert pending["previous_assigned_phi"] == "PHI02"
    assert pending["reassignment_classification"] in {"Reassigned", "Unscheduled"}
    if pending["status"] == "Scheduled":
        assert pending["assigned_phi"] != "PHI02"
        assert pending["reassignment_classification"] == "Reassigned"
    else:
        assert pending["status"] == "Unscheduled"
        assert pending["reassignment_classification"] == "Unscheduled"



