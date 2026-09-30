"""
Central configuration module for Component 1: Edge AI System.
Controls environment switching, sensor polling parameters, and storage paths.
"""

import os
from pathlib import Path

# Base Directory Paths
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

# Ensure runtime directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Hardware Abstraction Mode
# Set to True when developing on non-Raspberry Pi environments (e.g., development laptop)
# Set to False when deploying to the physical Raspberry Pi 4
MOCK_HARDWARE = os.getenv("MOCK_HARDWARE", "True").lower() in ("true", "1")

# Database Configuration
DATABASE_PATH = DATA_DIR / "dengue_edge.db"

# Sensor Polling Intervals (in seconds)
DHT_READ_INTERVAL = 30.0
GPS_READ_INTERVAL = 5.0
CAMERA_CAPTURE_INTERVAL = 60.0

# Geographic Baseline (Kaduwela MOH Administrative Area Bounds)
DEFAULT_LATITUDE = 6.9271
DEFAULT_LONGITUDE = 79.9612

# External Weather API Configuration
WEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather"