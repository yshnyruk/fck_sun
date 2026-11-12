"""GraphHopper routing adapter."""

from collections.abc import Mapping
from typing import Any, Self

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from api.core.config import Settings
from api.schemas.routes import (
    Coordinate,
    CoverageConfidence,
    LineStringGeometry,
    Route,
)


class GraphHopperError(Exception):
    """Base error for failures communicating with GraphHopper."""


class GraphHopperConfigurationError(GraphHopperError):
    """Raised when GraphHopper cannot be called with the current configuration."""


class GraphHopperRequestError(GraphHopperError):
    """Raised when GraphHopper cannot be reached or rejects a request."""


class GraphHopperResponseError(GraphHopperError):
    """Raised when GraphHopper returns an unusable response."""


class GraphHopperNoRouteError(GraphHopperError):
    """Raised when GraphHopper cannot generate a route for the request."""


class GraphHopperGeometry(BaseModel):
    """The GeoJSON geometry returned by GraphHopper."""

    model_config = ConfigDict(extra="ignore")

    type: str
    coordinates: list[list[float]] = Field(min_length=2)

    @model_validator(mode="after")
    def validate_linestring(self) -> Self:
        if self.type != "LineString":
            raise ValueError("GraphHopper geometry must be a LineString")
        if any(len(coordinate) != 2 for coordinate in self.coordinates):
            raise ValueError("GraphHopper coordinates must contain longitude and latitude")
        return self


class GraphHopperPath(BaseModel):
    """A single route path in a GraphHopper response."""

    model_config = ConfigDict(extra="ignore")

    distance: float = Field(gt=0)
    time: float = Field(gt=0)
    points: GraphHopperGeometry


class GraphHopperResponse(BaseModel):
    """Validated subset of the GraphHopper route response."""

    model_config = ConfigDict(extra="ignore")

    paths: list[GraphHopperPath]


class GraphHopperAdapter:
    """Communicate with GraphHopper and normalize routes for the application."""

    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._client = client

    async def get_routes(
        self,
        origin: Coordinate,
        destination: Coordinate,
        *,
        max_paths: int = 3,
    ) -> list[Route]:
        """Return walking routes between two coordinates."""
        if not self._settings.graphhopper_api_key:
            raise GraphHopperConfigurationError(
                "GRAPHHOPPER_API_KEY must be configured before requesting routes"
            )
        if not 1 <= max_paths <= 5:
            raise ValueError("max_paths must be between 1 and 5")

        params: tuple[tuple[str, str], ...] = (
            ("point", f"{origin.latitude},{origin.longitude}"),
            ("point", f"{destination.latitude},{destination.longitude}"),
            ("profile", "foot"),
            ("points_encoded", "false"),
            ("instructions", "false"),
            ("alternative_route.max_paths", str(max_paths)),
            ("key", self._settings.graphhopper_api_key),
        )

        try:
            response = await self._request(params)
        except GraphHopperError:
            raise
        except httpx.RequestError as error:
            raise GraphHopperRequestError("GraphHopper request failed") from error

        try:
            payload = response.json()
        except ValueError as error:
            raise GraphHopperResponseError("GraphHopper returned invalid JSON") from error

        if not isinstance(payload, Mapping):
            raise GraphHopperResponseError("GraphHopper returned an invalid response object")

        if response.is_error:
            raise GraphHopperRequestError(self._error_message(response.status_code, payload))

        try:
            graphhopper_response = GraphHopperResponse.model_validate(payload)
        except ValidationError as error:
            raise GraphHopperResponseError(
                "GraphHopper returned an invalid route response"
            ) from error

        if not graphhopper_response.paths:
            raise GraphHopperNoRouteError(
                "GraphHopper could not generate a route for the requested coordinates"
            )

        return [
            self._to_route(path, index)
            for index, path in enumerate(graphhopper_response.paths, start=1)
        ]

    async def _request(self, params: tuple[tuple[str, str], ...]) -> httpx.Response:
        if self._client is not None:
            return await self._client.get(
                self._settings.graphhopper_base_url + "/route",
                params=params,
            )

        async with httpx.AsyncClient(
            timeout=self._settings.external_request_timeout_seconds
        ) as client:
            return await client.get(
                self._settings.graphhopper_base_url + "/route",
                params=params,
            )

    @staticmethod
    def _error_message(status_code: int, payload: Mapping[str, Any]) -> str:
        message = payload.get("message") or payload.get("hints")
        if isinstance(message, str):
            detail = message
        else:
            detail = "GraphHopper rejected the route request"
        return f"GraphHopper request failed with status {status_code}: {detail}"

    @staticmethod
    def _to_route(path: GraphHopperPath, index: int) -> Route:
        try:
            geometry = LineStringGeometry(
                coordinates=[
                    (coordinate[0], coordinate[1]) for coordinate in path.points.coordinates
                ]
            )
            return Route(
                id=f"graphhopper-{index}",
                geometry=geometry,
                distance_m=path.distance,
                duration_s=path.time / 1000,
                coverage_confidence=CoverageConfidence.INSUFFICIENT,
            )
        except ValidationError as error:
            raise GraphHopperResponseError(
                "GraphHopper returned a route with invalid geometry or measurements"
            ) from error
