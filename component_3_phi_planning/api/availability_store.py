"""Persistent user overrides for date-specific synthetic PHI availability."""

import json
from datetime import date, datetime
from pathlib import Path


PHI_AVAILABILITY_PATH = (
    Path(__file__).resolve().parent
    / "output"
    / "phi_availability_overrides.json"
)
VALID_AVAILABILITY = {"Available", "Unavailable"}
DEFAULT_MOH_AREA = "Kaduwela"


def _date_key(planning_date):
    if isinstance(planning_date, date):
        return planning_date.isoformat()
    if isinstance(planning_date, str):
        try:
            return date.fromisoformat(planning_date).isoformat()
        except ValueError as exc:
            raise ValueError("Planning date must be a valid ISO date.") from exc
    raise ValueError("Planning date must be a valid date.")


def load_availability_overrides(path=None):
    """Read saved overrides without mutating the source PHI_Daily table."""
    override_path = path or PHI_AVAILABILITY_PATH
    if not override_path.exists():
        return []
    try:
        with override_path.open("r", encoding="utf-8") as file:
            records = json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read PHI availability overrides: {exc}") from exc
    if not isinstance(records, list):
        raise ValueError("PHI availability overrides must be a JSON list.")
    return records


def save_availability_override(phi_id, planning_date, availability, path=None):
    """Persist one PHI/date override; other dates remain unchanged."""
    if availability not in VALID_AVAILABILITY:
        raise ValueError("Availability must be Available or Unavailable.")

    date_key = _date_key(planning_date)
    override_path = path or PHI_AVAILABILITY_PATH
    records = load_availability_overrides(override_path)
    record = {
        "phi_id": phi_id,
        "planning_date": date_key,
        "availability": availability,
        "updated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    replaced = False
    for index, existing in enumerate(records):
        if (
            existing.get("phi_id") == phi_id
            and existing.get("planning_date") == record["planning_date"]
        ):
            records[index] = record
            replaced = True
            break
    if not replaced:
        records.append(record)

    override_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = override_path.with_suffix(".tmp")
    try:
        with temporary_path.open("w", encoding="utf-8") as file:
            json.dump(records, file, indent=2)
        temporary_path.replace(override_path)
    except OSError:
        if temporary_path.exists():
            temporary_path.unlink()
        raise
    return record


def apply_availability_override(phi_daily, planning_date, path=None):
    """Apply explicit overrides for this date to the default-available roster."""
    date_key = _date_key(planning_date)
    overrides = {}
    for row in load_availability_overrides(path):
        if not isinstance(row, dict) or row.get("planning_date") != date_key:
            continue
        phi_id = row.get("phi_id")
        availability = row.get("availability")
        if phi_id not in phi_daily or availability not in VALID_AVAILABILITY:
            continue
        overrides[phi_id] = row

    for phi_id, details in phi_daily.items():
        override = overrides.get(phi_id)
        details.setdefault("source_availability", details.get("availability", "Available"))
        details["availability_override"] = override
        details["availability"] = "Available"
        if override and override["availability"] == "Unavailable":
            details["availability"] = override["availability"]
    return phi_daily


def load_phi_daily_defaults(connection, planning_date, path=None):
    """Build the selected-date PHI roster with master capacity and explicit overrides.

    PHI_Daily supplies date-specific capacity, workload, hours, and range when
    present. Missing rows inherit nominal capacity and working hours from
    PHI_Master with zero date-specific workload; availability defaults to
    Available unless this date has an explicit unavailable override.
    """
    date_key = _date_key(planning_date)
    cursor = connection.execute(
        """
        SELECT m.phi_id, m.moh_area, m.phi_range AS master_phi_range,
               m.primary_village_area, m.working_start AS master_working_start,
               m.working_end AS master_working_end,
               m.nominal_daily_capacity,
               d.phi_range AS daily_phi_range, d.availability AS daily_availability,
               d.working_start AS daily_working_start,
               d.working_end AS daily_working_end,
               d.daily_capacity, d.existing_workload
        FROM PHI_Master AS m
        LEFT JOIN PHI_Daily AS d
            ON d.phi_id = m.phi_id AND d.date = ?
        WHERE lower(trim(m.moh_area)) = lower(trim(?))
        ORDER BY m.phi_id
        """,
        (date_key, DEFAULT_MOH_AREA),
    )
    columns = [item[0] for item in cursor.description]
    rows = cursor.fetchall()

    phi_daily = {}
    for row in rows:
        record = dict(zip(columns, row))
        capacity = record["daily_capacity"]
        if capacity is None:
            capacity = record["nominal_daily_capacity"]
        if capacity is None:
            raise ValueError(
                f"Nominal daily capacity is missing for PHI {record['phi_id']}."
            )
        workload = int(record["existing_workload"] or 0)
        daily_capacity = int(capacity)
        phi_daily[record["phi_id"]] = {
            "phi_id": record["phi_id"],
            "moh_area": record["moh_area"],
            "phi_range": record["daily_phi_range"] or record["master_phi_range"],
            "primary_village_area": record["primary_village_area"],
            "availability": "Available",
            "source_availability": record["daily_availability"] or "Available",
            "working_start": record["daily_working_start"] or record["master_working_start"],
            "working_end": record["daily_working_end"] or record["master_working_end"],
            "daily_capacity": daily_capacity,
            "existing_workload": workload,
            "remaining_capacity": max(0, daily_capacity - workload),
        }
    return apply_availability_override(phi_daily, date_key, path)