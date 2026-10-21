"""Location-level dengue activity calculations for the C3 prototype."""

import calendar
import sqlite3
from datetime import date, timedelta

from component_3_phi_planning.config import PRIORITIZATION

METRICS = {
    "cases": ("Case_Notifications", "task_id", "notification_date"),
    "complaints": ("Citizen_Complaints", "complaint_id", "received_date"),
}


def _coverage(connection, table, date_column):
    row = connection.execute(
        f"SELECT MIN({date_column}), MAX({date_column}), "
        f"COUNT(DISTINCT {date_column}) FROM {table}"
    ).fetchone()
    if not row or row[0] is None:
        return None
    return {"start": date.fromisoformat(row[0]), "end": date.fromisoformat(row[1]), "date_count": row[2]}


def _period_is_covered(connection, table, date_column, start_date, end_date):
    coverage = _coverage(connection, table, date_column)
    if coverage is None or coverage["start"] > start_date or coverage["end"] < end_date:
        return False
    observed_days = connection.execute(
        f"SELECT COUNT(DISTINCT {date_column}) FROM {table} "
        f"WHERE {date_column} >= ? AND {date_column} <= ?",
        (start_date.isoformat(), end_date.isoformat()),
    ).fetchone()[0]
    return observed_days == (end_date - start_date).days + 1


def _month_start(value):
    return value.replace(day=1)


