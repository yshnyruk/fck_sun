"""Pedestrian route planning service."""

from typing import Protocol

from api.schemas.route_coverage import RouteShadeCoverage
from api.schemas.routes import (
    Coordinate,
    CoverageConfidence,
    Route,
    RouteRequest,
    RouteResponse,
)
from api.services.route_scoring import select_recommended_route


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

    def __init__(self, adapter: RouteProvider) -> None:
        self._adapter = adapter

    async def plan(self, request: RouteRequest) -> RouteResponse:
        provider_routes = await self._adapter.get_routes(
            request.origin,
            request.destination,
        )
        if not provider_routes:
            raise RoutePlanningError("No pedestrian route was returned by the routing provider")
        routes = [_route_without_unsupported_shade(route) for route in provider_routes]
        coverages = {
            route.id: _coverage_for_route(route)
            for route in routes
        }
        recommended_route, alternatives = select_recommended_route(
            routes,
            coverages,
            request.shade_preference,
        )
        return RouteResponse(
            recommended_route=recommended_route,
            alternatives=alternatives,
        )


def _route_without_unsupported_shade(route: Route) -> Route:
    """Keep pedestrian metrics while removing unverified shade estimates."""
    return route.model_copy(
        update={
            "shade": None,
            "coverage_confidence": CoverageConfidence.INSUFFICIENT,
        }
    )


def _coverage_for_route(route: Route) -> RouteShadeCoverage:
    """Represent unavailable provider shade data without inferring exposure."""
    return RouteShadeCoverage(
        total_distance_m=route.distance_m,
        shaded_distance_m=0,
        exposed_distance_m=0,
        unknown_distance_m=route.distance_m,
        shaded_percentage=0,
        exposed_percentage=0,
        unknown_percentage=100,
        usable_percentage=0,
        coverage_confidence=CoverageConfidence.INSUFFICIENT,
    )
