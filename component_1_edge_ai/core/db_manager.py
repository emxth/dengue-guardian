import sqlite3
import json
from pathlib import Path
from config import DATABASE_PATH
from core.schemas import TelemetryRecord

def get_connection():
    """Establish a connection to the SQLite database using WAL mode for edge safety."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def initialize_schema():
    """Create the telemetry table if it does not exist."""
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
    """Insert a validated Pydantic telemetry record into the SQLite database."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Serialize the nested object counts to a JSON string for storage
    objects_json = record.objects.model_dump_json()
    
    cursor.execute("""
        INSERT INTO telemetry_logs (
            timestamp, latitude, longitude, temperature, humidity, 
            rainfall_mm, weather_risk_score, object_counts, 
            environmental_breeding_risk, risk_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        record.timestamp.isoformat(), record.latitude, record.longitude,
        record.temperature, record.humidity, record.rainfall_mm,
        record.weather_risk_score, objects_json,
        record.environmental_breeding_risk, record.risk_level
    ))
    
    conn.commit()
    conn.close()