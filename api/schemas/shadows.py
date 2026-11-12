from datetime import UTC, datetime

from pydantic import BaseModel, Field, model_validator

from .routes import Coordinate, CoverageConfidence, Latitude, Longitude, ShadeClassification


class ShadowViewport(BaseModel):
    west: Longitude
    south: Latitude
    east: Longitude
    north: Latitude

    @model_validator(mode="after")
    def validate_bounds(self) -> "ShadowViewport":
        if self.west >= self.east:
            raise ValueError("west must be less than east")
        if self.south >= self.north:
            raise ValueError("south must be less than north")
        return self


class ShadowRequest(BaseModel):
    viewport: ShadowViewport
    requested_time: datetime

    @model_validator(mode="after")
    def require_utc_time(self) -> "ShadowRequest":
        if self.requested_time.tzinfo is None:
            raise ValueError("requested_time must include a timezone")
        if self.requested_time.utcoffset() != UTC.utcoffset(self.requested_time):
            raise ValueError("requested_time must be expressed in UTC")
        return self


class ShadowSample(BaseModel):
    location: Coordinate
    classification: ShadeClassification
    evaluated_time: datetime
    unknown_reason: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def validate_sample(self) -> "ShadowSample":
        if self.evaluated_time.tzinfo is None:
            raise ValueError("evaluated_time must include a timezone")
        if self.evaluated_time.utcoffset() != UTC.utcoffset(self.evaluated_time):
            raise ValueError("evaluated_time must be expressed in UTC")
        if self.classification is ShadeClassification.UNKNOWN and self.unknown_reason is None:
            raise ValueError("unknown_reason is required for unknown shadow samples")
        if (
            self.classification is not ShadeClassification.UNKNOWN
            and self.unknown_reason is not None
        ):
            raise ValueError("unknown_reason is only allowed for unknown shadow samples")
        return self


class ShadowResponse(BaseModel):
    viewport: ShadowViewport
    requested_time: datetime
    coverage_confidence: CoverageConfidence
    samples: list[ShadowSample] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_utc_time(self) -> "ShadowResponse":
        if self.requested_time.tzinfo is None:
            raise ValueError("requested_time must include a timezone")
        if self.requested_time.utcoffset() != UTC.utcoffset(self.requested_time):
            raise ValueError("requested_time must be expressed in UTC")
        return self
