import time
import argparse
import threading
import uvicorn

# Added CAMERA_CAPTURE_INTERVAL to import
from config import MOCK_HARDWARE, CAMERA_CAPTURE_INTERVAL
from hal.dht22_driver import read_dht22
from hal.gps_driver import get_location
from hal.camera_driver import capture_frame
from core.weather_api import fetch_rainfall
from core.schemas import TelemetryRecord
from core.db_manager import initialize_schema, insert_telemetry
from core.api_client import app, export_shared_contract
from ai_modules.yolo_vision import YOLOVisionEngine
from ai_modules.weather_ai import WeatherAIEngine
from ai_modules.risk_fusion import DecisionFusionEngine


def start_api_server(host: str = "0.0.0.0", port: int = 8000):
    """Runs the FastAPI telemetry server in a background daemon thread."""
    uvicorn.run(app, host=host, port=port, log_level="warning")


def run_edge_orchestrator(max_cycles: int = 0, interval_sec: float = 10.0):
    """
    Main execution loop for Component 1 on the Raspberry Pi / Edge Node.
    """
    print("======================================================================")
    print("  DENGUE GUARDIAN - COMPONENT 1: EDGE AI RISK ASSESSMENT SYSTEM")
    print(f"  Mode: {'MOCK HARDWARE (Workstation)' if MOCK_HARDWARE else 'PHYSICAL RASPBERRY PI 4'}")
    print("======================================================================\n")

    # 1. Initialize SQLite database and export JSON contract for teammates
    initialize_schema()
    export_shared_contract()

    # 2. Load and warm up all three Edge AI modules immediately to prevent latency spikes
    yolo_engine = YOLOVisionEngine(conf_threshold=0.45)
    weather_engine = WeatherAIEngine()
    fusion_engine = DecisionFusionEngine()

    # 3. Start local FastAPI server in a background thread so it doesn't block the sensing loop
    api_thread = threading.Thread(target=start_api_server, daemon=True)
    api_thread.start()
    print("[API Server] FastAPI running at http://127.0.0.1:8000 (Docs: http://127.0.0.1:8000/docs)\n")

    # State variables for decoupling the camera interval from the main loop
    last_camera_capture_time = 0.0
    cached_detected_objects = None
    cached_yolo_ms = 0.0

    cycle = 0
    try:
        while True:
            cycle += 1
            cycle_start = time.perf_counter()
            current_time = time.time()
            print(f"--- [Edge Cycle #{cycle}] ---")

            # Step A: Acquire local sensor and GPS telemetry via HAL
            temp, hum = read_dht22()
            lat, lon = get_location()
            rainfall = fetch_rainfall(lat, lon)

            # Handle rare sensor dropout gracefully without crashing the edge device
            if temp is None or hum is None:
                print("[Warning] DHT22 read failed this cycle. Retrying next cycle...")
                time.sleep(2.5)
                continue

            # Step B: Module 1 - Weather AI Inference
            weather_score, weather_ms = weather_engine.predict_suitability(temp, hum, rainfall)

            # Step C: Module 2 - Camera Capture & YOLO ONNX Inference
            # Only trigger hardware capture if the config interval (e.g., 600s/10min) has elapsed.
            # Setting last_camera_capture_time=0 initially forces this to run on Cycle 1.
            if current_time - last_camera_capture_time >= CAMERA_CAPTURE_INTERVAL:
                print("  [Vision] Interval reached. Capturing new frame and running YOLO inference...")
                frame = capture_frame()
                cached_detected_objects, cached_yolo_ms = yolo_engine.detect_and_count(frame)
                last_camera_capture_time = current_time
                vision_status = "Fresh Inference"
            else:
                # Reuse the most recent YOLO predictions to save CPU/Battery
                vision_status = "Cached"

            # Step D: Module 3 - Multi-Modal Decision Fusion
            # Fuses live weather telemetry with the cached (or fresh) YOLO object counts
            fused_risk, risk_level, fusion_ms = fusion_engine.evaluate_risk(
                weather_risk_score=weather_score,
                objects=cached_detected_objects,
                mode="fusion"
            )

            # Step E: Validate via Pydantic and store in SQLite
            record = TelemetryRecord(
                latitude=lat,
                longitude=lon,
                temperature=temp,
                humidity=hum,
                rainfall_mm=rainfall,
                weather_risk_score=weather_score,
                objects=cached_detected_objects,
                environmental_breeding_risk=fused_risk,
                risk_level=risk_level
            )
            insert_telemetry(record)

            total_cycle_ms = round((time.perf_counter() - cycle_start) * 1000, 2)

            # Print concise field telemetry log for the PHI / Developer
            print(f"  Location   : ({lat}, {lon})")
            print(f"  Environment: Temp={temp}°C | Humidity={hum}% | Rainfall={rainfall}mm")
            print(f"  Weather AI : Suitability={weather_score:.4f} ({weather_ms} ms)")
            print(f"  YOLO Vision: {cached_detected_objects.model_dump()} ({cached_yolo_ms} ms) [{vision_status}]")
            print(f"  Final Risk : Score={fused_risk:.4f} | Tier=[{risk_level}] (Total Cycle: {total_cycle_ms} ms)\n")

            if max_cycles > 0 and cycle >= max_cycles:
                print(f"[Orchestrator] Completed {max_cycles} target cycles. Exiting cleanly.")
                break

            # Wait for the next sensor cycle (e.g., 10 seconds)
            time.sleep(interval_sec)

    except KeyboardInterrupt:
        print("\n[Orchestrator] Shutdown signal received. Stopping Component 1 cleanly.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Component 1 Edge AI Orchestrator")
    parser.add_argument("--cycles", type=int, default=0, help="Number of cycles to run (0 for infinite)")
    parser.add_argument("--interval", type=float, default=10.0, help="Seconds between cycles")
    args = parser.parse_args()

    run_edge_orchestrator(max_cycles=args.cycles, interval_sec=args.interval)