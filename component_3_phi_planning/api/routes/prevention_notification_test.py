"""Local-only receiver used to verify PHI-to-Prevention notification delivery."""

import ipaddress
import os
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from component_3_phi_planning.api.mongo_store import get_database
from component_3_phi_planning.api.phi_auth import get_current_phi


router = APIRouter(prefix="/api/v1/dev/prevention-notifications", tags=["Development notification test"])


class TestNotificationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    inspection_id: str = Field(min_length=1, max_length=100)
    task_id: str = Field(min_length=1, max_length=100)
    location: str = Field(min_length=1, max_length=200)
    inspection_date: date
    phi_reference: str = Field(min_length=1, max_length=50)
    issue_description: str = Field(min_length=1, max_length=600)
    notification_timestamp: str = Field(min_length=1, max_length=50)


def _require_local_test_mode():
    environment = os.getenv("APP_ENV", "development").casefold()
    enabled = os.getenv("PREVENTION_NOTIFICATION_TEST_MODE", "true").casefold() in {"1", "true", "yes"}
    if environment not in {"development", "dev", "test"} or not enabled:
        raise HTTPException(status_code=404, detail="Development notification receiver is disabled.")


@router.post("")
def receive_test_notification(
    payload: TestNotificationInput,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=100),
    phi=Depends(get_current_phi),
):
    _require_local_test_mode()
    if payload.phi_reference != phi["phi_id"]:
        raise HTTPException(status_code=403, detail="Notification PHI reference does not match the authenticated account.")
    if payload.inspection_id != idempotency_key:
        raise HTTPException(status_code=422, detail="Idempotency-Key must match inspection_id.")

    try:
        collection = get_database().prevention_notification_test_events
        collection.create_index("inspection_id", unique=True)
        result = collection.update_one(
            {"inspection_id": payload.inspection_id},
            {"$setOnInsert": {
                **payload.model_dump(mode="json"),
                "received_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }},
            upsert=True,
        )
        saved = collection.find_one({"inspection_id": payload.inspection_id}, {"_id": 0})
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Test notification could not be persisted.") from exc

    return {
        "accepted": True,
        "deduplicated": result.upserted_id is None,
        "notification": saved,
    }


@router.get("")
def list_test_notifications(request: Request):
    _require_local_test_mode()
    host = request.client.host if request.client else ""
    try:
        is_loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        is_loopback = False
    if not is_loopback:
        raise HTTPException(status_code=403, detail="Test notifications can only be viewed locally.")
    try:
        rows = list(get_database().prevention_notification_test_events.find({}, {"_id": 0}).sort("received_at", -1))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Test notifications are unavailable.") from exc
    return {"notifications": rows, "total": len(rows), "mode": "development-test-only"}