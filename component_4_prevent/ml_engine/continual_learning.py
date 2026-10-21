# Continual learning module for retrain loop based on feedback outcomes
# Single source of truth for all SQLite DB operations.

import sqlite3
import os

DB_NAME = "interventions.db"
BENCHMARK_CSV = os.path.join(os.path.dirname(__file__), "../data/benchmark/phi_intervention_benchmark.csv")

# ─── Schema ────────────────────────────────────────────────────────────────────
# Standardised on ONE table: intervention_outcomes
# Used by:
#   • init_db()             – startup table creation
#   • save_new_intervention() – /record-intervention endpoint
#   • get_all_outcomes_df() – /retrain-model endpoint
# ────────────────────────────────────────────────────────────────────────────────

_CREATE_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS intervention_outcomes (
        id                         INTEGER PRIMARY KEY AUTOINCREMENT,
        temperature                REAL    NOT NULL,
        rainfall                   REAL    NOT NULL,
        cumulative_rainfall_14_days REAL   NOT NULL,
        mosquito_density           REAL    NOT NULL,
        breeding_sites_count       INTEGER NOT NULL,
        wind_speed                 REAL    NOT NULL,
        intervention_taken         TEXT    NOT NULL,
        effectiveness_score        REAL    NOT NULL,
        timestamp                  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
"""

_INSERT_SQL = """
    INSERT INTO intervention_outcomes (
        temperature, rainfall, cumulative_rainfall_14_days,
        mosquito_density, breeding_sites_count, wind_speed,
        intervention_taken, effectiveness_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
"""

_SELECT_SQL = """
    SELECT
        temperature, rainfall, cumulative_rainfall_14_days,
        mosquito_density, breeding_sites_count, wind_speed,
        intervention_taken, effectiveness_score
    FROM intervention_outcomes
"""

def init_db():
    """Create the intervention_outcomes table if it does not exist."""
    conn = sqlite3.connect(DB_NAME)
    try:
        conn.execute(_CREATE_TABLE_SQL)
        conn.commit()
        print("[CL] Database initialised: intervention_outcomes table ready.")
    finally:
        conn.close()


def save_new_intervention(record) -> None:
    """
    Persist a validated InterventionRecord (Pydantic model) to SQLite.
    Uses parameterised query to prevent SQL injection.
    """
    conn = sqlite3.connect(DB_NAME)
    try:
        conn.execute(_INSERT_SQL, (
            record.temperature,
            record.rainfall,
            record.cumulative_rainfall_14_days,
            record.mosquito_density,
            record.breeding_sites_count,
            record.wind_speed,
            record.intervention_taken,
            record.effectiveness_score,
        ))
        conn.commit()
    finally:
        conn.close()


def get_row_count() -> int:
    """Return total number of filed intervention records."""
    conn = sqlite3.connect(DB_NAME)
    try:
        row = conn.execute("SELECT COUNT(*) FROM intervention_outcomes").fetchone()
        return row[0] if row else 0
    finally:
        conn.close()