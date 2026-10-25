"""Security and release tests for PHI mobile schedule endpoints."""

from fastapi.testclient import TestClient

from component_3_phi_planning.api import mongo_store, schedule_release_store
from component_3_phi_planning.api import inspection_store
from component_3_phi_planning.api.main import app
from component_3_phi_planning.api.phi_auth import (
    get_signing_secret,
    hash_password,
    issue_token,
)


client = TestClient(app)


def test_local_development_defaults_to_local_mongodb(monkeypatch):
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.setenv("APP_ENV", "development")

    assert mongo_store.get_mongo_uri() == "mongodb://localhost:27017"


def test_production_requires_explicit_mongodb_uri(monkeypatch):
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.setenv("APP_ENV", "production")

    try:
        mongo_store.get_mongo_uri()
    except RuntimeError as error:
        assert "MONGODB_URI" in str(error)
    else:
        raise AssertionError("Production must not silently use local MongoDB.")


def test_development_jwt_secret_is_persisted_without_environment_setting(monkeypatch, tmp_path):
    monkeypatch.delenv("PHI_JWT_SECRET", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    secret_path = tmp_path / "api-output" / ".phi_jwt_secret"
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.JWT_SECRET_PATH", secret_path)

    first_secret = get_signing_secret()
    second_secret = get_signing_secret()

    assert first_secret == second_secret
    assert len(first_secret) >= 48


class FakeCollection:
    def __init__(self, documents=()):
        self.documents = list(documents)
        self.saved = None
        self.rows = {}

    def create_index(self, *_args, **_kwargs):
        return None

    def find_one(self, query, projection=None):
        if "phi_id" in query:
            for document in self.documents:
                if document.get("phi_id") == query["phi_id"] and (
                    "active" not in query or document.get("active") is query["active"]
                ):
                    return document
            return None
        if "inspection_id" in query:
            return self.rows.get(query["inspection_id"])
        return None

    def replace_one(self, query, document, upsert=False):
        self.saved = document

    def update_one(self, query, update, upsert=False):
        key = query["inspection_id"]
        inserted = key not in self.rows and upsert
        if inserted:
            self.rows[key] = update["$setOnInsert"]
        return type("Result", (), {"upserted_id": key if inserted else None})()

    def find(self, *_args, **_kwargs):
        return FakeCursor(self.rows.values())

    def find_one_by_inspection_id(self, inspection_id):
        return self.rows.get(inspection_id)


class FakeCursor(list):
    def sort(self, key, direction=1):
        return FakeCursor(sorted(self, key=lambda row: row.get(key, ""), reverse=direction < 0))


class FakeDatabase:
    def __init__(self, account):
        self.phi_accounts = FakeCollection([account])
        self.prevention_notification_test_events = FakeCollection()
        self.inspection_reports = FakeCollection()


def test_phi_schedule_endpoints_require_login():
    response = client.get("/api/v1/phi/schedules/dates")

    assert response.status_code == 401


def test_phi_can_only_request_schedule_dates_for_authenticated_identity(monkeypatch):
    monkeypatch.setenv("PHI_JWT_SECRET", "test-secret-that-is-not-used-outside-tests")
    account = {
        "phi_id": "PHI01",
        "display_name": "Officer One",
        "active": True,
        **hash_password("test-password-long-enough"),
    }
    monkeypatch.setattr(
        "component_3_phi_planning.api.phi_auth.get_database",
        lambda: FakeDatabase(account),
    )
    monkeypatch.setattr(
        "component_3_phi_planning.api.routes.phi_mobile.plan_store.load_schedule_state",
        lambda _date: {"confirmed": True, "released_to_phis": True},
    )
    monkeypatch.setattr(
        "component_3_phi_planning.api.routes.phi_mobile.get_released_dates",
        lambda phi_id: [{"planning_date": "2026-07-01"}] if phi_id == "PHI01" else [],
    )
    token = issue_token("PHI01")

    response = client.get(
        "/api/v1/phi/schedules/dates",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"phi_id": "PHI01", "dates": ["2026-07-01"]}


def test_phi_mobile_login_issues_token_for_provisioned_account(monkeypatch):
    monkeypatch.setenv("PHI_JWT_SECRET", "test-secret-that-is-not-used-outside-tests")
    account = {
        "phi_id": "PHI01",
        "display_name": "Officer One",
        "moh_area": "Kaduwela",
        "phi_range": "Range A",
        "active": True,
        **hash_password("test-password-long-enough"),
    }
    monkeypatch.setattr(
        "component_3_phi_planning.api.routes.phi_mobile.get_database",
        lambda: FakeDatabase(account),
    )

    response = client.post(
        "/api/v1/phi/login",
        json={"phi_id": "PHI01", "password": "test-password-long-enough"},
    )

    assert response.status_code == 200
    assert response.json()["phi"]["phi_id"] == "PHI01"
    assert response.json()["token_type"] == "bearer"


def test_local_notification_receiver_authenticates_and_deduplicates(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("PREVENTION_NOTIFICATION_TEST_MODE", "true")
    monkeypatch.setenv("PHI_JWT_SECRET", "test-secret-that-is-not-used-outside-tests")
    account = {"phi_id": "PHI01", "active": True}
    database = FakeDatabase(account)
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.get_database", lambda: database)
    monkeypatch.setattr("component_3_phi_planning.api.routes.prevention_notification_test.get_database", lambda: database)
    token = issue_token("PHI01")
    payload = {
        "inspection_id": "REPORT-TEST-1",
        "task_id": "SIM-CASE-TEST-1",
        "location": "Area 4",
        "inspection_date": "2026-10-23",
        "phi_reference": "PHI01",
        "issue_description": "Tire: standing water; larvae/pupae observed",
        "notification_timestamp": "2026-10-23T07:00:00Z",
    }
    headers = {"Authorization": f"Bearer {token}", "Idempotency-Key": "REPORT-TEST-1"}

    first = client.post("/api/v1/dev/prevention-notifications", headers=headers, json=payload)
    second = client.post("/api/v1/dev/prevention-notifications", headers=headers, json=payload)

    assert first.status_code == second.status_code == 200
    assert first.json()["deduplicated"] is False
    assert second.json()["deduplicated"] is True
    assert len(database.prevention_notification_test_events.rows) == 1
    loopback_client = TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000))
    listed = loopback_client.get("/api/v1/dev/prevention-notifications").json()
    assert listed["total"] == 1
    assert "inspection_id" not in listed["notifications"][0]


