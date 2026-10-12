import numpy as np
import cv2
from config import MOCK_HARDWARE, DATA_DIR

def capture_frame() -> np.ndarray:
    """
    Captures an image frame for YOLO inference.
    In Mock Mode, loads 'detect.png' from /data if available; otherwise returns a grey frame.
    """
    if MOCK_HARDWARE:
        # Check for our test image inside component_1_edge_ai/data/
        for filename in ["detect.png", "sample_test.jpg", "detect.jpg"]:
            img_path = DATA_DIR / filename
            if img_path.exists():
                img = cv2.imread(str(img_path))
                if img is not None:
                    print(f"[Camera Mock] Loaded test image: {filename}")
                    # Resize to 640x640 to match our exported ONNX input shape
                    return cv2.resize(img, (640, 640))
        
        # Fallback if no test image is found in /data
        print("[Camera Mock] No test image found in /data. Using blank grey frame.")
        dummy_frame = np.full((640, 640, 3), 128, dtype=np.uint8)
        return dummy_frame

    # Physical Pi Camera V2.1 (Sony IMX219) logic using Picamera2 will go here
    # once the hardware arrives in Phase 2.
    raise NotImplementedError("Physical Pi Camera capture not configured yet.")