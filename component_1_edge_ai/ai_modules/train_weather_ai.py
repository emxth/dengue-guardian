import sys
from pathlib import Path
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score

# Allow importing paths from component_1_edge_ai root
sys.path.append(str(Path(__file__).resolve().parents[1]))
from config import MODELS_DIR, DATA_DIR


def compute_entomological_suitability(temp: np.ndarray, hum: np.ndarray, rain: np.ndarray) -> np.ndarray:
    """
    Calculates non-linear environmental breeding suitability [0.0 - 1.0]
    calibrated to Aedes physiological thresholds reported in Sri Lankan literature
    (Papers [5], [6], [11], [15]).
    """
    # 1. Thermal performance curve: peaks around 28.5°C, drops off below 20°C and above 35°C
    temp_score = np.exp(-0.5 * ((temp - 28.5) / 3.8) ** 2)

    # 2. Humidity response: sigmoid rise centered at 72% RH (desiccation below 55% RH)
    hum_score = 1.0 / (1.0 + np.exp(-0.18 * (hum - 72.0)))

    # 3. Rainfall accumulation vs larval flushing curve:
    # Optimal container filling between 5mm and 35mm; washout penalty above 60mm
    rain_fill = 1.0 - np.exp(-rain / 10.0)
    rain_flush_penalty = np.where(rain > 55.0, np.exp(-(rain - 55.0) / 35.0), 1.0)
    rain_score = 0.25 + (0.75 * rain_fill * rain_flush_penalty)

    # Combine microclimatic interactions with realistic biological sensor noise
    raw_suitability = (0.40 * temp_score) + (0.35 * hum_score) + (0.25 * rain_score)
    noise = np.random.normal(0, 0.025, size= len(temp))
    
    return np.clip(raw_suitability + noise, 0.0, 1.0)


def generate_calibrated_dataset(n_samples: int = 1500):
    """
    Generates microclimatic observations across Sri Lankan dry, inter-monsoon,
    and monsoon weather regimes.
    """
    np.random.seed(42)

    # Temperature (°C): spans cool rainy nights (22°C) to extreme hot afternoons (37°C)
    temperature = np.random.uniform(22.0, 37.0, n_samples)
    # Relative Humidity (%): spans dry spells (45%) to saturated monsoon conditions (98%)
    humidity = np.random.uniform(45.0, 98.0, n_samples)
    # Rainfall (mm): exponential distribution (many dry/light days, occasional heavy downpours)
    rainfall = np.random.exponential(scale=14.0, size=n_samples)
    rainfall = np.clip(rainfall, 0.0, 100.0)

    X = np.column_stack([temperature, humidity, rainfall])
    y = compute_entomological_suitability(temperature, humidity, rainfall)

    return X, y


def train_and_evaluate():
    print("--- Phase 3: Weather AI Model Training & Comparative Evaluation ---")

    X, y = generate_calibrated_dataset(n_samples=1500)
    print(f"[Dataset] Generated {len(X)} calibrated microclimatic records (Features: Temp, Humidity, Rainfall).")

    # Split into 70% Train, 15% Validation, 15% Unseen Test
    X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.30, random_state=42)
    X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.50, random_state=42)
    print(f"[Splits] Train: {len(X_train)} | Validation: {len(X_val)} | Unseen Test: {len(X_test)}\n")

    # Define candidate lightweight tabular models suitable for Raspberry Pi 4
    candidates = {
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            min_samples_leaf=4,
            random_state=42,
            n_jobs=-1
        ),
        "HistGradientBoostingRegressor": HistGradientBoostingRegressor(
            max_iter=120,
            max_depth=6,
            learning_rate=0.08,
            random_state=42
        )
    }

    best_model = None
    best_name = ""
    best_rmse = float("inf")

    # Train and evaluate each candidate on the unseen test split
    for name, model in candidates.items():
        model.fit(X_train, y_train)
        preds = model.predict(X_test)

        mae = mean_absolute_error(y_test, preds)
        rmse = root_mean_squared_error(y_test, preds)
        r2 = r2_score(y_test, preds)

        print(f"Model: {name}")
        print(f"  -> Test MAE : {mae:.4f}")
        print(f"  -> Test RMSE: {rmse:.4f}")
        print(f"  -> Test R²  : {r2:.4f}\n")

        if rmse < best_rmse:
            best_rmse = rmse
            best_model = model
            best_name = name

    # Save the winning model artifact for edge inference
    model_save_path = MODELS_DIR / "weather_model.joblib"
    joblib.dump(best_model, model_save_path)
    print(f"[Winner] Selected '{best_name}' (Lowest RMSE: {best_rmse:.4f})")
    print(f"[Saved] Serialized model saved to: {model_save_path}")


if __name__ == "__main__":
    train_and_evaluate()