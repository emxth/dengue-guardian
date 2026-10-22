"""Persistent per-date schedule review and confirmation state."""

import json
from datetime import datetime
from hashlib import sha256
from pathlib import Path


PLAN_STATE_PATH = Path(__file__).resolve().parent / "output" / "schedule_states.json"


def _read(path=None):
    state_path = path or PLAN_STATE_PATH
    if not state_path.exists():
        return {}
    try:
        with state_path.open("r", encoding="utf-8") as file:
            states = json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read schedule states: {exc}") from exc
    if not isinstance(states, dict):
        raise ValueError("Schedule states must be stored as a JSON object.")
    return states


def load_schedule_state(planning_date, path=None):
    """Return the saved state or an unpersisted draft default."""
    date_key = str(planning_date)[:10]
    state = _read(path).get(date_key)
    if state is None:
        return {
            "planning_date": date_key,
            "status": "not_generated",
            "confirmed": False,
            "rescheduling_required": False,
            "rescheduling_processed": False,
            "released_to_phis": False,
            "version": 0,
        }
    return dict(state)


def plan_fingerprint(tasks):
    """Fingerprint assignment-relevant plan fields for idempotent confirmation."""
    rows = [
        {
            key: task.get(key)
            for key in (
                "scenario_task_id", "assigned_phi", "start_time", "end_time",
                "status", "task_status", "priority_score", "priority_level",
                "scheduling_priority_level",
            )
        }
        for task in tasks
    ]
    payload = json.dumps(rows, sort_keys=True, separators=(",", ":"))
    return sha256(payload.encode("utf-8")).hexdigest()


def save_schedule_state(planning_date, updates, path=None):
    """Atomically upsert review/confirmation state for one planning date."""
    date_key = str(planning_date)[:10]
    state_path = path or PLAN_STATE_PATH
    states = _read(state_path)
    current = states.get(date_key, load_schedule_state(date_key, state_path))
    current.update(updates)
    current["planning_date"] = date_key
    current["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    states[date_key] = current

    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = state_path.with_suffix(".tmp")
    try:
        with temporary_path.open("w", encoding="utf-8") as file:
            json.dump(states, file, indent=2)
        temporary_path.replace(state_path)
    except OSError:
        if temporary_path.exists():
            temporary_path.unlink()
        raise
    return dict(current)
