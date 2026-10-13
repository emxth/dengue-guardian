import random
import serial
import pynmea2
from config import MOCK_HARDWARE, DEFAULT_LATITUDE, DEFAULT_LONGITUDE

def get_location() -> tuple[float, float]:
    """
    Acquire GPS coordinates from NEO-6M.
    Returns: (latitude, longitude)
    """
    if MOCK_HARDWARE:
        # Simulate slight GPS drift around Kaduwela MOH area
        lat = round(DEFAULT_LATITUDE + random.uniform(-0.002, 0.002), 6)
        lon = round(DEFAULT_LONGITUDE + random.uniform(-0.002, 0.002), 6)
        return lat, lon
        
    # Real UART parsing
    try:
        # Note: Change to '/dev/ttyACM0' or '/dev/ttyUSB0' if you buy a USB GPS plug-and-play module
        with serial.Serial('/dev/serial0', baudrate=9600, timeout=1) as ser:
            # Read up to 10 lines to ensure we catch a $GPGGA sentence
            for _ in range(10): 
                line = ser.readline().decode('ascii', errors='replace').strip()
                if line.startswith('$GPGGA'):
                    msg = pynmea2.parse(line)
                    # Ensure the module has a valid satellite fix
                    if msg.latitude and msg.longitude:
                        return round(msg.latitude, 6), round(msg.longitude, 6)
        
        # Return fallback if searching for satellites
        print("GPS searching for satellites...")
        return 0.0, 0.0

    except Exception as e:
        print(f"Hardware Error: {e}")
        return 0.0, 0.0