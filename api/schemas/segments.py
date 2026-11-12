from pydantic import BaseModel, Field

from .routes import LineStringGeometry


class RouteSegment(BaseModel):
    """An ordered, renderable section of a pedestrian route."""

    id: str = Field(min_length=1)
    geometry: LineStringGeometry
    distance_m: float = Field(gt=0)
    start_distance_m: float = Field(ge=0)
    end_distance_m: float = Field(gt=0)

    @property
    def coordinate_count(self) -> int:
        return len(self.geometry.coordinates)


class RouteSegmentationConfig(BaseModel):
    """Configuration for converting a route line into smaller sections."""

    max_segment_length_m: float = Field(default=100.0, gt=0)
