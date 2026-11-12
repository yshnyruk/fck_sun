from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from api.schemas.routes import (
    Coordinate,
    CoverageConfidence,
    LineStringGeometry,
    PlanningMode,
    Route,
    RouteRequest,
    ShadeClassification,
    ShadeEstimate,
    ShadePreference,
    ShadeSegment,
)


def test_route_request_accepts_scheduled_departure() -> None:
    request = RouteRequest(
        origin=Coordinate(latitude=40.7, longitude=-74.0),
        destination=Coordinate(latitude=40.72, longitude=-73.98),
        planning_mode=PlanningMode.DEPART_AT,
        shade_preference=ShadePreference.MORE,
        departure_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
    )

    assert request.origin == Coordinate(latitude=40.7, longitude=-74.0)
    assert request.departure_time is not None


def test_route_request_requires_time_for_scheduled_modes() -> None:
    with pytest.raises(ValidationError, match="departure_time is required"):
        RouteRequest(
            origin=Coordinate(latitude=40.7, longitude=-74.0),
            destination=Coordinate(latitude=40.72, longitude=-73.98),
            planning_mode=PlanningMode.DEPART_AT,
        )


def test_route_request_rejects_timezone_naive_time() -> None:
    with pytest.raises(ValidationError, match="must include a timezone"):
        RouteRequest(
            origin=Coordinate(latitude=40.7, longitude=-74.0),
            destination=Coordinate(latitude=40.72, longitude=-73.98),
            planning_mode=PlanningMode.ARRIVE_BY,
            arrival_time=datetime(2026, 6, 1, 12, 0),
        )


def test_route_models_represent_geometry_distance_duration_shade_and_confidence() -> None:
    route = Route(
        id="route-1",
        geometry=LineStringGeometry(
            coordinates=[(-74.0, 40.7), (-73.99, 40.71)],
        ),
        distance_m=1250,
        duration_s=900,
        shade=ShadeEstimate(
            shade_coverage_percent=65,
            classified_distance_m=1200,
            unknown_distance_m=50,
            segments=[
                ShadeSegment(
                    start_distance_m=0,
                    end_distance_m=800,
                    classification=ShadeClassification.CONFIRMED_SHADE,
                    coverage_confidence=CoverageConfidence.HIGH,
                )
            ],
        ),
        coverage_confidence=CoverageConfidence.PARTIAL,
    )

    assert route.geometry.coordinates[0] == (-74.0, 40.7)
    assert route.distance_m == 1250
    assert route.duration_s == 900
    assert route.shade is not None
    assert route.shade.segments[0].classification is ShadeClassification.CONFIRMED_SHADE
    assert route.coverage_confidence is CoverageConfidence.PARTIAL


def test_geometry_rejects_invalid_coordinates_or_short_linestring() -> None:
    with pytest.raises(ValidationError):
        LineStringGeometry(coordinates=[(-74.0, 40.7)])

    with pytest.raises(ValidationError):
        LineStringGeometry(coordinates=[(-181.0, 40.7), (-180.0, 40.71)])
