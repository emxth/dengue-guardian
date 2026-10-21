
"""Automated tests for the C3 PHI Planning API."""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from component_3_phi_planning.api import task_store
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


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["data_mode"] == "synthetic_research_data"


def test_priorities_endpoint():
    response = client.get("/api/v1/planning/priorities?limit=5")

    assert response.status_code == 200
    body = response.json()

    assert body["data_mode"] == "synthetic_research_data"
    assert body["scoring_policy"] == "provisional"
    assert body["total_cases"] == 6050
    assert body["total_complaints"] == 811
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
    monkeypatch.setattr(planning_routes, "load_phis", lambda _: [])
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
    assert returned_by_id[matching_id]["status"] == "Unscheduled"
    assert other_id not in returned_by_id


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
            "assume_all_pending": True,
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["data_mode"] == "synthetic_research_data"
    assert body["unavailable_phi"] == "PHI02"
    assert body["assume_all_pending"] is True
    assert body["scheduled_tasks"] + body["unscheduled_tasks"] + (
        body["pending_rescheduling_tasks"]
    ) <= body["total_tasks"]

    assert all(
        task.get("assigned_phi") != "PHI02"
        for task in body["tasks"]
        if task.get("status") == "Scheduled"
    )


def test_reschedule_rejects_missing_execution_statuses():
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