def test_local_notification_receiver_rejects_phi_or_idempotency_mismatch(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("PREVENTION_NOTIFICATION_TEST_MODE", "true")
    monkeypatch.setenv("PHI_JWT_SECRET", "test-secret-that-is-not-used-outside-tests")
    account = {"phi_id": "PHI01", "active": True}
    database = FakeDatabase(account)
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.get_database", lambda: database)
    monkeypatch.setattr("component_3_phi_planning.api.routes.prevention_notification_test.get_database", lambda: database)
    token = issue_token("PHI01")
    payload = {
        "inspection_id": "REPORT-TEST-2", "task_id": "TASK-2", "location": "Area 4",
        "inspection_date": "2026-10-23", "phi_reference": "PHI02",
        "issue_description": "Test issue", "notification_timestamp": "2026-10-23T07:00:00Z",
    }

    response = client.post(
        "/api/v1/dev/prevention-notifications",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "ANOTHER-REPORT"},
        json=payload,
    )

    assert response.status_code == 403
    assert not database.prevention_notification_test_events.rows


def test_local_notification_receiver_disabled_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("PREVENTION_NOTIFICATION_TEST_MODE", "true")

    response = client.get("/api/v1/dev/prevention-notifications")

    assert response.status_code == 404


def test_development_notification_receiver_persists_minimal_payload_and_deduplicates(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("PREVENTION_NOTIFICATION_TEST_MODE", "true")
    monkeypatch.setenv("PHI_JWT_SECRET", "test-secret-that-is-not-used-outside-tests")
    account = {"phi_id": "PHI01", "active": True}
    database = FakeDatabase(account)
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.get_database", lambda: database)
    monkeypatch.setattr("component_3_phi_planning.api.routes.prevention_notification_test.get_database", lambda: database)
    token = issue_token("PHI01")
    payload = {
        "inspection_id": "REPORT-TEST-1",
        "task_id": "SIM-CASE-TEST-1",
        "location": "Area 4",
        "inspection_date": "2026-10-23",
        "phi_reference": "PHI01",
        "issue_description": "Tire: standing water; larvae/pupae observed",
        "notification_timestamp": "2026-10-23T07:00:00Z",
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Idempotency-Key": "REPORT-TEST-1",
    }

    first = client.post("/api/v1/dev/prevention-notifications", headers=headers, json=payload)
    second = client.post("/api/v1/dev/prevention-notifications", headers=headers, json=payload)

    assert first.status_code == second.status_code == 200
    assert first.json()["deduplicated"] is False
    assert second.json()["deduplicated"] is True
    assert len(database.prevention_notification_test_events.rows) == 1
    assert "patient" not in first.json()["notification"]


def test_development_notification_receiver_rejects_wrong_phi_reference(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("PREVENTION_NOTIFICATION_TEST_MODE", "true")
    monkeypatch.setenv("PHI_JWT_SECRET", "test-secret-that-is-not-used-outside-tests")
    account = {"phi_id": "PHI01", "active": True}
    database = FakeDatabase(account)
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.get_database", lambda: database)
    monkeypatch.setattr("component_3_phi_planning.api.routes.prevention_notification_test.get_database", lambda: database)
    token = issue_token("PHI01")
    payload = {
        "inspection_id": "REPORT-TEST-2", "task_id": "TASK-2", "location": "Area 4",
        "inspection_date": "2026-10-23", "phi_reference": "PHI02",
        "issue_description": "Test issue", "notification_timestamp": "2026-10-23T07:00:00Z",
    }

    response = client.post(
        "/api/v1/dev/prevention-notifications",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "REPORT-TEST-2"},
        json=payload,
    )

    assert response.status_code == 403
    assert not database.prevention_notification_test_events.rows


def test_phi_cannot_read_schedule_until_it_is_confirmed_and_released(monkeypatch):
    monkeypatch.setenv("PHI_JWT_SECRET", "test-secret-that-is-not-used-outside-tests")
    account = {"phi_id": "PHI01", "active": True}
    monkeypatch.setattr(
        "component_3_phi_planning.api.phi_auth.get_database",
        lambda: FakeDatabase(account),
    )
    monkeypatch.setattr(
        "component_3_phi_planning.api.routes.phi_mobile.plan_store.load_schedule_state",
        lambda _date: {"confirmed": False, "released_to_phis": False},
    )
    token = issue_token("PHI01")

    response = client.get(
        "/api/v1/phi/schedules/2026-07-01",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


def test_phi_cannot_read_another_phis_schedule(monkeypatch):
    monkeypatch.setenv("PHI_JWT_SECRET", "test-secret-that-is-not-used-outside-tests")
    account = {"phi_id": "PHI01", "active": True}
    monkeypatch.setattr(
        "component_3_phi_planning.api.phi_auth.get_database",
        lambda: FakeDatabase(account),
    )
    monkeypatch.setattr(
        "component_3_phi_planning.api.routes.phi_mobile.plan_store.load_schedule_state",
        lambda _date: {"confirmed": True, "released_to_phis": True},
    )
    monkeypatch.setattr(
        "component_3_phi_planning.api.routes.phi_mobile.get_released_schedule",
        lambda _date, phi_id: None if phi_id == "PHI01" else {
            "planning_date": "2026-07-01",
            "confirmed_at": "2026-06-30T10:00:00+05:30",
            "tasks": [{"assigned_phi": "PHI02"}],
        },
    )
    token = issue_token("PHI01")

    response = client.get(
        "/api/v1/phi/schedules/2026-07-01",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


def test_schedule_publication_contains_only_assigned_scheduled_tasks(monkeypatch):
    database = type("Database", (), {"phi_released_schedules": FakeCollection()})()
    monkeypatch.setattr(schedule_release_store, "get_database", lambda: database)

    counts = schedule_release_store.publish_confirmed_schedule(
        "2026-07-01",
        [
            {"status": "Scheduled", "assigned_phi": "PHI01", "start_time": "08:00", "source_id": "A"},
            {"status": "Unscheduled", "assigned_phi": "", "source_id": "B"},
            {"status": "Pending rescheduling", "assigned_phi": "PHI02", "source_id": "C"},
        ],
        "2026-06-30T10:00:00+05:30",
    )

    assert counts == {"PHI01": 1}
    assert database.phi_released_schedules.saved["phi_schedules"] == {
        "PHI01": [{"status": "Scheduled", "assigned_phi": "PHI01", "start_time": "08:00", "source_id": "A"}]
    }


def test_released_task_lookup_finds_simulation_id_for_own_phi_on_fallback(monkeypatch):
    schedule = {
        "planning_date": "2026-07-01",
        "phi_schedules": {
            "PHI01": [{
                "scenario_task_id": "SIM-CASE-DNG03043",
                "source_id": "DNG03043",
                "assigned_phi": "PHI01",
                "task_status": "Pending",
            }]
        },
    }

    class ReleasedSchedules:
        def find_one(self, *_args, **_kwargs):
            return None

        def find(self, query, projection=None):
            assert "phi_schedules.PHI01" in query
            return [schedule]

    database = type("Database", (), {"phi_released_schedules": ReleasedSchedules()})()
    monkeypatch.setattr(inspection_store, "get_database", lambda: database)
    monkeypatch.setattr(
        "component_3_phi_planning.api.plan_store.load_schedule_state",
        lambda _day: {"confirmed": True, "released_to_phis": True},
    )

    task = inspection_store.find_released_task("PHI01", "SIM-CASE-DNG03043")

    assert task is not None
    assert task["scenario_task_id"] == "SIM-CASE-DNG03043"
    assert task["planning_date"] == "2026-07-01"


def test_phi_can_start_assigned_simulation_task(monkeypatch):
    monkeypatch.setenv("PHI_JWT_SECRET", "test-secret-that-is-not-used-outside-tests")
    account = {"phi_id": "PHI01", "active": True}
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.get_database", lambda: FakeDatabase(account))
    monkeypatch.setattr(
        "component_3_phi_planning.api.routes.phi_mobile.find_released_task",
        lambda phi_id, task_id: {
            "scenario_task_id": task_id,
            "source_id": "DNG03043",
            "planning_date": "2026-07-01",
            "task_status": "Pending",
        } if phi_id == "PHI01" and task_id == "SIM-CASE-DNG03043" else None,
    )
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.mark_released_task_started", lambda *_args: None)
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile._synchronize_task_status", lambda *_args: None)
    token = issue_token("PHI01")

    response = client.post(
        "/api/v1/phi/tasks/SIM-CASE-DNG03043/inspection/start",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"task_id": "SIM-CASE-DNG03043", "task_status": "In Progress"}