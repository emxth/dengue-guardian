import board
import adafruit_dht
from config import MOCK_HARDWARE

# Initialize the DHT22 device on GPIO pin 4
if not MOCK_HARDWARE:
    dht_device = adafruit_dht.DHT22(board.D4)

def read_dht22() -> tuple[float, float]:
    """
    Acquire temperature and humidity from the DHT22 sensor.
    Returns: (temperature, humidity) or (None, None) if read fails.
    """
    if MOCK_HARDWARE:
        return 29.5, 75.0
        
    try:
        temp = dht_device.temperature
        hum = dht_device.humidity
        
        if temp is not None and hum is not None:
            return round(temp, 1), round(hum, 1)
        
        return None, None
        
    except RuntimeError as e:
        # DHT sensors frequently fail to read on the first attempt on Linux.
        # This catch prevents the orchestrator from crashing.
        print(f"DHT22 Read Error: {e.args[0]}")
        return None, None
    except Exception as e:
        print(f"Fatal DHT22 Error: {e}")
        return None, None