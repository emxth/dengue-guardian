import sys
from pathlib import Path

# Allow importing from component_1_edge_ai root
sys.path.append(str(Path(__file__).resolve().parents[1]))

from hal.camera_driver import capture_frame
from ai_modules.yolo_vision import YOLOVisionEngine

def test_yolo_execution():
    print("--- Testing Component 1 YOLO Edge Vision Engine ---")
    
    # 1. Initialize the vision engine (loads best.onnx)
    vision_engine = YOLOVisionEngine(conf_threshold=0.45)
    
    # 2. Grab a frame from our camera driver
    # Tip: Put any real photo named 'sample_test.jpg' inside component_1_edge_ai/data/
    # to test real detections! Otherwise it uses the grey dummy frame.
    frame = capture_frame()
    print(f"[Camera] Frame ready with shape: {frame.shape}")
    
    # 3. Run detection and counting
    detected_counts, latency_ms = vision_engine.detect_and_count(frame)
    
    print(f"[Benchmark] Inference Latency: {latency_ms} ms")
    print(f"[Output] Detected Container Counts: {detected_counts.model_dump()}")

if __name__ == "__main__":
    test_yolo_execution()