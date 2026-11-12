from pydantic import BaseModel, Field, model_validator

from .routes import CoverageConfidence


class RouteShadeCoverage(BaseModel):
    """Distance-weighted shade summary for a complete pedestrian route."""

    total_distance_m: float = Field(gt=0)
    shaded_distance_m: float = Field(ge=0)
    exposed_distance_m: float = Field(ge=0)
    unknown_distance_m: float = Field(ge=0)
    shaded_percentage: float = Field(ge=0, le=100)
    exposed_percentage: float = Field(ge=0, le=100)
    unknown_percentage: float = Field(ge=0, le=100)
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
        return self
