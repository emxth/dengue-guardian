# Model training script for effectiveness score prediction

from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
import numpy as np
import joblib
from preprocess import load_and_preprocess_data

def train_model():
    print("Loading and preprocessing data...")
    X_train, X_test, y_train, y_test = load_and_preprocess_data('../data/synthetic/phi_intervention_benchmark.csv')
    
    print("Training XGBoost Regressor...")
    model = XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=42)
    model.fit(X_train, y_train)
    
    print("Evaluating model...")
    predictions = model.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    rmse = np.sqrt(mean_squared_error(y_test, predictions))
    
    print(f"Model Performance Metrics:")
    print(f"- Mean Absolute Error (MAE): {mae:.2f}")
    print(f"- Root Mean Squared Error (RMSE): {rmse:.2f}")
    
    print("Exporting model...")
    joblib.dump(model, 'saved_models/baseline_regressor.pkl')
    print("Success! Model saved to saved_models/baseline_regressor.pkl")

if __name__ == "__main__":
    train_model()
