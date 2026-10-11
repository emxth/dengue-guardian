# Context-aware recommendation logic

import joblib
import numpy as np
import pandas as pd
import os

MODEL_PATH = os.path.join(os.path.dirname(__file__), "saved_models", "baseline_regressor.pkl")
PREPROCESSOR_PATH = os.path.join(os.path.dirname(__file__), "saved_models", "preprocessor.pkl")

# Candidate combinations for simulation
CANDIDATE_STRATEGIES = [
    {"macro": "Source Reduction", "micro": "None"},
    {"macro": "Larviciding", "micro": "Temephos (Abate)"},
    {"macro": "Adulticiding (Fogging)", "micro": "Malathion"},
    {"macro": "Adulticiding (Fogging)", "micro": "Deltamethrin"}
]

class RecommendationEngine:
    def __init__(self):
        self.model = joblib.load(MODEL_PATH)
        self.preprocessor = joblib.load(PREPROCESSOR_PATH)

    def evaluate_candidates(self, context: dict):
        """
        context format:
        {
            "temperature": float,
            "rainfall": float,
            "mosquito_density": float,
            "breeding_sites_count": int,
            "wind_speed": float (optional, default 8.0)
        }
        """
        records = []
        for strat in CANDIDATE_STRATEGIES:
            records.append({
                "temperature": context["temperature"],
                "rainfall": context["rainfall"],
                "mosquito_density": context["mosquito_density"],
                "breeding_sites_count": context["breeding_sites_count"],
                "tier_1_macro": strat["macro"],
                "tier_2_micro": strat["micro"]
            })

        candidate_df = pd.DataFrame(records)
        X_processed = self.preprocessor.transform(candidate_df)
        predicted_scores = self.model.predict(X_processed)

        results = []
        for idx, strat in enumerate(CANDIDATE_STRATEGIES):
            results.append({
                "macro_strategy": strat["macro"],
                "micro_strategy": strat["micro"],
                "predicted_effectiveness": round(float(predicted_scores[idx]), 2)
            })

        # Sort by predicted effectiveness descending
        results = sorted(results, key=lambda x: x["predicted_effectiveness"], reverse=True)
        return results

    def get_recommendation(self, context: dict):
        evaluated = self.evaluate_candidates(context)
        top_choice = evaluated[0]

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
            f"under {context['rainfall']}mm rainfall and {context['breeding_sites_count']} active sites."
        )

        return {
            "top_recommendation": {
                "tier_1_macro": top_choice["macro_strategy"],
                "tier_2_micro": chemical_name,
                "application_method": application_method,
                "predicted_effectiveness": top_choice["predicted_effectiveness"],
                "rationale": explanation_summary
            },
            "ranked_alternatives": evaluated
        }

if __name__ == "__main__":
    engine = RecommendationEngine()
    sample_context = {
        "temperature": 29.5,
        "rainfall": 85.0,
        "mosquito_density": 45.0,
        "breeding_sites_count": 28,
        "wind_speed": 10.0
    }
    rec = engine.get_recommendation(sample_context)
    print("Recommendation Output:")
    print(rec)
