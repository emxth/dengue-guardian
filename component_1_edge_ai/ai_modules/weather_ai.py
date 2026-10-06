import time
import numpy as np
import joblib
from config import MODELS_DIR


class WeatherAIEngine:
    """
    Edge inference wrapper for Module 1 (Weather AI).
    Evaluates temperature, humidity, and rainfall to output an 
    Environmental Suitability / Weather Risk score between 0.0 and 1.0.
    """
    def __init__(self):
        self.model_path = MODELS_DIR / "weather_model.joblib"
        self.model = None
        self._load_model()

    def _load_model(self):
        """Loads the serialized scikit-learn regression model from /models."""
        if self.model_path.exists():
            self.model = joblib.load(self.model_path)
            print(f"[Weather AI] Loaded trained model: {self.model_path.name}")
        else:
            print(
                "[Weather AI Warning] weather_model.joblib not found in /models. "
                "Run 'python ai_modules/train_weather_ai.py' first!"
            )
            self.model = None

    def predict_suitability(
        self, temperature: float, humidity: float, rainfall_mm: float
    ) -> tuple[float, float]:
        """
        Predicts microclimatic environmental suitability for mosquito breeding.

        Args:
            temperature: Ambient temperature in Celsius (from DHT22).
            humidity: Relative humidity percentage (from DHT22).
            rainfall_mm: Recent precipitation in mm (from Weather API).

        Returns:
            tuple: (weather_risk_score [0.0 - 1.0], inference_latency_ms)
        """
        if self.model is None:
            return 0.0, 0.0

        start_time = time.perf_counter()

        # Format features as a 2D numpy array: [[temperature, humidity, rainfall_mm]]
        features = np.array([[temperature, humidity, rainfall_mm]], dtype=np.float64)
        raw_prediction = float(self.model.predict(features)[0])

        # Clamp score strictly between 0.0 and 1.0 to satisfy Pydantic schema rules
        weather_risk_score = round(float(np.clip(raw_prediction, 0.0, 1.0)), 4)
        latency_ms = round((time.perf_counter() - start_time) * 1000, 3)

        return weather_risk_score, latency_ms