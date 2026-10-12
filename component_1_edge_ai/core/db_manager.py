import sqlite3
import json
from typing import Optional, List, Dict, Any
from config import DATABASE_PATH
from core.schemas import TelemetryRecord


def get_connection():
    """Establishes a connection to the local SQLite database with WAL mode enabled."""
    conn = sqlite3.connect(DATABASE_PATH)
    # Row factory allows accessing columns by name like a dictionary, making API conversion easier
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def initialize_schema():
    """Creates the telemetry_logs table if it does not already exist."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS telemetry_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            temperature REAL NOT NULL,
            humidity REAL NOT NULL,
            rainfall_mm REAL NOT NULL,
            weather_risk_score REAL NOT NULL,
            object_counts TEXT NOT NULL,
            environmental_breeding_risk REAL NOT NULL,
            risk_level TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def insert_telemetry(record: TelemetryRecord):
    """Inserts a validated Pydantic telemetry record into the SQLite database."""
    conn = get_connection()
    cursor = conn.cursor()

    # Convert the nested Pydantic model into a JSON string for flat storage
    objects_json = record.objects.model_dump_json()

    cursor.execute("""
        INSERT INTO telemetry_logs (
            timestamp, latitude, longitude, temperature, humidity, 
            rainfall_mm, weather_risk_score, object_counts, 
            environmental_breeding_risk, risk_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        record.timestamp.isoformat(),
        record.latitude,
        record.longitude,
        record.temperature,
        record.humidity,
        record.rainfall_mm,
        record.weather_risk_score,
        objects_json,
        record.environmental_breeding_risk,
        record.risk_level
    ))

    conn.commit()
    conn.close()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Helper function to format a raw database row into a clean REST API dictionary."""
    return {
        "id": row["id"],
        "timestamp": row["timestamp"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "temperature": row["temperature"],
        "humidity": row["humidity"],
        "rainfall_mm": row["rainfall_mm"],
        "weather_risk_score": row["weather_risk_score"],
        "objects": json.loads(row["object_counts"]),  # Rehydrate JSON string back into a dict
        "environmental_breeding_risk": row["environmental_breeding_risk"],
        "risk_level": row["risk_level"]
    }


def fetch_latest_telemetry() -> Optional[Dict[str, Any]]:
    """Retrieves the most recent telemetry and risk assessment record for the dashboard."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM telemetry_logs ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return None
    return _row_to_dict(row)


def fetch_telemetry_history(limit: int = 20) -> List[Dict[str, Any]]:
    """Retrieves the most recent N telemetry records for historical plotting."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM telemetry_logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()

    return [_row_to_dict(r) for r in rows]