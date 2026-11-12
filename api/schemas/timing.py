from datetime import datetime

from pydantic import BaseModel, Field


class SegmentArrivalTime(BaseModel):
    """Expected time the user reaches the end of an ordered route segment."""

    segment_id: str = Field(min_length=1)
    distance_from_start_m: float = Field(gt=0)
    expected_arrival: datetime


class RouteTiming(BaseModel):
    """Route-level timing context shared with shade evaluation."""

    departure_time: datetime
    expected_arrival_time: datetime
    segment_arrivals: list[SegmentArrivalTime] = Field(min_length=1)
