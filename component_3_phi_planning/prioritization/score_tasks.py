
import argparse
import csv
import sqlite3
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"

DEFAULT_DATABASE = (
    DATA_DIR / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"
)

DEFAULT_OUTPUT_DIR = BASE_DIR / "output"

COMPLAINT_SCORES = {
    "high": 90,
    "medium": 60,
    "low": 30,
}


def quote_identifier(name):
    """Safely quote a SQLite identifier."""
    return '"' + name.replace('"', '""') + '"'


def get_priority_level(score):
    """Convert a numeric score into a provisional priority level."""
    if score >= 70:
        return "High"
    if score >= 40:
        return "Medium"
    return "Low"


def score_case_risk(value):
    """Score a case using its risk indicator."""
    try:
        risk = float(value)
    except (TypeError, ValueError):
        return None, "Invalid risk indicator: not numeric"

    if not 0 <= risk <= 1:
        return None, "Invalid risk indicator: expected 0 to 1"

    score = round(risk * 100, 2)
    return score, f"Risk indicator {risk:.3f} converted to a 0-100 score"


def score_complaint_urgency(value):
    """Score a complaint using provisional urgency mappings."""
    if value is None:
        return None, "Invalid complaint urgency: missing value"

    urgency = str(value).strip().lower()

    if urgency not in COMPLAINT_SCORES:
        return None, f"Invalid complaint urgency: {value!r}"

    score = COMPLAINT_SCORES[urgency]
    return score, f"{urgency.title()} complaint urgency mapped to {score}"


def fetch_rows(connection, table):
    """Read all records from a known table."""
    cursor = connection.cursor()
    cursor.execute(f"SELECT * FROM {quote_identifier(table)}")

    columns = [item[0] for item in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    return rows


def write_csv(path, rows):
    """Write scored records to a CSV file."""
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


def score_cases(connection, calculated_at):
    """Score case-inspection records independently."""
    required = {
        "task_id",
        "task_type",
        "notification_date",
        "risk_indicator",
        "inspection_required",
        "location_id",
    }

    rows = fetch_rows(connection, "Case_Notifications")

    if rows and not required.issubset(rows[0]):
        missing = sorted(required - set(rows[0]))
        raise ValueError(
            f"Case_Notifications is missing columns: {missing}"
        )

    scored = []

    for row in rows:
        if str(row["inspection_required"]).strip().lower() != "yes":
            continue

        score, reason = score_case_risk(row["risk_indicator"])
        level = get_priority_level(score) if score is not None else "Review"

        scored.append({
            "task_id": row["task_id"],
            "task_type": row["task_type"],
            "notification_date": row["notification_date"],
            "location_id": row["location_id"],
            "risk_indicator": row["risk_indicator"],
            "priority_score": score,
            "priority_level": level,
            "priority_reason": reason,
            "calculated_at": calculated_at,
        })

    scored.sort(
        key=lambda row: (
            row["priority_score"] is None,
            -(row["priority_score"] or 0),
            str(row["notification_date"]),
            str(row["task_id"]),
        )
    )

    for rank, row in enumerate(scored, start=1):
        row["rank_within_task_type"] = (
            rank if row["priority_score"] is not None else ""
        )

    return scored


def score_complaints(connection, calculated_at):
    """Score citizen complaints separately from case inspections."""
    required = {
        "complaint_id",
        "received_date",
        "location_id",
        "complaint_type",
        "urgency",
    }

    rows = fetch_rows(connection, "Citizen_Complaints")

    if rows and not required.issubset(rows[0]):
        missing = sorted(required - set(rows[0]))
        raise ValueError(
            f"Citizen_Complaints is missing columns: {missing}"
        )

    scored = []

    for row in rows:
        score, reason = score_complaint_urgency(row["urgency"])
        level = get_priority_level(score) if score is not None else "Review"

        scored.append({
            "task_id": row["complaint_id"],
            "task_type": "Citizen Complaint",
            "received_date": row["received_date"],
            "location_id": row["location_id"],
            "complaint_type": row["complaint_type"],
            "urgency": row["urgency"],
            "priority_score": score,
            "priority_level": level,
            "priority_reason": reason,
            "calculated_at": calculated_at,
        })

    scored.sort(
        key=lambda row: (
            row["priority_score"] is None,
            -(row["priority_score"] or 0),
            str(row["received_date"]),
            str(row["task_id"]),
        )
    )

    for rank, row in enumerate(scored, start=1):
        row["rank_within_task_type"] = (
            rank if row["priority_score"] is not None else ""
        )

    return scored


def main():
    parser = argparse.ArgumentParser(
        description="Generate provisional C3 task priority scores."
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DATABASE,
        help="Path to the SQLite database.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for generated CSV files.",
    )
    args = parser.parse_args()

    database_path = args.db.resolve()

    if not database_path.is_file():
        raise FileNotFoundError(
            f"Database not found: {database_path}"
        )

    connection_uri = database_path.as_uri() + "?mode=ro"
    calculated_at = datetime.now().astimezone().isoformat(timespec="seconds")

    connection = sqlite3.connect(connection_uri, uri=True)

    try:
        cases = score_cases(connection, calculated_at)
        complaints = score_complaints(connection, calculated_at)
    finally:
        connection.close()

    write_csv(
        args.output_dir / "case_priority_scores.csv",
        cases,
    )
    write_csv(
        args.output_dir / "complaint_priority_scores.csv",
        complaints,
    )

    print("\nPriority scoring completed.")
    print("Case and complaint rankings are kept separate.")
    print("Scores are provisional and use synthetic research data.")


if __name__ == "__main__":
    main()
