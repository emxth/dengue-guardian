
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
    assert len(body["cases"]) == 5
    assert len(body["complaints"]) == 5


def test_priorities_includes_location_information():
    response = client.get("/api/v1/planning/priorities?limit=5")

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


def test_locations_returns_average_risk_and_null_when_missing(
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
            CREATE TABLE Case_Notifications (
                location_id TEXT,
                risk_indicator REAL
            );
            INSERT INTO Locations VALUES
                ('LOC001', 'MOH', 'Range A', 'Village A', 'Point A', 'SYNTHETIC'),
                ('LOC002', 'MOH', 'Range B', 'Village B', 'Point B', 'SYNTHETIC');
            INSERT INTO Case_Notifications VALUES
                ('LOC001', 0.4),
                ('LOC001', 0.8),
                ('LOC001', 1.2),
                ('LOC002', NULL);
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
    assert locations["LOC001"]["risk_indicator"] == pytest.approx(0.6)
    assert locations["LOC002"]["risk_indicator"] is None


def test_case_task_uses_location_risk_and_rejects_submitted_risk(
    tmp_path,
    monkeypatch,
):
    response = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Dengue Case Inspection",
            "location_id": "LOC001",
            "planning_date": "2026-04-01",
        },
    )

    assert response.status_code == 201, response.text
    task = response.json()["task"]
    locations_response = client.get("/api/v1/planning/locations")
    location = next(
        row for row in locations_response.json()["locations"]
        if row["location_id"] == "LOC001"
    )
    assert task["risk_indicator"] == location["risk_indicator"]
    assert task["priority_score"] == round(location["risk_indicator"] * 100, 2)

    rejected = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Dengue Case Inspection",
            "location_id": "LOC001",
            "planning_date": "2026-04-01",
            "risk_indicator": 0.99,
        },
    )
    assert rejected.status_code == 422


def test_citizen_complaint_keeps_urgency_scoring():
    response = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Citizen Complaint",
            "location_id": "LOC001",
            "planning_date": "2026-04-01",
            "urgency": "High",
            "complaint_type": "Potential mosquito breeding site",
        },
    )

    assert response.status_code == 201, response.text
    task = response.json()["task"]
    assert task["priority_score"] == 90
    assert task["risk_indicator"] is None


def test_submitted_case_is_in_priorities_response():
    created = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Dengue Case Inspection",
            "location_id": "LOC001",
            "planning_date": "2026-04-01",
        },
    )
    assert created.status_code == 201, created.text
    submitted = created.json()["task"]

    response = client.get("/api/v1/planning/priorities?limit=1")

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
    assert returned["notification_date"] == submitted["planning_date"]


def test_submitted_complaint_is_in_priorities_response():
    created = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Citizen Complaint",
            "location_id": "LOC001",
            "planning_date": "2026-04-01",
            "urgency": "High",
            "complaint_type": "Potential mosquito breeding site",
        },
    )
    assert created.status_code == 201, created.text
    submitted = created.json()["task"]

    response = client.get("/api/v1/planning/priorities?limit=1")

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
            "planning_date": "2026-04-01",
        },
    )
    other_date = client.post(
        "/api/v1/planning/tasks",
        json={
            "task_type": "Citizen Complaint",
            "location_id": "LOC001",
            "planning_date": "2026-04-15",
            "urgency": "Medium",
            "complaint_type": "Standing water",
        },
    )
    assert matching.status_code == 201
    assert other_date.status_code == 201

    monkeypatch.setattr(planning_routes, "load_tasks", lambda: [])
    monkeypatch.setattr(planning_routes, "load_phis", lambda _: [])
    monkeypatch.setattr(planning_routes, "API_OUTPUT_DIR", tmp_path)

    response = client.post(
        "/api/v1/planning/schedule",
        json={"planning_date": "2026-04-01"},
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
        json={"planning_date": "2026-04-01"},
    )

    assert response.status_code == 200
    body = response.json()

    assert body["data_mode"] == "synthetic_research_data"
    assert body["planning_date"] == "2026-04-01"
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
        json={"planning_date": "2026-04-01"},
    )
    assert schedule_response.status_code == 200

    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-04-01",
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
        json={"planning_date": "2026-04-01"},
    )
    assert schedule_response.status_code == 200

    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-04-01",
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
        json={"planning_date": "2026-04-01"},
    )
    assert schedule_response.status_code == 200

    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-04-01",
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

    planning_date = "2026-04-01"
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
        json={"planning_date": "2026-04-01"},
    )
    assert schedule_response.status_code == 200

    response = client.post(
        "/api/v1/planning/reschedule",
        json={
            "planning_date": "2026-04-01",
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
            "planning_date": "2026-04-01",
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



