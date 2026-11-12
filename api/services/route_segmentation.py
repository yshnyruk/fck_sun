"""Split route geometry into ordered, distance-aware route segments."""

from math import asin, cos, radians, sin, sqrt

from api.schemas.routes import LineStringGeometry
from api.schemas.segments import RouteSegment, RouteSegmentationConfig

_EARTH_RADIUS_M = 6_371_008.8
_DISTANCE_EPSILON_M = 1e-9


class RouteSegmentationError(Exception):
    """Raised when route geometry cannot be segmented."""


def segment_route_geometry(
    geometry: LineStringGeometry,
    config: RouteSegmentationConfig | None = None,
) -> list[RouteSegment]:
    """Split a route line while preserving its shape and coordinate order."""
    settings = config or RouteSegmentationConfig()
    coordinates = geometry.coordinates
    segments: list[RouteSegment] = []
    current_coordinates = [coordinates[0]]
    current_distance = 0.0
    route_distance = 0.0
    segment_start_distance = 0.0
    segment_number = 1

    for edge_start, edge_end in zip(coordinates, coordinates[1:], strict=False):
        edge_distance = _great_circle_distance(edge_start, edge_end)
        if edge_distance <= _DISTANCE_EPSILON_M:
            continue

        edge_origin = edge_start
        edge_remaining = edge_distance
        while edge_remaining > _DISTANCE_EPSILON_M:
            available = settings.max_segment_length_m - current_distance
            if available <= _DISTANCE_EPSILON_M:
                segment = _build_segment(
                    segment_number,
                    current_coordinates,
                    segment_start_distance,
                    route_distance,
                )
                segments.append(segment)
                segment_number += 1
                current_coordinates = [current_coordinates[-1]]
                current_distance = 0.0
                segment_start_distance = route_distance
                available = settings.max_segment_length_m

            if edge_remaining <= available + _DISTANCE_EPSILON_M:
                current_coordinates.append(edge_end)
                current_distance += edge_remaining
                route_distance += edge_remaining
                edge_remaining = 0.0
                if abs(current_distance - settings.max_segment_length_m) <= _DISTANCE_EPSILON_M:
                    segment = _build_segment(
                        segment_number,
                        current_coordinates,
                        segment_start_distance,
                        route_distance,
                    )
                    segments.append(segment)
                    segment_number += 1
                    current_coordinates = [edge_end]
                    current_distance = 0.0
                    segment_start_distance = route_distance
                continue

            split_fraction = available / edge_remaining
            split_point = _interpolate(edge_origin, edge_end, split_fraction)
            current_coordinates.append(split_point)
            current_distance += available
            route_distance += available
            segment = _build_segment(
                segment_number,
                current_coordinates,
                segment_start_distance,
                route_distance,
            )
            segments.append(segment)
            segment_number += 1
            current_coordinates = [split_point]
            current_distance = 0.0
            segment_start_distance = route_distance
            edge_origin = split_point
            edge_remaining -= available

    if current_distance > _DISTANCE_EPSILON_M:
        segments.append(
            _build_segment(
                segment_number,
                current_coordinates,
                segment_start_distance,
                route_distance,
            )
        )

    if not segments:
        raise RouteSegmentationError(
            "Route geometry must contain at least two distinct coordinates"
        )
    return segments


def _build_segment(
    segment_number: int,
    coordinates: list[tuple[float, float]],
    start_distance_m: float,
    end_distance_m: float,
) -> RouteSegment:
    if len(coordinates) < 2:
        raise RouteSegmentationError("Route segment must contain at least two coordinates")
    return RouteSegment(
        id=f"route-segment-{segment_number}",
        geometry=LineStringGeometry(coordinates=coordinates),
        distance_m=end_distance_m - start_distance_m,
        start_distance_m=start_distance_m,
        end_distance_m=end_distance_m,
    )


def _great_circle_distance(
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    longitude_delta = radians(end[0] - start[0])
    latitude_delta = radians(end[1] - start[1])
    start_latitude = radians(start[1])
    end_latitude = radians(end[1])
    haversine = (
        sin(latitude_delta / 2) ** 2
        + cos(start_latitude) * cos(end_latitude) * sin(longitude_delta / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_M * asin(sqrt(haversine))


def _interpolate(
    start: tuple[float, float],
    end: tuple[float, float],
    fraction: float,
) -> tuple[float, float]:
    return (
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
    )
