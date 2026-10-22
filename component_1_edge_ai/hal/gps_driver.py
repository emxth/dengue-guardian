import serial
import pynmea2
from config import MOCK_HARDWARE, DEFAULT_LATITUDE, DEFAULT_LONGITUDE

def get_location() -> tuple[float, float]:
    """
    Acquire GPS coordinates from the U-blox 7 USB module.
    Returns: (latitude, longitude)
    """
    if MOCK_HARDWARE:
        return DEFAULT_LATITUDE, DEFAULT_LONGITUDE
        
    try:
        # ttyACM0 is the standard Linux endpoint for USB CDC communication devices
        with serial.Serial('/dev/ttyACM0', baudrate=9600, timeout=1) as ser:
            for _ in range(10): 
                line = ser.readline().decode('ascii', errors='replace').strip()
                if line.startswith('$GPGGA'):
                    msg = pynmea2.parse(line)
                    if msg.latitude and msg.longitude:
                        return round(msg.latitude, 6), round(msg.longitude, 6)
        
        return 0.0, 0.0
    except Exception as e:
        print(f"Hardware Error: {e}")
        return 0.0, 0.0