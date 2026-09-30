import sys
from pathlib import Path

# Add component root to path so Python can find our internal packages
sys.path.append(str(Path(__file__).resolve().parents[1]))

from hal.dht22_driver import read_dht22
from hal.gps_driver import get_location
from hal.camera_driver import capture_frame
from core.weather_api import fetch_rainfall
from core.schemas import TelemetryRecord, DetectedObjects
from core.db_manager import initialize_schema, insert_telemetry

def run_synthetic_pipeline():
    print("--- Starting Component 1 Data Pipeline Test ---")
    
    # 1. Make sure the SQLite table exists
    initialize_schema()
    
    # 2. Read local sensors and GPS
    temp, hum = read_dht22()
    lat, lon = get_location()
    print(f"[Sensors] Temp: {temp}°C | Humidity: {hum}% | GPS: ({lat}, {lon})")
    
    # 3. Fetch external rainfall using our GPS coordinates
    rainfall = fetch_rainfall(lat, lon)
    print(f"[Weather API] Recent Rainfall: {rainfall} mm")
    
    # 4. Capture a camera frame for YOLO
    frame = capture_frame()
    print(f"[Camera] Captured image frame with shape: {frame.shape}")
    
    # 5. Package everything into our validated Pydantic schema
    # (Using placeholder AI outputs until we hook up the AI modules next)
    sample_objects = DetectedObjects(tyre=2, coco_shell=4, bottle=1)
    
    record = TelemetryRecord(
        latitude=lat,
        longitude=lon,
        temperature=temp,
        humidity=hum,
        rainfall_mm=rainfall,
        objects=sample_objects
    )
    
    # 6. Save to local SQLite database
    insert_telemetry(record)
    print("[Database] Record successfully validated and saved to dengue_edge.db!")

if __name__ == "__main__":
    run_synthetic_pipeline()