from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class DetectedObjects(BaseModel):
    """Schema for bounding box counts identified by the YOLO edge model."""
    tyre: int = Field(default=0, ge=0)
    bottle: int = Field(default=0, ge=0)
    drain: int = Field(default=0, ge=0)
    coco_shell: int = Field(default=0, ge=0)
    exocarp: int = Field(default=0, ge=0)

class TelemetryRecord(BaseModel):
    """Unified telemetry schema integrating environmental, spatial, and visual data."""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    temperature: float = Field(description="Celsius")
    humidity: float = Field(description="Percentage")
    rainfall_mm: float = Field(default=0.0, description="24h accumulated rainfall from Weather API")
    weather_risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    objects: DetectedObjects = Field(default_factory=DetectedObjects)
    environmental_breeding_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    risk_level: str = Field(default="Pending") # "Low", "Medium", "High"