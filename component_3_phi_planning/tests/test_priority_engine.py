"""Regression tests for the Component 2-driven priority engine."""

import sqlite3
from datetime import date
from pathlib import Path

from component_3_phi_planning.prioritization.activity_analytics import (
    calculate_location_activity,
)
from component_3_phi_planning.prioritization.score_tasks import (
    calculate_task_priority,
    get_priority_level,
    score_cases,
    score_complaints,
)


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "Kaduwela_C3_Research_Database_CleanPlanning.sqlite"


def make_activity_connection(daily_multiplier=1, baseline_multiplier=1):
    connection = sqlite3.connect(":memory:")
    connection.executescript(
        """
        CREATE TABLE Case_Notifications (
            task_id TEXT, notification_date TEXT, location_id TEXT,
            inspection_required TEXT, task_type TEXT, notification_time TEXT,
            moh_area TEXT, phi_range TEXT, village_area TEXT, location_label TEXT,
            initial_priority TEXT, risk_indicator REAL
        );
        CREATE TABLE Citizen_Complaints (
            complaint_id TEXT, received_date TEXT, location_id TEXT,
            urgency TEXT, complaint_type TEXT, status TEXT, received_time TEXT,
            moh_area TEXT, phi_range TEXT, village_area TEXT, location_label TEXT,
            assigned_to_phi TEXT
        );
        CREATE TABLE Component2_Location_Risk (
            location_id TEXT, risk_score REAL, risk_level TEXT, score_source TEXT
        );
        INSERT INTO Component2_Location_Risk VALUES
            ('LOC001', 0.5, 'Medium', 'Development seed');
        """
    )
    from datetime import timedelta

    start = date(2026, 4, 1)
    stop = date(2026, 7, 1)
    day = start
    sequence = 0
    while day <= stop:
        multiplier = (
            baseline_multiplier
            if day < date(2026, 6, 25)
            else daily_multiplier
        )
        for _ in range(multiplier):
            sequence += 1
            connection.execute(
                "INSERT INTO Case_Notifications VALUES (?, ?, ?, 'Yes', "
                "'Dengue Case Inspection', '09:00', 'Kaduwela', 'Range', "
                "'Village', 'Point', 'Low', 0.01)",
                (f"C{sequence}", day.isoformat(), "LOC001"),
            )
        day += timedelta(days=1)
    return connection


def test_historical_cases_use_labeled_case_baseline_urgency():
    with sqlite3.connect(DB_PATH) as connection:
        scored = score_cases(connection, "2026-09-30")
        sample = next(row for row in scored if row["task_id"] == "DNG00011")
        expected = connection.execute(
            "SELECT risk_score FROM Component2_Location_Risk WHERE location_id = ?",
            (sample["location_id"],),
        ).fetchone()[0]

        assert sample["component2_risk_score"] == expected
        assert sample["priority_score"] is not None
        assert sample["priority_level"] == get_priority_level(sample["priority_score"])
        assert sample["data_quality_status"] == "provisional_assumption"
        assert sample["priority_factors"]["location_risk"]["score"] == expected * 100
        assert sample["priority_factors"]["area_activity"]["score"] is not None
        assert sample["priority_factors"]["task_urgency"]["score"] == 60
        assert sample["priority_factors"]["task_urgency"]["assumption"] is True
        assert "risk_indicator" not in sample
        assert "initial_priority" not in sample
        assert "historical_assigned_phi" not in sample


def test_score_as_of_does_not_filter_source_task_rows():
    with sqlite3.connect(DB_PATH) as connection:
        cases = score_cases(connection, "2026-05-02")
        complaints = score_complaints(connection, "2026-05-02")

    assert len(cases) == 6050
    assert len(complaints) == 811
    assert any(row["notification_date"] > "2026-05-02" for row in cases)
    assert any(row["received_date"] > "2026-05-02" for row in complaints)


def test_may_second_is_scoreable_with_one_observed_prior_month():
    with sqlite3.connect(DB_PATH) as connection:
        cases = score_cases(connection, "2026-05-02")
        complaints = score_complaints(connection, "2026-05-02")
        case = next(row for row in cases if row["task_id"] == "DNG00001")
        complaint = next(row for row in complaints if row["urgency"] == "High")

    assert case["priority_score"] is not None
    assert case["priority_level"] in {"High", "Medium", "Low"}
    assert case["monthly_activity_score"] is not None
    assert complaint["priority_score"] is not None
    assert complaint["priority_level"] in {"High", "Medium", "Low"}


def test_april_first_remains_review_when_monthly_baseline_does_not_exist():
    with sqlite3.connect(DB_PATH) as connection:
        cases = score_cases(connection, "2026-04-01")
        sample = next(row for row in cases if row["task_id"] == "DNG00001")

    assert sample["priority_score"] is None
    assert sample["priority_level"] == "Review"
    assert "Insufficient complete history" in sample["priority_reason"]


