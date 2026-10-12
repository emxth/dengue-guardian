import time
import numpy as np
from ultralytics import YOLO
from config import MODELS_DIR
from core.schemas import DetectedObjects

# Map the exact class names from the training dataset 
# to the clean field names used in our Pydantic DetectedObjects schema
CLASS_NAME_MAPPING = {
    "Bottle": "bottle",
    "Coconut-Exocarp": "coconut_exocarp",
    "Drain-Inlet": "drain_inlet",
    "Tire": "tire",
    "Vase": "vase"
}

class YOLOVisionEngine:
    """
    Handles loading the YOLO model and counting mosquito-breeding containers 
    from camera frames on the edge device.
    """
    def __init__(self, conf_threshold: float = 0.45):
        self.conf_threshold = conf_threshold
        self.onnx_path = MODELS_DIR / "best.onnx"
        self.pt_path = MODELS_DIR / "best.pt"
        self.model = None
        
        self._load_model()

    def _load_model(self):
        """
        Prioritizes loading the optimized ONNX model for edge speed
        and runs a warm-up pass so the ONNX C++ session is ready in RAM.
        """
        if self.onnx_path.exists():
            print(f"[YOLO] Loading optimized ONNX edge model: {self.onnx_path.name}")
            self.model = YOLO(str(self.onnx_path), task="detect")
        elif self.pt_path.exists():
            print(f"[YOLO] ONNX not found. Loading PyTorch model: {self.pt_path.name}")
            self.model = YOLO(str(self.pt_path), task="detect")
        else:
            print("[YOLO Warning] No model file found in /models. Running in dummy zero-count mode.")
            self.model = None

        # Warm-up the ONNX Runtime session using a blank 640x640 image
        # This prevents the first real camera frame from taking 4+ seconds
        if self.model is not None:
            dummy_warmup = np.zeros((640, 640, 3), dtype=np.uint8)
            self.model.predict(source=dummy_warmup, imgsz=640, device="cpu", verbose=False)
            print("[YOLO] ONNX Runtime session warmed up and ready.")

    def detect_and_count(self, frame: np.ndarray) -> tuple[DetectedObjects, float]:
        """
        Runs object detection on a 640x640 image frame.
        
        Args:
            frame: A 3-channel numpy image array from the camera driver.
            
        Returns:
            tuple: (DetectedObjects schema instance, inference_time_ms)
        """
        # Start with all container counts at zero
        counts_dict = {
            "bottle": 0,
            "coconut_exocarp": 0,
            "drain_inlet": 0,
            "tire": 0,
            "vase": 0
        }

        if self.model is None:
            return DetectedObjects(**counts_dict), 0.0

        # Measure true steady-state inference time (after warm-up)
        start_time = time.perf_counter()
        
        results = self.model.predict(
            source=frame,
            conf=self.conf_threshold,
            imgsz=640,
            device="cpu",
            verbose=False
        )
        
        inference_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Extract detected class IDs from the output boxes
        result = results[0]
        if result.boxes is not None and len(result.boxes) > 0:
            detected_class_ids = result.boxes.cls.cpu().numpy().astype(int)
            model_names = result.names

            for cls_id in detected_class_ids:
                raw_name = model_names.get(cls_id, "")
                if raw_name in CLASS_NAME_MAPPING:
                    schema_key = CLASS_NAME_MAPPING[raw_name]
                    counts_dict[schema_key] += 1

        return DetectedObjects(**counts_dict), inference_ms