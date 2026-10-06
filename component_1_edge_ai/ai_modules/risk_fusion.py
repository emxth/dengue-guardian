import time
import numpy as np
from core.schemas import DetectedObjects

# Literature-backed habitat productivity weights (Papers [4], [6], [7])
# Tires and coconut exocarps exhibit the highest larval positivity in Sri Lankan domestic settings
CONTAINER_WEIGHTS = {
    "tire": 1.00,
    "coconut_exocarp": 0.75,
    "drain_inlet": 0.70,
    "vase": 0.45,
    "bottle": 0.35
}


class DecisionFusionEngine:
    """
    Module 3: Decision Fusion & Risk Engine.
    Fuses microclimatic suitability (Weather AI), visual container detections (YOLO),
    and spatial parameters to compute localized Environmental Breeding Risk.
    """
    def __init__(self):
        # Operational classification thresholds for PHI decision support
        self.threshold_low = 0.35
        self.threshold_high = 0.65

    def compute_visual_risk(self, objects: DetectedObjects) -> float:
        """
        Calculates a normalized visual risk score [0.0 - 1.0] from detected containers
        using entomologically calibrated habitat weights.
        """
        raw_weighted_sum = (
            (objects.tire * CONTAINER_WEIGHTS["tire"]) +
            (objects.coconut_exocarp * CONTAINER_WEIGHTS["coconut_exocarp"]) +
            (objects.drain_inlet * CONTAINER_WEIGHTS["drain_inlet"]) +
            (objects.vase * CONTAINER_WEIGHTS["vase"]) +
            (objects.bottle * CONTAINER_WEIGHTS["bottle"])
        )

        # Exponential saturation function: scales smoothly between 0.0 and 1.0
        # A weighted sum of ~4.0 reaches ~0.63 risk; ~8.0 reaches ~0.86 risk
        visual_risk = 1.0 - np.exp(-raw_weighted_sum / 4.0)
        return float(np.clip(visual_risk, 0.0, 1.0))

    def evaluate_risk(
        self,
        weather_risk_score: float,
        objects: DetectedObjects,
        mode: str = "fusion"
    ) -> tuple[float, str, float]:
        """
        Computes the final Environmental Breeding Risk and categorical risk level.

        Args:
            weather_risk_score: Output from Module 1 (Weather AI) [0.0 - 1.0].
            objects: Detected container counts from Module 2 (YOLO).
            mode: 'fusion' (proposed system), 'weather_only' (Baseline 1), or 'visual_only' (Baseline 2).

        Returns:
            tuple: (environmental_breeding_risk [0.0 - 1.0], risk_level [Low/Medium/High], latency_ms)
        """
        start_time = time.perf_counter()
        visual_risk = self.compute_visual_risk(objects)

        # Baseline 1: Weather conditions only (ignores visual containers)
        if mode == "weather_only":
            final_risk = weather_risk_score

        # Baseline 2: Visual container detections only (ignores microclimate)
        elif mode == "visual_only":
            final_risk = visual_risk

        # Proposed System: Multi-Modal Decision Fusion
        elif mode == "fusion":
            # Synergistic interaction: high risk occurs when suitable weather coexists with breeding vessels
            interaction_term = weather_risk_score * visual_risk
            final_risk = (0.50 * interaction_term) + (0.35 * visual_risk) + (0.15 * weather_risk_score)

        else:
            raise ValueError(f"Unknown evaluation mode: '{mode}'. Use 'fusion', 'weather_only', or 'visual_only'.")

        final_risk = round(float(np.clip(final_risk, 0.0, 1.0)), 4)

        # Assign operational risk tier for PHI field prioritization
        if final_risk < self.threshold_low:
            risk_level = "Low"
        elif final_risk < self.threshold_high:
            risk_level = "Medium"
        else:
            risk_level = "High"

        latency_ms = round((time.perf_counter() - start_time) * 1000, 3)
        return final_risk, risk_level, latency_ms