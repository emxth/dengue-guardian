import random
from config import MOCK_HARDWARE

def read_dht22() -> tuple[float, float]:
    """
    Acquire temperature and humidity.
    Returns: (temperature_celsius, humidity_percentage)
    """
    if MOCK_HARDWARE:
        # Generate plausible Sri Lankan microclimatic data
        temp = round(random.uniform(27.0, 32.5), 1)
        humidity = round(random.uniform(70.0, 92.0), 1)
        return temp, humidity
    
    # Real hardware logic will be injected here in Phase 2
    raise NotImplementedError("Physical DHT22 reading pending hardware mount.")