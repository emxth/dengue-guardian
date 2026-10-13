# Continual learning module for retrain loop based on feedback outcomes

import sqlite3

DB_NAME = "interventions.db"

def init_db():
    # Initialize the SQLite database and create the table if it does not exist
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS intervention_outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            temperature REAL,
            rainfall REAL,
            cumulative_rainfall_14_days REAL,
            mosquito_density REAL,
            breeding_sites_count INTEGER,
            wind_speed REAL,
            intervention_taken TEXT,
            effectiveness_score REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()
    print("Database initialized successfully.")

def save_new_intervention(data):
    # Insert the new intervention outcome into the database
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO intervention_outcomes 
        (temperature, rainfall, cumulative_rainfall_14_days, mosquito_density, 
         breeding_sites_count, wind_speed, intervention_taken, effectiveness_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.temperature, data.rainfall, data.cumulative_rainfall_14_days, 
        data.mosquito_density, data.breeding_sites_count, data.wind_speed, 
        data.intervention_taken, data.effectiveness_score
    ))
    conn.commit()
    conn.close()