def test_daily_case_activity_changes_activity_and_priority():
    low_connection = make_activity_connection(daily_multiplier=1)
    high_connection = make_activity_connection(daily_multiplier=4)
    try:
        low_activity = calculate_location_activity(
            low_connection, "LOC001", date(2026, 7, 1)
        )
        high_activity = calculate_location_activity(
            high_connection, "LOC001", date(2026, 7, 1)
        )
        low_score, _, _ = calculate_task_priority(
            0.5, "Medium", date(2026, 6, 30), date(2026, 7, 1), low_activity, "case"
        )
        high_score, _, _ = calculate_task_priority(
            0.5, "Medium", date(2026, 6, 30), date(2026, 7, 1), high_activity, "case"
        )
    finally:
        low_connection.close()
        high_connection.close()

    assert high_activity["daily_activity_score"] > low_activity["daily_activity_score"]
    assert high_score > low_score


def test_duplicate_notification_ids_are_counted_once_in_daily_activity():
    connection = make_activity_connection()
    connection.executemany(
        "INSERT INTO Case_Notifications VALUES (?, ?, ?, 'Yes', "
        "'Dengue Case Inspection', '09:00', 'Kaduwela', 'Range', 'Village', "
        "'Point', 'Low', 0.01)",
        [
            ("DUPLICATE", "2026-06-29", "LOC001"),
            ("DUPLICATE", "2026-06-30", "LOC001"),
        ],
    )
    try:
        activity = calculate_location_activity(
            connection, "LOC001", date(2026, 7, 1)
        )
    finally:
        connection.close()

    assert activity["daily_case_count"] == 8


def test_monthly_trend_changes_activity_score_with_sufficient_history():
    low_baseline = make_activity_connection(baseline_multiplier=1)
    high_baseline = make_activity_connection(baseline_multiplier=3)
    try:
        low_activity = calculate_location_activity(low_baseline, "LOC001", date(2026, 7, 1))
        high_activity = calculate_location_activity(high_baseline, "LOC001", date(2026, 7, 1))
    finally:
        low_baseline.close()
        high_baseline.close()

    assert low_activity["monthly_activity_score"] is not None
    assert high_activity["monthly_activity_score"] < low_activity["monthly_activity_score"]


def test_waiting_time_and_component2_risk_change_priority():
    activity = {"activity_score": 50, "data_quality_issues": []}
    recent, _, _ = calculate_task_priority(
        0.5, "Medium", date(2026, 7, 1), date(2026, 7, 1), activity, "case"
    )
    older, _, _ = calculate_task_priority(
        0.5, "Medium", date(2026, 6, 1), date(2026, 7, 1), activity, "case"
    )
    higher_risk, _, _ = calculate_task_priority(
        0.9, "Medium", date(2026, 7, 1), date(2026, 7, 1), activity, "case"
    )

    assert older > recent
    assert higher_risk > recent


def test_default_case_urgency_is_distinct_from_complaint_urgency():
    activity = {"activity_score": 50, "data_quality_issues": []}
    case_score, _, case_factors = calculate_task_priority(
        0.5, None, date(2026, 6, 30), date(2026, 7, 1), activity, "case"
    )
    complaint_score, _, complaint_factors = calculate_task_priority(
        0.5, "Medium", date(2026, 6, 30), date(2026, 7, 1), activity, "complaint"
    )

    assert case_score is not None
    assert case_factors["task_urgency"]["score"] == 60
    assert case_factors["task_urgency"]["source"] == "configured_case_baseline"
    assert case_factors["task_urgency"]["assumption"] is True
    assert complaint_factors["task_urgency"]["score"] == 60
    assert complaint_factors["task_urgency"]["source"] == "explicit_task_urgency"
    assert complaint_factors["task_urgency"]["assumption"] is False
    assert case_score == complaint_score


def test_task_score_changes_with_risk_and_score_as_of_date():
    activity_as_of_early = {"activity_score": 40, "data_quality_issues": []}
    activity_as_of_late = {"activity_score": 80, "data_quality_issues": []}
    early_score, _, _ = calculate_task_priority(
        0.5, "High", date(2026, 4, 1), date(2026, 5, 2), activity_as_of_early, "case"
    )
    later_score, _, _ = calculate_task_priority(
        0.5, "High", date(2026, 4, 1), date(2026, 5, 12), activity_as_of_late, "case"
    )
    risk_score, _, _ = calculate_task_priority(
        0.9, "High", date(2026, 4, 1), date(2026, 5, 2), activity_as_of_early, "case"
    )

    assert later_score > early_score
    assert risk_score > early_score


