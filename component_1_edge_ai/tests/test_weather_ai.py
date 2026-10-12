import sys
from pathlib import Path

# Allow importing from component_1_edge_ai root
sys.path.append(str(Path(__file__).resolve().parents[1]))

from ai_modules.weather_ai import WeatherAIEngine


def test_weather_scenarios():
    print("--- Testing Component 1 Weather AI Engine ---")
    engine = WeatherAIEngine()

    scenarios = [
        {"name": "1. Optimal Tropical Post-Rain (High Suitability)", "temp": 28.8, "hum": 84.0, "rain": 16.5},
        {"name": "2. Hot & Dry Afternoon (Low Suitability)", "temp": 35.5, "hum": 48.0, "rain": 0.0},
        {"name": "3. Heavy Monsoon Washout (Moderate Suitability)", "temp": 25.0, "hum": 92.0, "rain": 85.0},
    ]

    for s in scenarios:
        score, latency_ms = engine.predict_suitability(s["temp"], s["hum"], s["rain"])
        print(
            f"{s['name']}\n"
            f"   Inputs  -> Temp: {s['temp']}°C | Humidity: {s['hum']}% | Rain: {s['rain']}mm\n"
            f"   Output  -> Weather Risk Score: {score:.4f} (Latency: {latency_ms} ms)\n"
        )


if __name__ == "__main__":
    test_weather_scenarios()