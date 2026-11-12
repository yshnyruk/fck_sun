from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]


class PlanningMode(StrEnum):
    LEAVE_NOW = "leave_now"
    DEPART_AT = "depart_at"
    ARRIVE_BY = "arrive_by"


class ShadePreference(StrEnum):
    FULL = "full"
    MORE = "more"
    MEDIUM = "medium"
    LESS = "less"
    NO_SHADOW = "no_shadow"


class CoverageConfidence(StrEnum):
    HIGH = "high"
    PARTIAL = "partial"
    INSUFFICIENT = "insufficient"


class ShadeClassification(StrEnum):
    CONFIRMED_SHADE = "confirmed_shade"
    CONFIRMED_EXPOSURE = "confirmed_exposure"
    UNKNOWN = "unknown"


class Coordinate(BaseModel):
    model_config = ConfigDict(frozen=True)

    latitude: Latitude
    longitude: Longitude


class LineStringGeometry(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[Longitude, Latitude]] = Field(min_length=2)


class RouteRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate
    planning_mode: PlanningMode = PlanningMode.LEAVE_NOW
    shade_preference: ShadePreference = ShadePreference.MEDIUM
    departure_time: datetime | None = None
    arrival_time: datetime | None = None

    @model_validator(mode="after")
    def validate_planning_time(self) -> "RouteRequest":
        if self.planning_mode is PlanningMode.DEPART_AT:
            if self.departure_time is None:
                raise ValueError("departure_time is required when planning_mode is depart_at")
            if self.arrival_time is not None:
                raise ValueError("arrival_time is not allowed when planning_mode is depart_at")
        elif self.planning_mode is PlanningMode.ARRIVE_BY:
            if self.arrival_time is None:
                raise ValueError("arrival_time is required when planning_mode is arrive_by")
            if self.departure_time is not None:
                raise ValueError("departure_time is not allowed when planning_mode is arrive_by")
        elif self.departure_time is not None or self.arrival_time is not None:
            raise ValueError("planning time is not allowed when planning_mode is leave_now")

        planned_time = self.departure_time or self.arrival_time
        if planned_time is not None and planned_time.tzinfo is None:
            raise ValueError("planning times must include a timezone")
        return self


class ShadeSegment(BaseModel):
    start_distance_m: float = Field(ge=0)
    end_distance_m: float = Field(gt=0)
    classification: ShadeClassification
    coverage_confidence: CoverageConfidence

    @model_validator(mode="after")
    def validate_distance_range(self) -> "ShadeSegment":
        if self.end_distance_m <= self.start_distance_m:
            raise ValueError("end_distance_m must be greater than start_distance_m")
        return self


class ShadeEstimate(BaseModel):
    shade_coverage_percent: float | None = Field(default=None, ge=0, le=100)
    classified_distance_m: float = Field(ge=0)
    unknown_distance_m: float = Field(ge=0)
    segments: list[ShadeSegment] = Field(default_factory=list)


class Route(BaseModel):
    id: str = Field(min_length=1)
    geometry: LineStringGeometry
    distance_m: float = Field(gt=0)
    duration_s: float = Field(gt=0)
    score: float | None = Field(default=None, ge=0, le=1)
    shade: ShadeEstimate | None = None
    coverage_confidence: CoverageConfidence


class RouteResponse(BaseModel):
    recommended_route: Route
    alternatives: list[Route] = Field(default_factory=list)
