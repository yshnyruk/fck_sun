from pydantic import BaseModel, Field, model_validator

from .routes import CoverageConfidence


class ShadeCoverageThresholds(BaseModel):
    """Configurable usable-distance thresholds for route coverage states."""

    high_minimum_usable_ratio: float = Field(default=0.8, gt=0, le=1)
    insufficient_below_usable_ratio: float = Field(default=0.2, ge=0, lt=1)

    @model_validator(mode="after")
    def validate_order(self) -> "ShadeCoverageThresholds":
        if self.insufficient_below_usable_ratio >= self.high_minimum_usable_ratio:
            raise ValueError("insufficient threshold must be below high threshold")
        return self


class RouteShadeCoverage(BaseModel):
    """Distance-weighted shade summary for a complete pedestrian route."""

    total_distance_m: float = Field(gt=0)
    shaded_distance_m: float = Field(ge=0)
    exposed_distance_m: float = Field(ge=0)
    unknown_distance_m: float = Field(ge=0)
    shaded_percentage: float = Field(ge=0, le=100)
    exposed_percentage: float = Field(ge=0, le=100)
    unknown_percentage: float = Field(ge=0, le=100)
    usable_percentage: float = Field(ge=0, le=100)
    coverage_confidence: CoverageConfidence

    @model_validator(mode="after")
    def validate_totals(self) -> "RouteShadeCoverage":
        distance_total = self.shaded_distance_m + self.exposed_distance_m + self.unknown_distance_m
        if abs(distance_total - self.total_distance_m) > 1e-6:
            raise ValueError("coverage distances must sum to total_distance_m")
        percentage_total = (
            self.shaded_percentage + self.exposed_percentage + self.unknown_percentage
        )
        if abs(percentage_total - 100) > 1e-6:
            raise ValueError("coverage percentages must sum to 100")
        if abs(self.usable_percentage - self.shaded_percentage - self.exposed_percentage) > 1e-6:
            raise ValueError("usable percentage must equal shaded plus exposed percentage")
        return self
