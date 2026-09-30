import numpy as np
import cv2
from pathlib import Path
from config import MOCK_HARDWARE, DATA_DIR

def capture_frame() -> np.ndarray:
    """
    Captures an image frame for YOLO inference.
    Returns a 640x640 RGB numpy array.
    """
    if MOCK_HARDWARE:
        # Check if we placed a sample test image in the data folder for realistic testing
        sample_img_path = DATA_DIR / "sample_test.jpg"
        if sample_img_path.exists():
            img = cv2.imread(str(sample_img_path))
            return cv2.resize(img, (640, 640))
        
        # Otherwise, generate a dummy 640x640 grey frame so the pipeline doesn't break
        dummy_frame = np.full((640, 640, 3), 128, dtype=np.uint8)
        return dummy_frame

    # Physical Pi Camera V2.1 (Sony IMX219) logic using Picamera2 will go here
    # once the hardware arrives in Phase 2.
    raise NotImplementedError("Physical Pi Camera capture not configured yet.")