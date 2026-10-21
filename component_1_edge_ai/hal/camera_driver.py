import cv2
import numpy as np
import subprocess
import os
from pathlib import Path
from config import MOCK_HARDWARE, DATA_DIR

def capture_frame() -> np.ndarray:
    if MOCK_HARDWARE:
        return np.zeros((640, 640, 3), dtype=np.uint8)

    temp_img_path = str(DATA_DIR / "temp_capture.jpg")

    try:
        # Using the native rpicam-jpeg command for Pi OS Bookworm
        # result = subprocess.run(
        #     ["rpicam-jpeg", "-o", temp_img_path, "-t", "500", "--width", "640", "--height", "640"],
        #     capture_output=True,
        #     text=True
        # )

        result = subprocess.run(
            [
                "rpicam-jpeg",
                "-o", temp_img_path,
                "-t", "1000",
                "--width", "3280",
                "--height", "2464",
                "--quality", "90",
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )

        if result.returncode == 0 and os.path.exists(temp_img_path):
            frame = cv2.imread(temp_img_path)
            os.remove(temp_img_path) # Clean up
            
            if frame is not None:
                return frame
                
        raise RuntimeError(f"rpicam-jpeg failed: {result.stderr}")

    except Exception as e:
        print(f"Camera Hardware Error: {e}")
        return np.zeros((640, 640, 3), dtype=np.uint8)

def save_frame(frame: np.ndarray, filename: str) -> str:
    filepath = DATA_DIR / filename
    cv2.imwrite(str(filepath), frame)
    return str(filepath)