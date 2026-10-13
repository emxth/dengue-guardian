# Context-aware recommendation logic (XGBoost Integration)

import joblib
import pandas as pd
import xgboost as xgb
import os

MODEL_PATH = os.path.join(os.path.dirname(__file__), "saved_models", "xgboost_dengue_model.json")
FEATURES_PATH = os.path.join(os.path.dirname(__file__), "saved_models", "model_features.pkl")

# Candidate combinations for simulation
CANDIDATE_STRATEGIES = [
    {"macro": "Source Reduction", "micro": "None"},
    {"macro": "Larviciding", "micro": "Temephos (Abate)"},
    {"macro": "Adulticiding (Fogging)", "micro": "Malathion"},
    {"macro": "Adulticiding (Fogging)", "micro": "Deltamethrin"}
]

class RecommendationEngine:
    def __init__(self):
        # Load the XGBoost model
        self.model = xgb.XGBRegressor()
        self.model.load_model(MODEL_PATH)
        # Load the exact feature columns the model expects
        self.feature_columns = joblib.load(FEATURES_PATH)

    def evaluate_candidates(self, context: dict):
        base_df = pd.DataFrame([context])
        results = []
        
        for strat in CANDIDATE_STRATEGIES:
            test_case = base_df.copy()
            
            # Map interventions to the one-hot encoded columns XGBoost expects
            test_case['tier_1_macro_Adulticiding (Fogging)'] = 1 if strat['macro'] == 'Adulticiding (Fogging)' else 0
            test_case['tier_1_macro_Larviciding'] = 1 if strat['macro'] == 'Larviciding' else 0
            test_case['tier_1_macro_Source Reduction'] = 1 if strat['macro'] == 'Source Reduction' else 0
            
            test_case['tier_2_micro_Deltamethrin'] = 1 if strat['micro'] == 'Deltamethrin' else 0
            test_case['tier_2_micro_Malathion'] = 1 if strat['micro'] == 'Malathion' else 0
            test_case['tier_2_micro_None'] = 1 if strat['micro'] == 'None' else 0
            test_case['tier_2_micro_Temephos (Abate)'] = 1 if strat['micro'] == 'Temephos (Abate)' else 0
            
            # Ensure columns perfectly match training data order
            for col in self.feature_columns:
                if col not in test_case.columns:
                    test_case[col] = 0
            test_case = test_case[self.feature_columns]
            
            # Predict effectiveness score
            predicted_score = self.model.predict(test_case)[0]
            
            results.append({
                "macro_strategy": strat["macro"],
                "micro_strategy": strat["micro"],
                "predicted_effectiveness": round(float(predicted_score), 2)
            })

        # Sort by predicted effectiveness descending
        results = sorted(results, key=lambda x: x["predicted_effectiveness"], reverse=True)
        return results

    def compute_feature_contributions(self, context: dict, top_choice: dict):
        base_df = pd.DataFrame([context])
        for col in self.feature_columns:
            if col not in base_df.columns:
                base_df[col] = 0
        base_df[f"tier_1_macro_{top_choice['macro_strategy']}"] = 1
        base_df[f"tier_2_micro_{top_choice['micro_strategy']}"] = 1
        test_case = base_df[self.feature_columns]

        contribs = self.model.get_booster().predict(xgb.DMatrix(test_case), pred_contribs=True)[0]

        feature_labels = {
            'rainfall': f"7-Day Rain ({context.get('rainfall', 0)}mm)",
            'cumulative_rainfall_14_days': f"14-Day Cumulative Rain ({context.get('cumulative_rainfall_14_days', 0)}mm)",
            'mosquito_density': f"Mosquito Density ({context.get('mosquito_density', 0)})",
            'breeding_sites_count': f"Breeding Sites ({context.get('breeding_sites_count', 0)})",
            'temperature': f"Temperature ({context.get('temperature', 0)}°C)",
            'wind_speed': f"Wind Speed ({context.get('wind_speed', 0)} km/h)"
        }

        contributions = []
        for col, val in zip(self.feature_columns, contribs):
            if col in feature_labels:
                contributions.append({
                    "feature": feature_labels[col],
                    "raw_feature": col,
                    "impact": round(float(val), 2)
                })

        # Sort by absolute impact descending
        contributions.sort(key=lambda x: abs(x["impact"]), reverse=True)
        return contributions

    def get_recommendation(self, context: dict):
        evaluated = self.evaluate_candidates(context)
        top_choice = evaluated[0]

        # Compute native XGBoost Tree SHAP feature contributions for the selected strategy
        feature_contributions = self.compute_feature_contributions(context, top_choice)

        # Tier-2 Micro Application Refinement (Thermal Fogging vs ULV Cold Fogging)
        application_method = "Manual Physical Action"
        chemical_name = top_choice["micro_strategy"]
        
        if top_choice["macro_strategy"] == "Adulticiding (Fogging)":
            wind = context.get("wind_speed", 10.0)
            if wind > 15.0:
                application_method = "Indoor ULV Cold Fogging (High wind renders outdoor fogging ineffective)"
            else:
                application_method = "Outdoor Thermal Fogging (Dense canopy penetration)"
        elif top_choice["macro_strategy"] == "Larviciding":
            application_method = "Direct Application into Stagnant Water / Drains"

        explanation_summary = (
            f"Rank #1 strategy '{top_choice['macro_strategy']}' selected with predicted {top_choice['predicted_effectiveness']}% effectiveness "
            f"under {context['cumulative_rainfall_14_days']}mm cumulative rainfall and {context['breeding_sites_count']} active sites."
        )

        return {
            "top_recommendation": {
                "tier_1_macro": top_choice["macro_strategy"],
                "tier_2_micro": chemical_name,
                "application_method": application_method,
                "predicted_effectiveness": top_choice["predicted_effectiveness"],
                "rationale": explanation_summary
            },
            "ranked_alternatives": evaluated,
            "feature_importance": feature_contributions
        }

if __name__ == "__main__":
    engine = RecommendationEngine()
    sample_context = {
        "temperature": 29.5,
        "rainfall": 85.0,
        "cumulative_rainfall_14_days": 210.5,
        "mosquito_density": 45.0,
        "breeding_sites_count": 28,
        "wind_speed": 10.0
    }
    rec = engine.get_recommendation(sample_context)
    print("Recommendation Output:")
    print(rec)