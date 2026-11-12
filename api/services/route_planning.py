"""Pedestrian route planning service."""

from typing import Protocol

from api.schemas.routes import Coordinate, Route, RouteRequest, RouteResponse


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
        routes = await self._adapter.get_routes(
            request.origin,
            request.destination,
        )
        if not routes:
            raise RoutePlanningError("No pedestrian route was returned by the routing provider")
        return RouteResponse(
            recommended_route=routes[0],
            alternatives=routes[1:],
        )
