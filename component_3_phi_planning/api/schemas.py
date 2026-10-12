
"""Response schemas for the C3 PHI Planning API."""

from typing import Any

from pydantic import BaseModel, Field


class PriorityTask(BaseModel):
    """Priority information for a case or complaint task."""

    task_id: str
    task_type: str
    priority_score: float | None
    priority_level: str
    priority_reason: str
    location_id: str | None = None


class PriorityResponse(BaseModel):
    """Priority-scoring API response."""

    data_mode: str = "synthetic_research_data"
    scoring_policy: str = "provisional"
    total_cases: int = Field(ge=0)
    total_complaints: int = Field(ge=0)
    cases: list[dict[str, Any]]
    complaints: list[dict[str, Any]]
