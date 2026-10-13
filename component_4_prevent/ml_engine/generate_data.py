import sqlite3
import random
import os

def generate_synthetic_data(num_records=1000):
    # Delete old DB if exists to start fresh with the correct 0-100 scale
    if os.path.exists("interventions.db"):
        os.remove("interventions.db")
        
    conn = sqlite3.connect("interventions.db")
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
    
    strategies = [
        "Source Reduction - None",
        "Larviciding - Temephos (Abate)",
        "Adulticiding (Fogging) - Malathion",
        "Adulticiding (Fogging) - Deltamethrin"
    ]
    
    records_added = 0
    
    for _ in range(num_records):
        temp = round(random.uniform(24.0, 32.0), 1)
        rain = round(random.uniform(0.0, 150.0), 1)
        cum_rain = round(rain + random.uniform(0.0, 200.0), 1)
        density = round(random.uniform(10.0, 100.0), 1)
        sites = random.randint(0, 50)
        wind = round(random.uniform(0.0, 25.0), 1)
        
        intervention = random.choice(strategies)
        
        # Corrected: Using 0-100 percentage scale
        score = 40.0 
        
        if "Source Reduction" in intervention:
            if sites > 15 and cum_rain < 50:
                score = random.uniform(85.0, 98.0) 
            elif sites > 10:
                score = random.uniform(65.0, 80.0) 
                
        elif "Adulticiding" in intervention:
            if density > 60:
                if wind < 15:
                    score = random.uniform(85.0, 98.0) 
                else:
                    score = random.uniform(50.0, 65.0) 
            else:
                score = random.uniform(40.0, 60.0)
                
        elif "Larviciding" in intervention:
            if sites > 10 and cum_rain > 20:
                score = random.uniform(80.0, 95.0)
            else:
                score = random.uniform(45.0, 60.0)
        
        score = round(score, 2)
        
        cursor.execute('''
            INSERT INTO intervention_outcomes 
            (temperature, rainfall, cumulative_rainfall_14_days, mosquito_density, 
             breeding_sites_count, wind_speed, intervention_taken, effectiveness_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (temp, rain, cum_rain, density, sites, wind, intervention, score))
        
        records_added += 1
        
    conn.commit()
    conn.close()
    print(f"Successfully created a fresh DB with {records_added} records on a 0-100 scale!")

if __name__ == "__main__":
    generate_synthetic_data(1000)