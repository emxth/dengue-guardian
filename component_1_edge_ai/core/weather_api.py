import random
import requests
from config import WEATHER_API_KEY, WEATHER_API_URL, MOCK_HARDWARE

def fetch_rainfall(lat: float, lon: float) -> float:
    """
    Fetches recent rainfall (in mm) for the given GPS coordinates.
    Falls back to simulated values if offline or if no API key is set.
    """
    # If wehaven't added a real API key yet, return a realistic mock rainfall value
    if not WEATHER_API_KEY or WEATHER_API_KEY == "":
        if MOCK_HARDWARE:
            # Simulate typical rainfall (mostly light/none, occasional heavy shower)
            return round(random.choice([0.0, 0.0, 2.5, 8.4, 15.2]), 1)
        return 0.0

    try:
        params = {
            "lat": lat,
            "lon": lon,
            "appid": WEATHER_API_KEY,
            "units": "metric"
        }
        # Keep timeout short (5s) so slow internet doesn't freeze the main edge loop
        response = requests.get(WEATHER_API_URL, params=params, timeout=5.0)
        response.raise_for_status()
        data = response.json()

        # OpenWeatherMap only includes the 'rain' key if it actually rained recently
        if "rain" in data:
            # Grab 1-hour rainfall if available, otherwise 3-hour, default to 0.0
            return float(data["rain"].get("1h", data["rain"].get("3h", 0.0)))
        return 0.0

    except requests.RequestException as e:
        # Log the warning and return 0.0 instead of crashing the system
        print(f"[Warning] Weather API unreachable ({e}). Defaulting rainfall to 0.0mm.")
        return 0.0