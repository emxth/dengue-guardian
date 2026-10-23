"""Inspection report validation, authorization, and retry API tests."""

from datetime import date

from fastapi.testclient import TestClient

from component_3_phi_planning.api.main import app
from component_3_phi_planning.api.phi_auth import hash_password, issue_token
from component_3_phi_planning.api.inspection_models import InspectionReportInput
from component_3_phi_planning.api import inspection_store


client = TestClient(app)


class FakeCollection:
    def __init__(self, account):
        self.account = account

    def find_one(self, query, projection=None):
        if query.get("phi_id") == self.account.get("phi_id") and query.get("active") == self.account.get("active"):
            return self.account
        return None


class FakeDatabase:
    def __init__(self, account):
        self.phi_accounts = FakeCollection(account)


def test_mobile_report_schema_rejects_unknown_fields_and_invalid_values():
    base = {
        "client_submission_id": "f76f25f7-d38c-45b1-a213-e7846ff9bb8b",
        "inspection_date": "2026-10-23",
        "case_investigation": {"investigation_status": "Confirmed"},
    }
    report = InspectionReportInput.model_validate(base)
    assert report.case_investigation.investigation_status == "Confirmed"

    try:
        InspectionReportInput.model_validate({**base, "unexpected_patient_field": "secret"})
    except ValueError:
        pass
    else:
        raise AssertionError("Unknown report fields must be rejected.")

    try:
        InspectionReportInput.model_validate({**base, "contacts": [{"age_years": 999}]})
    except ValueError:
        pass
    else:
        raise AssertionError("Unreasonable contact ages must be rejected.")


