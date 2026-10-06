import sys
from pathlib import Path

# Allow importing from component_1_edge_ai root
sys.path.append(str(Path(__file__).resolve().parents[1]))

from hal.camera_driver import capture_frame
from ai_modules.yolo_vision import YOLOVisionEngine
from ai_modules.weather_ai import WeatherAIEngine
from ai_modules.risk_fusion import DecisionFusionEngine
from core.schemas import TelemetryRecord, DetectedObjects
from core.db_manager import initialize_schema, insert_telemetry


def test_full_fusion_pipeline():
    print("===================================================================")
    print("--- Testing Full Multi-Modal AI Pipeline & Baseline Ablation ---")
    print("===================================================================\n")

    # 1. Initialize all three AI engines
    yolo_engine = YOLOVisionEngine(conf_threshold=0.45)
    weather_engine = WeatherAIEngine()
    fusion_engine = DecisionFusionEngine()

    # 2. Acquire camera frame and run YOLO inference
    frame = capture_frame()
    detected_objects, yolo_latency_ms = yolo_engine.detect_and_count(frame)
    print(f"[Module 2 - YOLO Vision] Output: {detected_objects.model_dump()} (Latency: {yolo_latency_ms} ms)")

    # 3. Simulate localized environmental readings (Kaduwela post-rain afternoon)
    test_temp = 29.2
    test_hum = 83.5
    test_rain = 18.0
    weather_score, weather_latency_ms = weather_engine.predict_suitability(test_temp, test_hum, test_rain)
    print(f"[Module 1 - Weather AI ] Suitability Score: {weather_score:.4f} (Latency: {weather_latency_ms} ms)\n")

    # 4. Run Baseline & Proposed Comparative Evaluations (Core Research Experiment)
    print("--- Comparative Baseline Evaluation ---")
    risk_weather_only, level_w, _ = fusion_engine.evaluate_risk(weather_score, detected_objects, mode="weather_only")
    risk_visual_only, level_v, _ = fusion_engine.evaluate_risk(weather_score, detected_objects, mode="visual_only")
    risk_fusion, level_f, fusion_latency_ms = fusion_engine.evaluate_risk(weather_score, detected_objects, mode="fusion")

    print(f"  [Baseline 1 - Weather-Only] Risk Score: {risk_weather_only:.4f} | Tier: {level_w}")
    print(f"  [Baseline 2 - Visual-Only ] Risk Score: {risk_visual_only:.4f} | Tier: {level_v}")
    print(f"  [Proposed   - Fusion Engine] Risk Score: {risk_fusion:.4f} | Tier: {level_f} (Latency: {fusion_latency_ms} ms)\n")

    # 5. Package full telemetry into Pydantic schema and persist to SQLite
    record = TelemetryRecord(
        latitude=6.927150,
        longitude=79.961220,
        temperature=test_temp,
        humidity=test_hum,
        rainfall_mm=test_rain,
        weather_risk_score=weather_score,
        objects=detected_objects,
        environmental_breeding_risk=risk_fusion,
        risk_level=level_f
    )

    initialize_schema()
    insert_telemetry(record)
    print("[Database] Fused multi-modal telemetry successfully saved to dengue_edge.db!")


if __name__ == "__main__":
    test_full_fusion_pipeline()