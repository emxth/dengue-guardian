"""Calculate task priorities from current planning inputs.

Case priority uses Component 2's location risk score joined by location_id.
Legacy risk_indicator and initial_priority fields are not used.
Complaint priority uses the provisional urgency mapping documented for C3.
All scores and thresholds remain experimental and use synthetic data.
"""

import argparse
import csv
import sqlite3
from datetime import date, datetime
from pathlib import Path

from component_3_phi_planning.config import PRIORITIZATION
from component_3_phi_planning.prioritization.activity_analytics import (
    calculate_location_activity,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
DEFAULT_DATABASE = DATA_DIR / "Kaduwela_C3_Research_Database_CleanPlanning.sqlite"
DEFAULT_OUTPUT_DIR = BASE_DIR / "output"


def get_priority_level(score):
    """Map a numeric score to the documented provisional priority tier."""
    if score is None:
        return "Review"
    if score >= PRIORITIZATION["high_threshold"]:
        return "High"
    if score >= PRIORITIZATION["medium_threshold"]:
        return "Medium"
    return "Low"


def score_case_risk(value):
    """Convert Component 2's normalized location risk score to 0–100."""
    try:
        risk = float(value)
    except (TypeError, ValueError):
        return None, "Missing or non-numeric Component 2 risk score"

    if not 0 <= risk <= 1:
        return None, "Invalid Component 2 risk score: expected 0 to 1"

    score = round(risk * PRIORITIZATION["component2_risk_scale"], 2)
    return score, f"Component 2 location risk {risk:.3f} converted to a 0-100 score"


def score_task_urgency(value, task_type):
    """Map urgency or return the explicitly configured routine-case baseline."""
    if value is None:
        if task_type == "case":
            default_score = PRIORITIZATION["case_default_urgency_score"]
            return (
                default_score,
                "Configured routine dengue-case urgency baseline",
                "configured_case_baseline",
            )
        return None, "Missing complaint urgency", None
    urgency = str(value).strip().lower()
    mapping_key = "case_urgency_scores" if task_type == "case" else "complaint_urgency_scores"
    urgency_scores = PRIORITIZATION[mapping_key]
    if urgency not in urgency_scores:
        return None, f"Invalid {task_type} urgency: {value!r}", None
    return urgency_scores[urgency], f"{urgency.title()} {task_type} urgency", "explicit_task_urgency"


def calculate_task_priority(
    risk_value,
    urgency_value,
    task_date,
    planning_date,
    activity_data,
    task_type,
):
    """Apply configured risk/activity/wait/urgency factors or return Review."""
    risk_score, risk_reason = score_case_risk(risk_value)
    urgency_score, urgency_reason, urgency_source = score_task_urgency(
        urgency_value, task_type
    )

    try:
        task_day = (
            task_date
            if isinstance(task_date, date)
            else date.fromisoformat(str(task_date)[:10])
        )
        as_of_day = (
            planning_date
            if isinstance(planning_date, date)
            else date.fromisoformat(str(planning_date)[:10])
        )
        elapsed_days = max(0, (as_of_day - task_day).days)
        time_score = round(
            min(elapsed_days / PRIORITIZATION["waiting_time_cap_days"], 1) * 100,
            2,
        )
    except (TypeError, ValueError):
        time_score = None

    activity_score = activity_data.get("activity_score")
    weights = PRIORITIZATION["weights"]
    inputs = {
        "location_risk": risk_score,
        "area_activity": activity_score,
        "waiting_time": time_score,
        "task_urgency": urgency_score,
    }
    factors = {
        name: {
            "score": value,
            "weight": weights[name],
            "source": urgency_source if name == "task_urgency" else None,
            "assumption": (
                urgency_source == "configured_case_baseline"
                if name == "task_urgency"
                else False
            ),
            "contribution": (
                round(value * weights[name], 2)
                if value is not None
                else None
            ),
        }
        for name, value in inputs.items()
    }

    missing = [name for name, value in inputs.items() if value is None]
    if missing:
        issues = []
        if risk_score is None:
            issues.append(risk_reason)
        if activity_score is None:
            issues.extend(activity_data.get("data_quality_issues", ["Area dengue activity is unavailable"]))
        if urgency_score is None:
            issues.append(urgency_reason)
        if time_score is None:
            issues.append("Task date or planning date is missing or invalid")
        return None, "Review: " + "; ".join(issues), factors

    score = round(sum(factor["contribution"] for factor in factors.values()), 2)
    reason = "; ".join(
        f"{name.replace('_', ' ').title()} "
        f"{factor['score']:.2f} x {factor['weight']:.0%} "
        f"= {factor['contribution']:.2f}"
        for name, factor in factors.items()
    )
    if urgency_source == "configured_case_baseline":
        reason += "; task urgency uses configured routine-case baseline (assumption)"
    return score, reason, factors


def score_cases(connection, calculated_at):
    """Score eligible cases using risk, area activity, wait time, and urgency."""
    planning_date = (
        calculated_at
        if isinstance(calculated_at, date)
        else date.fromisoformat(str(calculated_at)[:10])
    )
    cursor = connection.execute(
        """
        WITH unique_cases AS (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY task_id ORDER BY notification_date, location_id
            ) AS record_number
            FROM Case_Notifications
        )
        SELECT
            c.task_id, c.task_type, c.notification_date, c.notification_time,
            c.location_id, c.moh_area, c.phi_range, c.village_area,
            c.location_label, c.inspection_required,
            r.risk_score AS component2_risk_score,
            r.risk_level AS component2_risk_level,
            r.score_source AS component2_score_source,
            NULL AS urgency
        FROM unique_cases AS c
        LEFT JOIN Component2_Location_Risk AS r
            ON r.location_id = c.location_id
        WHERE LOWER(TRIM(COALESCE(c.inspection_required, ''))) = 'yes'
            AND c.record_number = 1
        """
    )
    columns = [d[0] for d in cursor.description]
    rows = cursor.fetchall()
    scored = []
    activity_by_location = {}
    for values in rows:
        row = dict(zip(columns, values))
        location_id = row["location_id"]
        if location_id not in activity_by_location:
            activity_by_location[location_id] = calculate_location_activity(
                connection, location_id, planning_date
            )
        activity_data = activity_by_location[location_id]
        score, reason, factors = calculate_task_priority(
            row["component2_risk_score"],
            row["urgency"],
            row["notification_date"],
            planning_date,
            activity_data,
            "case",
        )
        level = get_priority_level(score)
        if score is None:
            level = "Review"
        row.update({
            "priority_score": score,
            "priority_level": level,
            "priority_reason": reason,
            "priority_factors": factors,
            **activity_data,
            "data_quality_status": (
                "review" if score is None else
                "provisional_assumption"
                if factors["task_urgency"]["assumption"] else "complete"
            ),
            "calculated_at": calculated_at,
            "task_source": "CASE",
        })
        scored.append(row)

    scored.sort(key=lambda r: (
        r["priority_score"] is None,
        -(r["priority_score"] or 0),
        str(r.get("notification_date") or ""),
        str(r.get("task_id") or ""),
    ))
    for rank, row in enumerate(scored, start=1):
        row["rank_within_task_type"] = rank if row["priority_score"] is not None else ""
    return scored


def score_complaints(connection, calculated_at):
    """Score complaints with task urgency and shared location activity."""
    planning_date = (
        calculated_at
        if isinstance(calculated_at, date)
        else date.fromisoformat(str(calculated_at)[:10])
    )
    cursor = connection.execute(
        """
        WITH unique_complaints AS (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY complaint_id ORDER BY received_date, location_id
            ) AS record_number
            FROM Citizen_Complaints
        )
        SELECT
            c.complaint_id AS task_id, 'Citizen Complaint' AS task_type,
            c.received_date, c.received_time, c.location_id, c.moh_area,
            c.phi_range, c.village_area, c.location_label,
            c.complaint_type, c.urgency, c.status,
            'Yes' AS inspection_required,
            r.risk_score AS component2_risk_score,
            r.risk_level AS component2_risk_level,
            r.score_source AS component2_score_source
        FROM unique_complaints AS c
        LEFT JOIN Component2_Location_Risk AS r
            ON r.location_id = c.location_id
        WHERE c.record_number = 1
        """
    )
    columns = [d[0] for d in cursor.description]
    rows = cursor.fetchall()
    scored = []
    activity_by_location = {}
    for values in rows:
        row = dict(zip(columns, values))
        location_id = row["location_id"]
        if location_id not in activity_by_location:
            activity_by_location[location_id] = calculate_location_activity(
                connection, location_id, planning_date
            )
        activity_data = activity_by_location[location_id]
        score, reason, factors = calculate_task_priority(
            row["component2_risk_score"],
            row["urgency"],
            row["received_date"],
            planning_date,
            activity_data,
            "complaint",
        )
        row.update({
            "priority_score": score,
            "priority_level": get_priority_level(score),
            "priority_reason": reason,
            "priority_factors": factors,
            **activity_data,
            "data_quality_status": "review" if score is None else "complete",
            "calculated_at": calculated_at,
            "task_source": "COMPLAINT",
        })
        scored.append(row)
    scored.sort(key=lambda r: (
        r["priority_score"] is None,
        -(r["priority_score"] or 0),
        str(r.get("received_date") or ""),
        str(r.get("task_id") or ""),
    ))
    for rank, row in enumerate(scored, start=1):
        row["rank_within_task_type"] = rank if row["priority_score"] is not None else ""
    return scored


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        print(f"No records to write: {path}")
        return
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved: {path}")
    print(f"Records: {len(rows):,}")


def main():
    parser = argparse.ArgumentParser(description="Calculate provisional C3 task priorities.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DATABASE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()
    database_path = args.db.resolve()
    if not database_path.is_file():
        raise FileNotFoundError(f"Database not found: {database_path}")
    with sqlite3.connect(database_path.as_uri() + "?mode=ro", uri=True) as connection:
        calculated_at = datetime.now().astimezone().isoformat(timespec="seconds")
        cases = score_cases(connection, calculated_at)
        complaints = score_complaints(connection, calculated_at)
    write_csv(args.output_dir / "case_priority_scores.csv", cases)
    write_csv(args.output_dir / "complaint_priority_scores.csv", complaints)
    print("\nPriority scoring completed from Component 2 location risk and complaint urgency.")
    print("Legacy initial_priority, risk_indicator, and historical PHI assignments are not used.")


if __name__ == "__main__":
    main()
