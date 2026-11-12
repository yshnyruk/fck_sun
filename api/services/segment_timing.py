"""Calculate expected arrival times for ordered route segments."""

from datetime import UTC, datetime, timedelta

from api.schemas.routes import PlanningMode, Route, RouteRequest
from api.schemas.segments import RouteSegment
from api.schemas.timing import RouteTiming, SegmentArrivalTime

_DISTANCE_TOLERANCE_M = 1.0


class SegmentTimingError(Exception):
    """Raised when route timing cannot be calculated safely."""


def calculate_segment_arrival_times(
    route: Route,
    segments: list[RouteSegment],
    request: RouteRequest,
    *,
    now: datetime | None = None,
) -> RouteTiming:
    """Return ordered segment arrival times using the route's average speed.

    A segment's timestamp represents reaching its end, which is the earliest
    point at which the whole segment has been traversed.
    """
    if not segments:
        raise SegmentTimingError("At least one route segment is required")
    if route.distance_m <= 0 or route.duration_s <= 0:
        raise SegmentTimingError("Route distance and duration must be positive")

    departure_time, expected_arrival_time = _resolve_route_times(route, request, now)
    speed_mps = route.distance_m / route.duration_s
    previous_end = 0.0
    arrivals: list[SegmentArrivalTime] = []

    for segment in segments:
        if segment.start_distance_m < previous_end - _DISTANCE_TOLERANCE_M:
            raise SegmentTimingError("Route segments must be in cumulative route order")
        if segment.end_distance_m <= segment.start_distance_m:
            raise SegmentTimingError("Route segments must have positive distance")
        if segment.end_distance_m > route.distance_m + _DISTANCE_TOLERANCE_M:
            raise SegmentTimingError("Route segment exceeds the route distance")
        previous_end = segment.end_distance_m
        elapsed = timedelta(seconds=segment.end_distance_m / speed_mps)
        arrivals.append(
            SegmentArrivalTime(
                segment_id=segment.id,
                distance_from_start_m=segment.end_distance_m,
                expected_arrival=departure_time + elapsed,
            )
        )

    return RouteTiming(
        departure_time=departure_time,
        expected_arrival_time=expected_arrival_time,
        segment_arrivals=arrivals,
    )


def _resolve_route_times(
    route: Route,
    request: RouteRequest,
    now: datetime | None,
) -> tuple[datetime, datetime]:
    if request.planning_mode is PlanningMode.LEAVE_NOW:
        departure_time = request.departure_time or now or datetime.now(UTC)
        if departure_time.tzinfo is None:
            raise SegmentTimingError("Current time must include a timezone")
        departure_time = departure_time.astimezone(departure_time.tzinfo)
        return departure_time, departure_time + timedelta(seconds=route.duration_s)

    if request.planning_mode is PlanningMode.DEPART_AT:
        if request.departure_time is None:
            raise SegmentTimingError("Departure time is required")
        departure_time = request.departure_time
        return departure_time, departure_time + timedelta(seconds=route.duration_s)

    if request.arrival_time is None:
        raise SegmentTimingError("Arrival time is required")
    expected_arrival_time = request.arrival_time
    return (
        expected_arrival_time - timedelta(seconds=route.duration_s),
        expected_arrival_time,
    )
