import pytest

from api.schemas.routes import LineStringGeometry
from api.schemas.segments import RouteSegmentationConfig
from api.services.route_segmentation import (
    RouteSegmentationError,
    segment_route_geometry,
)


def test_segmentation_preserves_order_and_reconstructs_route() -> None:
    geometry = LineStringGeometry(
        coordinates=[
            (-74.0, 40.0),
            (-73.999, 40.0),
            (-73.998, 40.001),
        ]
    )

    segments = segment_route_geometry(
        geometry,
        RouteSegmentationConfig(max_segment_length_m=100),
    )

    assert [segment.id for segment in segments] == [
        f"route-segment-{index}" for index in range(1, len(segments) + 1)
    ]
    assert segments[0].geometry.coordinates[0] == geometry.coordinates[0]
    assert segments[-1].geometry.coordinates[-1] == geometry.coordinates[-1]
    assert all(
        left.geometry.coordinates[-1] == right.geometry.coordinates[0]
        for left, right in zip(segments, segments[1:], strict=False)
    )
    reconstructed = [segment.geometry.coordinates[0] for segment in segments]
    reconstructed.append(segments[-1].geometry.coordinates[-1])
    assert reconstructed[0] == geometry.coordinates[0]
    assert reconstructed[-1] == geometry.coordinates[-1]


def test_segmentation_splits_long_edges_and_preserves_renderable_geometry() -> None:
    geometry = LineStringGeometry(coordinates=[(-74.0, 40.0), (-73.99, 40.0)])

    segments = segment_route_geometry(
        geometry,
        RouteSegmentationConfig(max_segment_length_m=250),
    )

    assert len(segments) > 1
    assert all(len(segment.geometry.coordinates) >= 2 for segment in segments)
    assert all(segment.distance_m <= 250 + 1e-6 for segment in segments)


def test_segment_distances_match_total_segment_distance() -> None:
    geometry = LineStringGeometry(
        coordinates=[
            (-74.0, 40.0),
            (-73.999, 40.0),
            (-73.998, 40.001),
        ]
    )

    segments = segment_route_geometry(
        geometry,
        RouteSegmentationConfig(max_segment_length_m=125),
    )

    assert sum(segment.distance_m for segment in segments) == pytest.approx(
        segments[-1].end_distance_m,
        abs=1e-6,
    )
    assert all(
        segment.start_distance_m == pytest.approx(previous.end_distance_m, abs=1e-6)
        for previous, segment in zip(segments, segments[1:], strict=False)
    )


def test_segmentation_rejects_route_with_no_distinct_coordinates() -> None:
    geometry = LineStringGeometry(coordinates=[(-74.0, 40.0), (-74.0, 40.0)])

    with pytest.raises(RouteSegmentationError, match="two distinct"):
        segment_route_geometry(geometry)


def test_segmentation_config_requires_positive_interval() -> None:
    with pytest.raises(ValueError):
        RouteSegmentationConfig(max_segment_length_m=0)