def test_insufficient_history_and_missing_risk_return_review_but_case_urgency_uses_baseline():
    connection = sqlite3.connect(":memory:")
    connection.executescript(
        "CREATE TABLE Case_Notifications (task_id TEXT, notification_date TEXT, location_id TEXT);"
        "CREATE TABLE Citizen_Complaints (complaint_id TEXT, received_date TEXT, location_id TEXT);"
        "INSERT INTO Case_Notifications VALUES ('C1', '2026-07-01', 'LOC001');"
    )
    try:
        insufficient = calculate_location_activity(connection, "LOC001", date(2026, 7, 1))
    finally:
        connection.close()

    assert insufficient["activity_score"] is None
    score, reason, _ = calculate_task_priority(
        0.5, "High", date(2026, 7, 1), date(2026, 7, 1), insufficient, "case"
    )
    assert score is None
    assert "insufficient" in reason.lower() or "incomplete" in reason.lower()

    valid_activity = {"activity_score": 50, "data_quality_issues": []}
    score, reason, factors = calculate_task_priority(
        None, "High", date(2026, 7, 1), date(2026, 7, 1), valid_activity, "case"
    )
    assert score is None
    assert "component 2 risk" in reason.lower()
    assert factors["location_risk"]["contribution"] is None

    score, reason, factors = calculate_task_priority(
        0.5, None, date(2026, 7, 1), date(2026, 7, 1), valid_activity, "case"
    )
    assert score is not None
    assert factors["task_urgency"]["score"] == 60
    assert factors["task_urgency"]["assumption"] is True
    assert "routine-case baseline" in reason.lower()


def test_legacy_priority_and_risk_fields_do_not_affect_case_score():
    connection = make_activity_connection()
    connection.execute("ALTER TABLE Case_Notifications ADD COLUMN historical_assigned_phi TEXT")
    connection.executemany(
        "INSERT INTO Case_Notifications VALUES (?, ?, ?, 'Yes', "
        "'Dengue Case Inspection', '09:00', 'Kaduwela', 'Range', 'Village', "
        "'Point', ?, ?, ?)",
        [
            ("CASE-A", "2026-06-30", "LOC001", "Low", 0.01, "PHI01"),
            ("CASE-B", "2026-06-30", "LOC001", "High", 0.99, "PHI99"),
        ],
    )
    try:
        rows = score_cases(connection, "2026-07-01")
    finally:
        connection.close()

    by_id = {row["task_id"]: row for row in rows}
    assert by_id["CASE-A"]["priority_score"] == by_id["CASE-B"]["priority_score"]
    assert by_id["CASE-A"]["priority_factors"] == by_id["CASE-B"]["priority_factors"]


def test_weighted_priority_includes_each_factor_contribution():
    activity = {"activity_score": 50, "data_quality_issues": []}
    score, reason, factors = calculate_task_priority(
        0.9,
        "High",
        date(2026, 10, 6),
        date(2026, 10, 21),
        activity,
        "complaint",
    )

    assert score == 76.0
    assert get_priority_level(score) == "High"
    assert factors["location_risk"]["contribution"] == 45.0
    assert factors["area_activity"]["contribution"] == 10.0
    assert factors["waiting_time"]["contribution"] == 7.5
    assert factors["task_urgency"]["contribution"] == 13.5
    assert "Task Urgency 90.00 x 15% = 13.50" in reason


def test_missing_complaint_urgency_returns_review_without_partial_total():
    activity = {"activity_score": 50, "data_quality_issues": []}
    score, reason, factors = calculate_task_priority(
        0.9,
        None,
        date(2026, 10, 21),
        date(2026, 10, 21),
        activity,
        "complaint",
    )

    assert score is None
    assert reason.startswith("Review:")
    assert "urgency" in reason.lower()
    assert factors["task_urgency"]["contribution"] is None


def test_priority_thresholds_are_consistent():
    assert get_priority_level(70) == "High"
    assert get_priority_level(40) == "Medium"
    assert get_priority_level(39.99) == "Low"
    assert get_priority_level(None) == "Review"


def test_invalid_wait_date_returns_review():
    score, reason, factors = calculate_task_priority(
        0.8,
        "High",
        "not-a-date",
        date(2026, 7, 1),
        {"activity_score": 50, "data_quality_issues": []},
        "case",
    )

    assert score is None
    assert "date" in reason.lower()
    assert factors["waiting_time"]["contribution"] is None


def test_weighted_complaint_priority_uses_urgency_and_preserves_risk_context():
    with sqlite3.connect(DB_PATH) as connection:
        scored = score_complaints(connection, "2026-09-30")
        high = next(
            row for row in scored
            if str(row.get("urgency", "")).lower() == "high"
        )

        assert high["priority_score"] is not None
        assert high["priority_score"] == sum(
            factor["contribution"]
            for factor in high["priority_factors"].values()
        )
        assert high["priority_level"] == get_priority_level(high["priority_score"])
        assert high["component2_risk_score"] is not None
        assert high["priority_factors"]["task_urgency"]["score"] == 90
        assert high["priority_factors"]["area_activity"]["score"] is not None


def test_complaint_missing_urgency_remains_review():
    activity = {"activity_score": 50, "data_quality_issues": []}
    score, reason, factors = calculate_task_priority(
        0.8, None, date(2026, 5, 1), date(2026, 5, 2), activity, "complaint"
    )

    assert score is None
    assert reason.startswith("Review:")
    assert "complaint urgency" in reason.lower()
    assert factors["task_urgency"]["contribution"] is None