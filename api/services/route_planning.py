"""Pedestrian route planning service."""

from typing import Protocol

from api.schemas.route_coverage import RouteShadeCoverage
from api.schemas.routes import (
    Coordinate,
    Route,
    RouteRequest,
    RouteResponse,
)
from api.schemas.segments import RouteSegment
from api.services.route_scoring import select_recommended_route
from api.services.route_segmentation import segment_route_geometry
from api.services.route_shade_coverage import (
    attach_route_shade_coverage,
    calculate_route_shade_coverage,
)
from api.services.segment_shadow_mapping import SegmentShadowProvider, map_shadows_to_segments
from api.services.segment_timing import calculate_segment_arrival_times


class RoutePlanningError(Exception):
    """Raised when no pedestrian route can be produced."""


class RouteProvider(Protocol):
    async def get_routes(
        self,
        origin: Coordinate,
        destination: Coordinate,
        *,
        max_paths: int = 3,
    ) -> list[Route]: ...


class RoutePlanningService:
    """Generate pedestrian routes through the configured routing provider."""

    def __init__(
        self,
        adapter: RouteProvider,
        shadow_provider: SegmentShadowProvider | None = None,
    ) -> None:
        self._adapter = adapter
        self._shadow_provider = shadow_provider

    async def plan(self, request: RouteRequest) -> RouteResponse:
        provider_routes = await self._adapter.get_routes(
            request.origin,
            request.destination,
        )
        if not provider_routes:
            raise RoutePlanningError("No pedestrian route was returned by the routing provider")
        routes: list[Route] = []
        coverages: dict[str, RouteShadeCoverage] = {}
        for route in provider_routes:
            segments = _segments_for_route(route)
            if self._shadow_provider is None:
                shadows = []
            else:
                timing = calculate_segment_arrival_times(route, segments, request)
                shadows = await map_shadows_to_segments(
                    segments,
                    timing,
                    self._shadow_provider,
                )
            coverage = calculate_route_shade_coverage(segments, shadows)
            routes.append(attach_route_shade_coverage(route, coverage, segments, shadows))
            coverages[route.id] = coverage
        recommended_route, alternatives = select_recommended_route(
            routes,
            coverages,
            request.shade_preference,
        )
        return RouteResponse(
            recommended_route=recommended_route,
            alternatives=alternatives,
        )


def _segments_for_route(route: Route) -> list[RouteSegment]:
    """Segment the geometry and scale intervals to provider distance metrics."""
    segments = segment_route_geometry(route.geometry)
    geometry_distance = segments[-1].end_distance_m
    if geometry_distance <= 0:
        raise RoutePlanningError("Route geometry has no measurable distance")
    distance_scale = route.distance_m / geometry_distance
    return [
        segment.model_copy(
            update={
                "distance_m": segment.distance_m * distance_scale,
                "start_distance_m": segment.start_distance_m * distance_scale,
                "end_distance_m": segment.end_distance_m * distance_scale,
            }
        )
        for segment in segments
    ]
