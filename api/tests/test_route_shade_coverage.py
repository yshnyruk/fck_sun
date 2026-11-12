from datetime import UTC, datetime

import pytest

from api.schemas.routes import (
    Coordinate,
    CoverageConfidence,
    LineStringGeometry,
    ShadeClassification,
)
from api.schemas.segment_shadows import SegmentShadow
from api.schemas.segments import RouteSegment
from api.services.route_shade_coverage import (
    RouteShadeCoverageError,
    calculate_route_shade_coverage,
)


def segments() -> list[RouteSegment]:
    return [
        RouteSegment(
            id="segment-1",
            geometry=LineStringGeometry(coordinates=[(-74.0, 40.0), (-73.99, 40.0)]),
            distance_m=300,
            start_distance_m=0,
            end_distance_m=300,
        ),
        RouteSegment(
            id="segment-2",
            geometry=LineStringGeometry(coordinates=[(-73.99, 40.0), (-73.98, 40.0)]),
            distance_m=30,
            start_distance_m=300,
            end_distance_m=330,
        ),
        RouteSegment(
            id="segment-3",
            geometry=LineStringGeometry(coordinates=[(-73.98, 40.0), (-73.97, 40.0)]),
            distance_m=70,
            start_distance_m=330,
            end_distance_m=400,
        ),
    ]


def shadow(
    segment_id: str,
    classification: ShadeClassification,
    *,
    coverage_confidence: CoverageConfidence = CoverageConfidence.HIGH,
    shade_percentage: float | None = None,
    data_available: bool = True,
) -> SegmentShadow:
    return SegmentShadow(
        segment_id=segment_id,
        location=Coordinate(latitude=40.0, longitude=-74.0),
        expected_arrival=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
        classification=classification,
        coverage_confidence=coverage_confidence,
        source="shademap",
        shade_percentage=shade_percentage,
        data_available=data_available,
        unknown_reason="provider data unavailable"
        if classification is ShadeClassification.UNKNOWN
        else None,
    )


def test_coverage_is_weighted_by_segment_distance() -> None:
    result = calculate_route_shade_coverage(
        segments(),
        [
            shadow("segment-1", ShadeClassification.CONFIRMED_SHADE),
            shadow("segment-2", ShadeClassification.CONFIRMED_EXPOSURE),
            shadow(
                "segment-3",
                ShadeClassification.UNKNOWN,
                data_available=False,
                coverage_confidence=CoverageConfidence.INSUFFICIENT,
            ),
        ],
    )

    assert result.total_distance_m == 400
    assert result.shaded_distance_m == 300
    assert result.exposed_distance_m == 30
    assert result.unknown_distance_m == 70
    assert result.shaded_percentage == pytest.approx(75)
    assert result.exposed_percentage == pytest.approx(7.5)
    assert result.unknown_percentage == pytest.approx(17.5)
    assert result.coverage_confidence is CoverageConfidence.PARTIAL


def test_optional_shade_percentage_splits_segment_distance() -> None:
    result = calculate_route_shade_coverage(
        segments()[:1],
        [shadow("segment-1", ShadeClassification.CONFIRMED_SHADE, shade_percentage=50)],
    )

    assert result.shaded_distance_m == pytest.approx(150)
    assert result.exposed_distance_m == pytest.approx(150)
    assert result.shaded_percentage == pytest.approx(50)


def test_entirely_unknown_route_is_insufficient() -> None:
    result = calculate_route_shade_coverage(
        segments(),
        [
            shadow(
                segment.id,
                ShadeClassification.UNKNOWN,
                data_available=False,
                coverage_confidence=CoverageConfidence.INSUFFICIENT,
            )
            for segment in segments()
        ],
    )

    assert result.shaded_distance_m == 0
    assert result.exposed_distance_m == 0
    assert result.unknown_distance_m == 400
    assert result.shaded_percentage == 0
    assert result.exposed_percentage == 0
    assert result.unknown_percentage == 100
    assert result.coverage_confidence is CoverageConfidence.INSUFFICIENT


def test_missing_shadow_result_is_unknown() -> None:
    result = calculate_route_shade_coverage(
        segments(),
        [shadow("segment-1", ShadeClassification.CONFIRMED_SHADE)],
    )

    assert result.shaded_distance_m == 300
    assert result.unknown_distance_m == 100
    assert result.coverage_confidence is CoverageConfidence.PARTIAL


def test_duplicate_ids_are_rejected() -> None:
    duplicate = segments()[1].model_copy(update={"id": "segment-1"})

    with pytest.raises(RouteShadeCoverageError, match="identifiers must be unique"):
        calculate_route_shade_coverage([segments()[0], duplicate], [])
