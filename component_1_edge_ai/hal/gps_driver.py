import random
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
        
    # Real UART parsing will be injected here in Phase 2
    raise NotImplementedError("Physical GPS reading pending hardware mount.")