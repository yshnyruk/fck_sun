from datetime import datetime

from pydantic import BaseModel, Field

from .routes import Coordinate, CoverageConfidence, ShadeClassification


class SegmentShadow(BaseModel):
    """Normalized shadow information associated with one route segment."""

    segment_id: str = Field(min_length=1)
    location: Coordinate
    expected_arrival: datetime
    classification: ShadeClassification
    coverage_confidence: CoverageConfidence
    source: str = Field(min_length=1)
    shade_percentage: float | None = Field(default=None, ge=0, le=100)
    data_available: bool
    unknown_reason: str | None = Field(default=None, min_length=1)
