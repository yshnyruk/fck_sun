from datetime import UTC, datetime

import pytest

from api.schemas.routes import (
    Coordinate,
    CoverageConfidence,
    LineStringGeometry,
    PlanningMode,
    Route,
    RouteRequest,
)
from api.schemas.segments import RouteSegment
from api.services.segment_timing import SegmentTimingError, calculate_segment_arrival_times


def route() -> Route:
    return Route(
        id="route-1",
        geometry=LineStringGeometry(coordinates=[(-74.0, 40.0), (-73.99, 40.0)]),
        distance_m=1_000,
        duration_s=600,
        coverage_confidence=CoverageConfidence.INSUFFICIENT,
    )


def segments() -> list[RouteSegment]:
    return [
        RouteSegment(
            id="route-segment-1",
            geometry=LineStringGeometry(coordinates=[(-74.0, 40.0), (-73.995, 40.0)]),
            distance_m=500,
            start_distance_m=0,
            end_distance_m=500,
        ),
        RouteSegment(
            id="route-segment-2",
            geometry=LineStringGeometry(coordinates=[(-73.995, 40.0), (-73.99, 40.0)]),
            distance_m=500,
            start_distance_m=500,
            end_distance_m=1_000,
        ),
    ]


def request(
    mode: PlanningMode,
    *,
    departure_time: datetime | None = None,
    arrival_time: datetime | None = None,
) -> RouteRequest:
    return RouteRequest(
        origin=Coordinate(latitude=40.0, longitude=-74.0),
        destination=Coordinate(latitude=40.0, longitude=-73.99),
        planning_mode=mode,
        departure_time=departure_time,
        arrival_time=arrival_time,
    )


def test_leave_now_uses_injected_current_time() -> None:
    current_time = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)

    timing = calculate_segment_arrival_times(
        route(),
        segments(),
        request(PlanningMode.LEAVE_NOW),
        now=current_time,
    )

    assert timing.departure_time == current_time
    assert [arrival.expected_arrival for arrival in timing.segment_arrivals] == [
        datetime(2026, 6, 1, 12, 5, tzinfo=UTC),
        datetime(2026, 6, 1, 12, 10, tzinfo=UTC),
    ]


def test_depart_at_uses_selected_timestamp_and_preserves_timezone() -> None:
    departure = datetime(2026, 6, 1, 14, 0, tzinfo=UTC)

    timing = calculate_segment_arrival_times(
        route(),
        segments(),
        request(PlanningMode.DEPART_AT, departure_time=departure),
    )

    assert timing.departure_time == departure
    assert timing.expected_arrival_time == datetime(2026, 6, 1, 14, 10, tzinfo=UTC)


def test_arrive_by_derives_departure_from_journey_duration() -> None:
    arrival = datetime(2026, 6, 1, 15, 0, tzinfo=UTC)

    timing = calculate_segment_arrival_times(
        route(),
        segments(),
        request(PlanningMode.ARRIVE_BY, arrival_time=arrival),
    )

    assert timing.departure_time == datetime(2026, 6, 1, 14, 50, tzinfo=UTC)
    assert timing.segment_arrivals[-1].expected_arrival == arrival


def test_segment_arrivals_are_ordered_by_distance() -> None:
    timing = calculate_segment_arrival_times(
        route(),
        segments(),
        request(
            PlanningMode.DEPART_AT,
            departure_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
        ),
    )

    distances = [arrival.distance_from_start_m for arrival in timing.segment_arrivals]
    timestamps = [arrival.expected_arrival for arrival in timing.segment_arrivals]
    assert distances == sorted(distances)
    assert timestamps == sorted(timestamps)


def test_timing_rejects_segments_beyond_route_distance() -> None:
    invalid_segment = segments()
    invalid_segment[-1] = invalid_segment[-1].model_copy(update={"end_distance_m": 1_002})

    with pytest.raises(SegmentTimingError, match="exceeds"):
        calculate_segment_arrival_times(
            route(),
            invalid_segment,
            request(
                PlanningMode.DEPART_AT,
                departure_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
            ),
        )
