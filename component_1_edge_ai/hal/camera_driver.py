"""
Hardware Abstraction Layer for the Raspberry Pi Camera.
Handles image capture and preprocessing for YOLOv11 inference.
"""
import cv2
import numpy as np
from pathlib import Path
from config import MOCK_HARDWARE, DATA_DIR

def capture_frame() -> np.ndarray:
    """
    Captures a single frame from the CSI camera.
    Returns: An OpenCV image array (numpy.ndarray).
    """
    if MOCK_HARDWARE:
        # Generate a dummy blank image for testing the orchestrator without a camera
        print("MOCK: Generating dummy camera frame.")
        return np.zeros((640, 640, 3), dtype=np.uint8)

    try:
        # Initialize the camera (0 is the default index for the Pi Camera)
        cap = cv2.VideoCapture(0)
        
        if not cap.isOpened():
            raise RuntimeError("Failed to open the camera port.")

        # Allow the sensor a brief moment to adjust to lighting
        for _ in range(5):
            cap.read()

        ret, frame = cap.read()
        cap.release()

        if not ret:
            raise RuntimeError("Failed to read frame from camera.")

        return frame

    except Exception as e:
        print(f"Camera Hardware Error: {e}")
        # Return a blank array as a safe fallback so the AI pipeline doesn't crash
        return np.zeros((640, 640, 3), dtype=np.uint8)

def save_frame(frame: np.ndarray, filename: str) -> str:
    """
    Saves the captured frame to the local data directory.
    """
    filepath = DATA_DIR / filename
    cv2.imwrite(str(filepath), frame)
    return str(filepath)