def test_phi_report_lookup_is_limited_to_own_released_task(monkeypatch):
    monkeypatch.setenv("PHI_JWT_SECRET", "test-inspection-secret-0123456789-abcdef")
    account = {"phi_id": "PHI01", "active": True, **hash_password("test-password-long-enough")}
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.get_database", lambda: FakeDatabase(account))
    monkeypatch.setattr(
        "component_3_phi_planning.api.routes.phi_mobile.find_released_task",
        lambda phi_id, _task_id: {"scenario_task_id": "T-1", "planning_date": "2026-10-23"} if phi_id == "PHI01" else None,
    )
    monkeypatch.setattr(
        "component_3_phi_planning.api.routes.phi_mobile.get_task_reports",
        lambda phi_id, _task_id: {"draft": {"phi_id": phi_id}, "submitted_reports": []},
    )
    token = issue_token("PHI01")

    response = client.get("/api/v1/phi/tasks/T-1/inspection", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["draft"]["phi_id"] == "PHI01"

    other_token = issue_token("PHI02")
    forbidden = client.get("/api/v1/phi/tasks/T-1/inspection", headers={"Authorization": f"Bearer {other_token}"})
    assert forbidden.status_code == 401


def test_draft_api_requires_an_owned_released_task(monkeypatch):
    monkeypatch.setenv("PHI_JWT_SECRET", "test-inspection-secret-0123456789-abcdef")
    account = {"phi_id": "PHI01", "active": True, **hash_password("test-password-long-enough")}
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.get_database", lambda: FakeDatabase(account))
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.find_released_task", lambda *_args: None)
    token = issue_token("PHI01")
    payload = {
        "client_submission_id": "f76f25f7-d38c-45b1-a213-e7846ff9bb8b",
        "inspection_date": date.today().isoformat(),
        "case_investigation": {"investigation_status": "Pending verification"},
    }

    response = client.put(
        "/api/v1/phi/tasks/OTHER-TASK/inspection/draft",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )

    assert response.status_code == 404


def test_inspection_draft_submit_and_retry_are_idempotent(monkeypatch):
    monkeypatch.setenv("PHI_JWT_SECRET", "test-inspection-secret-0123456789-abcdef")
    account = {"phi_id": "PHI01", "active": True, **hash_password("test-password-long-enough")}
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.get_database", lambda: FakeDatabase(account))
    task = {
        "scenario_task_id": "T-1",
        "source_id": "CASE-1",
        "task_type": "Dengue Case Inspection",
        "planning_date": "2026-10-23",
        "phi_range": "Range A",
        "location_id": "LOC001",
    }
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.find_released_task", lambda *_args: task)

    class Reports:
        records = {}
        drafts = {}

        @classmethod
        def save_draft(cls, phi_id, owned_task, form):
            cls.drafts[f"{phi_id}:{owned_task['task_id']}"] = {"form": form}
            return {"report_id": "draft-1", "updated_at": "2026-10-23T10:00:00+00:00"}

        @classmethod
        def submit_report(cls, phi_id, owned_task, form, timestamp):
            key = f"{phi_id}:{form['client_submission_id']}"
            if key in cls.records:
                return cls.records[key], True
            record = {
                "report_id": "report-1",
                "phi_id": phi_id,
                "task": owned_task,
                "form": form,
                "inspection_date": form["inspection_date"],
                "submitted_at": timestamp,
            }
            cls.records[key] = record
            return record, False

    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.save_draft", Reports.save_draft)
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.submit_report", Reports.submit_report)
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.get_report_by_submission", lambda *_args: None)
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.get_task_reports", lambda *_args: {"draft": None, "submitted_reports": []})
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.mark_released_task_complete", lambda *_args: None)
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile._synchronize_task_status", lambda *_args: None)
    token = issue_token("PHI01")
    headers = {"Authorization": f"Bearer {token}"}
    form = {
        "client_submission_id": "f76f25f7-d38c-45b1-a213-e7846ff9bb8b",
        "inspection_date": "2026-10-23",
        "case_investigation": {"investigation_status": "Pending verification"},
        "environmental_assessment_complete": True,
        "breeding_sites": [],
        "contacts": [],
    }

    draft = client.put("/api/v1/phi/tasks/T-1/inspection/draft", headers=headers, json=form)
    assert draft.status_code == 200
    submitted = client.post("/api/v1/phi/tasks/T-1/inspection/submit", headers=headers, json=form)
    retried = client.post("/api/v1/phi/tasks/T-1/inspection/submit", headers=headers, json=form)

    assert submitted.status_code == retried.status_code == 200
    assert submitted.json()["report_id"] == retried.json()["report_id"] == "report-1"
    assert retried.json()["idempotent_retry"] is True
    assert len(Reports.records) == 1


def test_completed_task_rejects_new_report_when_followup_not_requested(monkeypatch):
    monkeypatch.setenv("PHI_JWT_SECRET", "test-inspection-secret-0123456789-abcdef")
    account = {"phi_id": "PHI01", "active": True, **hash_password("test-password-long-enough")}
    monkeypatch.setattr("component_3_phi_planning.api.phi_auth.get_database", lambda: FakeDatabase(account))
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.find_released_task", lambda *_args: {"task_status": "Completed", "scenario_task_id": "T-1", "planning_date": date.today().isoformat()})
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.get_report_by_submission", lambda *_args: None)
    monkeypatch.setattr("component_3_phi_planning.api.routes.phi_mobile.get_task_reports", lambda *_args: {"submitted_reports": [{"form": {"follow_up_required": False}}]})
    token = issue_token("PHI01")
    payload = {
        "client_submission_id": "f76f25f7-d38c-45b1-a213-e7846ff9bb8b",
        "inspection_date": date.today().isoformat(),
        "case_investigation": {"investigation_status": "Pending verification"},
        "environmental_assessment_complete": True,
    }

    response = client.post("/api/v1/phi/tasks/T-1/inspection/submit", headers={"Authorization": f"Bearer {token}"}, json=payload)

    assert response.status_code == 409


def test_follow_up_submission_keeps_prior_report_and_same_id_retry_is_idempotent(monkeypatch):
    class ReportCollection:
        def __init__(self):
            self.rows = []

        def create_index(self, *_args, **_kwargs):
            return None

        def find_one(self, query, projection=None):
            return next((row for row in self.rows if all(row.get(key) == value for key, value in query.items())), None)

        def insert_one(self, row):
            self.rows.append(row)

        def delete_one(self, query):
            self.rows = [row for row in self.rows if not all(row.get(key) == value for key, value in query.items())]

    reports = ReportCollection()
    fake_database = type("Database", (), {"inspection_reports": reports})()
    monkeypatch.setattr(inspection_store, "get_database", lambda: fake_database)

    task = {"task_id": "T-1", "planning_date": "2026-10-23"}
    first_form = {"client_submission_id": "submission-1", "inspection_date": "2026-10-23"}
    second_form = {"client_submission_id": "submission-2", "inspection_date": "2026-10-30"}
    first, duplicate = inspection_store.submit_report("PHI01", task, first_form, "2026-10-23T10:00:00Z")
    retry, was_retry = inspection_store.submit_report("PHI01", task, first_form, "2026-10-23T10:01:00Z")
    follow_up, follow_up_retry = inspection_store.submit_report("PHI01", task, second_form, "2026-10-30T10:00:00Z")

    assert duplicate is False
    assert was_retry is True
    assert follow_up_retry is False
    assert retry["report_id"] == first["report_id"]
    assert follow_up["report_id"] != first["report_id"]
    assert [row["form"]["client_submission_id"] for row in reports.rows] == ["submission-1", "submission-2"]

