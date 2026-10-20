import time
import psutil
import numpy as np
import sys
import argparse
from pathlib import Path

# Add component root to path
sys.path.append(str(Path(__file__).resolve().parents[1]))

from ai_modules.yolo_vision import YOLOVisionEngine
from ai_modules.weather_ai import WeatherAIEngine
from ai_modules.risk_fusion import DecisionFusionEngine
from hal.camera_driver import capture_frame


def get_cpu_temp():
    """Reads RPi 4 core temperature safely."""
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            return float(f.read()) / 1000.0
    except Exception:
        return 0.0


def run_edge_benchmark(iterations: int = 10):
    print("===================================================================")
    print("--- Component 1: Edge AI Performance Profiler ---")
    print(f"--- Running {iterations} consecutive inference cycles ---")
    print("===================================================================\n")

    # Initialize engines with aligned 0.25 confidence
    print("[Init] Loading models into memory & capturing calibration frame...")
    yolo_engine = YOLOVisionEngine(conf_threshold=0.25)
    weather_engine = WeatherAIEngine()
    fusion_engine = DecisionFusionEngine()
    frame = capture_frame()

    latencies_yolo = []
    latencies_weather = []
    latencies_fusion = []
    cpu_usages = []
    ram_usages = []
    temps = []

    print(f"\n[Benchmarking] Executing {iterations} cycles...")

    for i in range(iterations):
        # Measure system resources before execution
        cpu_usages.append(psutil.cpu_percent(interval=None))
        ram_usages.append(psutil.virtual_memory().percent)
        temps.append(get_cpu_temp())

        # 1. Weather AI Inference
        _, w_ms = weather_engine.predict_suitability(temperature=29.5, humidity=82.0, rainfall_mm=12.0)
        latencies_weather.append(w_ms)

        # 2. YOLO Vision ONNX Inference
        detected_objects, y_ms = yolo_engine.detect_and_count(frame)
        latencies_yolo.append(y_ms)

        # 3. Decision Fusion Engine
        _, _, f_ms = fusion_engine.evaluate_risk(weather_risk_score=0.85, objects=detected_objects, mode="fusion")
        latencies_fusion.append(f_ms)

        print(f"  Cycle {i + 1}/{iterations} -> YOLO: {y_ms:.1f} ms | Weather: {w_ms:.2f} ms | Temp: {temps[-1]:.1f}°C")

    # Compute Statistics
    print("\n===================================================================")
    print("--- BENCHMARK RESULTS (For Presentation Slides & Audit) ---")
    print("===================================================================")

    print("\n1. Inference Latency (Milliseconds):")
    print(f"   - YOLOv8s (ONNX CPU) : {np.mean(latencies_yolo):.2f} ms ± {np.std(latencies_yolo):.2f}")
    print(f"   - Weather AI         : {np.mean(latencies_weather):.3f} ms ± {np.std(latencies_weather):.3f}")
    print(f"   - Fusion Engine      : {np.mean(latencies_fusion):.3f} ms ± {np.std(latencies_fusion):.3f}")

    total_pipeline_ms = np.mean(latencies_yolo) + np.mean(latencies_weather) + np.mean(latencies_fusion)
    print(f"   -> Total AI Pipeline : {total_pipeline_ms:.2f} ms per fresh cycle")

    print("\n2. Hardware Utilization:")
    print(f"   - Average CPU Load   : {np.mean(cpu_usages):.1f}%")
    print(f"   - Average RAM Usage  : {np.mean(ram_usages):.1f}%")
    if any(temps):
        print(f"   - Peak Core Temp     : {np.max(temps):.1f}°C (Safe limit: < 80.0°C)")
    print("===================================================================\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Edge AI Latency Profiler")
    parser.add_argument("--iter", type=int, default=10, help="Number of benchmark iterations (default: 10)")
    args = parser.parse_args()

    # Warm up psutil sample window
    psutil.cpu_percent(interval=0.2)
    run_edge_benchmark(iterations=args.iter)