# Preprocessing module

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
import joblib
import os

def load_and_preprocess_data(filepath):
    df = pd.read_csv(filepath)
    
    # Separate features (X) and target (y)
    X = df.drop('effectiveness_score', axis=1)
    y = df['effectiveness_score']
    
    # Define categorical and numerical columns
    categorical_cols = ['tier_1_macro', 'tier_2_micro']
    numerical_cols = ['temperature', 'rainfall', 'mosquito_density', 'breeding_sites_count']
    
    # Create the preprocessing pipeline
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), numerical_cols),
            ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_cols)
        ])
    
    # Split the data first to avoid data leakage
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Fit on training data, transform both
    X_train_processed = preprocessor.fit_transform(X_train)
    X_test_processed = preprocessor.transform(X_test)
    
    # Save the preprocessor to scale future API inputs
    os.makedirs('saved_models', exist_ok=True)
    joblib.dump(preprocessor, 'saved_models/preprocessor.pkl')
    
    return X_train_processed, X_test_processed, y_train, y_test

if __name__ == "__main__":
    X_train, X_test, y_train, y_test = load_and_preprocess_data('../data/synthetic/phi_intervention_benchmark.csv')
    print(f"Preprocessing complete. Training shape: {X_train.shape}")