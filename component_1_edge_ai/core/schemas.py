from pydantic import BaseModel, Field
from datetime import datetime

class DetectedObjects(BaseModel):
    """
    Holds the exact counts of mosquito breeding-related containers 
    detected in a single camera frame. Matches the 5 classes trained 
    in our YOLOv8s model.
    """
    bottle: int = Field(default=0, ge=0, description="Plastic/glass bottles")
    coconut_exocarp: int = Field(default=0, ge=0, description="Discarded coconut shells/husks")
    drain_inlet: int = Field(default=0, ge=0, description="Open or blocked surface drains")
    tire: int = Field(default=0, ge=0, description="Discarded vehicle tires")
    vase: int = Field(default=0, ge=0, description="Flower pots or vases")

class TelemetryRecord(BaseModel):
    """
    Master data contract for Component 1. Combines local sensor readings,
    external rainfall data, YOLO container counts, and final risk scores.
    """
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    temperature: float = Field(description="Ambient temperature in Celsius from DHT22")
    humidity: float = Field(description="Relative humidity percentage from DHT22")
    rainfall_mm: float = Field(default=0.0, description="Recent rainfall in mm from Weather API")
    weather_risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    objects: DetectedObjects = Field(default_factory=DetectedObjects)
    environmental_breeding_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    risk_level: str = Field(default="Pending")  # Expected: "Low", "Medium", or "High"