def _previous_month(value, offset):
    month_index = value.year * 12 + value.month - 1 - offset
    return date(month_index // 12, month_index % 12 + 1, 1)


def _next_month(value):
    month_index = value.year * 12 + value.month
    return date(month_index // 12, month_index % 12 + 1, 1)


def calculate_location_activity(connection, location_id, planning_date):
    """Calculate D, M, and A for one location as of the planning date.

    D is the mean distinct case count per day over the trailing configured
    window. M compares current month-to-date daily rate with the average daily
    rate in the preceding configured number of complete months. A is unavailable
    unless both inputs and their date coverage are valid.
    """
    planning_date = (
        planning_date
        if isinstance(planning_date, date)
        else date.fromisoformat(str(planning_date)[:10])
    )
    table, id_column, date_column = METRICS["cases"]
    daily_days = PRIORITIZATION["recent_activity_window_days"]
    daily_start = planning_date - timedelta(days=daily_days - 1)
    daily_score = None
    daily_count = None
    monthly_score = None
    monthly_count = None
    baseline_rate = None
    monthly_ratio = None
    issues = []

    if _period_is_covered(connection, table, date_column, daily_start, planning_date):
        daily_count = connection.execute(
            f"WITH dedup AS (SELECT {id_column}, location_id, {date_column}, "
            f"ROW_NUMBER() OVER (PARTITION BY {id_column} ORDER BY {date_column}, location_id) AS row_num "
            f"FROM {table}) SELECT COUNT(*) FROM dedup WHERE row_num = 1 "
            f"AND location_id = ? AND {date_column} >= ? AND {date_column} <= ?",
            (location_id, daily_start.isoformat(), planning_date.isoformat()),
        ).fetchone()[0]
        daily_rate = daily_count / daily_days
        daily_score = round(
            min(daily_rate / PRIORITIZATION["daily_case_count_cap"], 1) * 100,
            2,
        )
    else:
        issues.append("Recent daily case activity is outside or incomplete in source coverage")

    complaint_table, complaint_id, complaint_date = METRICS["complaints"]
    if _period_is_covered(
        connection, complaint_table, complaint_date, daily_start, planning_date
    ):
        recent_complaint_count = connection.execute(
            f"WITH dedup AS (SELECT {complaint_id}, location_id, {complaint_date}, "
            f"ROW_NUMBER() OVER (PARTITION BY {complaint_id} ORDER BY {complaint_date}, location_id) AS row_num "
            f"FROM {complaint_table}) SELECT COUNT(*) FROM dedup WHERE row_num = 1 "
            f"AND location_id = ? AND {complaint_date} >= ? AND {complaint_date} <= ?",
            (location_id, daily_start.isoformat(), planning_date.isoformat()),
        ).fetchone()[0]
        complaint_data_quality = "complete"
    else:
        recent_complaint_count = None
        complaint_data_quality = "review"

    month_start = _month_start(planning_date)
    if _period_is_covered(connection, table, date_column, month_start, planning_date):
        monthly_count = connection.execute(
            f"WITH dedup AS (SELECT {id_column}, location_id, {date_column}, "
            f"ROW_NUMBER() OVER (PARTITION BY {id_column} ORDER BY {date_column}, location_id) AS row_num "
            f"FROM {table}) SELECT COUNT(*) FROM dedup WHERE row_num = 1 "
            f"AND location_id = ? AND {date_column} >= ? AND {date_column} <= ?",
            (location_id, month_start.isoformat(), planning_date.isoformat()),
        ).fetchone()[0]
        current_days = (planning_date - month_start).days + 1
        current_rate = monthly_count / current_days
        rates = []
        enough_history = True
        for offset in range(1, PRIORITIZATION["monthly_baseline_months"] + 1):
            baseline_start = _previous_month(month_start, offset)
            baseline_end = _next_month(baseline_start) - timedelta(days=1)
            if not _period_is_covered(
                connection, table, date_column, baseline_start, baseline_end
            ):
                enough_history = False
                break
            count = connection.execute(
                f"WITH dedup AS (SELECT {id_column}, location_id, {date_column}, "
                f"ROW_NUMBER() OVER (PARTITION BY {id_column} ORDER BY {date_column}, location_id) AS row_num "
                f"FROM {table}) SELECT COUNT(*) FROM dedup WHERE row_num = 1 "
                f"AND location_id = ? AND {date_column} >= ? AND {date_column} <= ?",
                (location_id, baseline_start.isoformat(), baseline_end.isoformat()),
            ).fetchone()[0]
            rates.append(count / ((baseline_end - baseline_start).days + 1))
        if enough_history and rates:
            baseline_rate = sum(rates) / len(rates)
            if baseline_rate > 0:
                monthly_ratio = current_rate / baseline_rate
                max_ratio = PRIORITIZATION["monthly_activity_max_ratio"]
                monthly_score = round(min(monthly_ratio / max_ratio, 1) * 100, 2)
            else:
                issues.append("Historical monthly baseline is zero; trend is unavailable")
        else:
            issues.append(
                f"Insufficient complete history: requires "
                f"{PRIORITIZATION['monthly_baseline_months']} prior months"
            )
    else:
        issues.append("Current month-to-date case activity is outside or incomplete in source coverage")

    activity_score = None
    if daily_score is not None and monthly_score is not None:
        weights = PRIORITIZATION["activity_weights"]
        activity_score = round(
            daily_score * weights["daily"] + monthly_score * weights["monthly"],
            2,
        )

    return {
        "daily_case_count": daily_count,
        "daily_activity_score": daily_score,
        "daily_window_start": daily_start.isoformat(),
        "daily_window_end": planning_date.isoformat(),
        "recent_complaint_count": recent_complaint_count,
        "complaint_activity_data_quality": complaint_data_quality,
        "monthly_case_count": monthly_count,
        "historical_monthly_daily_rate": baseline_rate,
        "monthly_activity_ratio": monthly_ratio,
        "monthly_activity_score": monthly_score,
        "activity_score": activity_score,
        "data_quality_status": "complete" if activity_score is not None else "review",
        "data_quality_issues": issues,
        "risk_provenance": "Component2_Location_Risk has untimestamped Development seed scores; feature overlap is undocumented",
    }


def get_monthly_location_analytics(connection, location_id, year, metric):
    """Return 12 calendar months with counts and explicit coverage state."""
    if metric not in METRICS:
        raise ValueError("Metric must be 'cases' or 'complaints'.")
    table, id_column, date_column = METRICS[metric]
    start_year = date(year, 1, 1)
    end_year = date(year, 12, 31)
    coverage = _coverage(connection, table, date_column)
    if coverage is None:
        return {
            "data_mode": "synthetic_research_data",
            "metric": metric,
            "location_id": location_id,
            "year": year,
            "coverage_start": None,
            "coverage_end": None,
            "available_years": [],
            "months": [
                {
                    "month": f"{year}-{month:02d}",
                    "label": calendar.month_abbr[month],
                    "count": None,
                    "coverage_status": "unavailable",
                    "month_over_month_change_pct": None,
                }
                for month in range(1, 13)
            ],
            "note": "No source date coverage is available; monthly counts are unavailable, not zero.",
        }

    counts = connection.execute(
        f"WITH dedup AS (SELECT {id_column}, location_id, {date_column}, "
        f"ROW_NUMBER() OVER (PARTITION BY {id_column} ORDER BY {date_column}, location_id) AS row_num "
        f"FROM {table}) SELECT substr({date_column}, 1, 7) AS month, "
        f"COUNT(*) AS record_count FROM dedup WHERE row_num = 1 "
        f"AND location_id = ? AND {date_column} >= ? AND {date_column} <= ? "
        f"GROUP BY substr({date_column}, 1, 7)",
        (location_id, start_year.isoformat(), end_year.isoformat()),
    ).fetchall()
    count_by_month = dict(counts)

    month_rows = []
    for month in range(1, 13):
        month_begin = date(year, month, 1)
        month_end = date(year, month, calendar.monthrange(year, month)[1])
        observed_dates = connection.execute(
            f"SELECT COUNT(DISTINCT {date_column}) FROM {table} "
            f"WHERE {date_column} >= ? AND {date_column} <= ?",
            (month_begin.isoformat(), month_end.isoformat()),
        ).fetchone()[0]
        expected_dates = (month_end - month_begin).days + 1
        if observed_dates == expected_dates:
            coverage_status = "complete"
            record_count = int(count_by_month.get(month_begin.strftime("%Y-%m"), 0))
        elif observed_dates:
            coverage_status = "partial"
            record_count = int(count_by_month.get(month_begin.strftime("%Y-%m"), 0))
        else:
            coverage_status = "unavailable"
            record_count = None

        month_rows.append({
            "month": month_begin.strftime("%Y-%m"),
            "label": month_begin.strftime("%b"),
            "count": record_count,
            "coverage_status": coverage_status,
            "month_over_month_change_pct": None,
        })

    for index in range(1, len(month_rows)):
        current = month_rows[index]
        previous = month_rows[index - 1]
        if (
            current["coverage_status"] == "complete"
            and previous["coverage_status"] == "complete"
            and previous["count"] > 0
        ):
            current["month_over_month_change_pct"] = round(
                (current["count"] - previous["count"]) / previous["count"] * 100,
                2,
            )

    return {
        "data_mode": "synthetic_research_data",
        "metric": metric,
        "location_id": location_id,
        "year": year,
        "coverage_start": coverage["start"].isoformat(),
        "coverage_end": coverage["end"].isoformat(),
        "available_years": list(range(coverage["start"].year, coverage["end"].year + 1)),
        "months": month_rows,
        "note": "Counts use distinct notification/complaint IDs. Zero means complete source coverage with no matching records; unavailable means the source has no complete coverage for that month.",
    }
