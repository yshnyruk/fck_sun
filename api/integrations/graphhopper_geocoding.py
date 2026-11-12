"""GraphHopper geocoding adapter."""

from collections.abc import Mapping
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from api.core.config import Settings
from api.schemas.routes import Coordinate
from api.schemas.search import LocationSearchResult


class GraphHopperGeocodingError(Exception):
    """Base error for failures communicating with GraphHopper geocoding."""


class GraphHopperGeocodingConfigurationError(GraphHopperGeocodingError):
    """Raised when geocoding cannot be called with the current configuration."""


class GraphHopperGeocodingRequestError(GraphHopperGeocodingError):
    """Raised when GraphHopper geocoding cannot be reached or rejects a request."""


class GraphHopperGeocodingResponseError(GraphHopperGeocodingError):
    """Raised when GraphHopper returns an unusable geocoding response."""


class GraphHopperPoint(BaseModel):
    model_config = ConfigDict(extra="ignore")

    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class GraphHopperHit(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=1)
    point: GraphHopperPoint
    country: str | None = None
    city: str | None = None
    street: str | None = None
    housenumber: str | None = None

    def to_result(self) -> LocationSearchResult:
        address_parts = [
            self.housenumber,
            self.street,
            self.city,
            self.country,
        ]
        label = ", ".join(part for part in address_parts if part and part != self.name)
        return LocationSearchResult(
            name=self.name,
            label=label or self.name,
            coordinate=Coordinate(latitude=self.point.lat, longitude=self.point.lng),
        )


class GraphHopperGeocodingResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    hits: list[GraphHopperHit]


class GraphHopperGeocodingAdapter:
    """Communicate with GraphHopper's geocoding endpoint."""

    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._client = client

    async def search(self, query: str, *, limit: int = 5) -> list[LocationSearchResult]:
        """Return normalized location matches for a free-text query."""
        if not self._settings.graphhopper_api_key:
            raise GraphHopperGeocodingConfigurationError(
                "GRAPHHOPPER_API_KEY must be configured before searching locations"
            )
        if not 1 <= limit <= 10:
            raise ValueError("limit must be between 1 and 10")

        params = (
            ("q", query),
            ("limit", str(limit)),
            ("key", self._settings.graphhopper_api_key),
        )
        try:
            response = await self._request(params)
        except httpx.RequestError as error:
            raise GraphHopperGeocodingRequestError(
                "GraphHopper geocoding request failed"
            ) from error

        try:
            payload = response.json()
        except ValueError as error:
            raise GraphHopperGeocodingResponseError(
                "GraphHopper geocoding returned invalid JSON"
            ) from error

        if not isinstance(payload, Mapping):
            raise GraphHopperGeocodingResponseError(
                "GraphHopper geocoding returned an invalid response object"
            )
        if response.is_error:
            raise GraphHopperGeocodingRequestError(
                self._error_message(response.status_code, payload)
            )

        try:
            result = GraphHopperGeocodingResponse.model_validate(payload)
        except ValidationError as error:
            raise GraphHopperGeocodingResponseError(
                "GraphHopper geocoding returned an invalid response"
            ) from error
        return [hit.to_result() for hit in result.hits]

    async def _request(
        self,
        params: tuple[tuple[str, str], ...],
    ) -> httpx.Response:
        url = self._settings.graphhopper_base_url + "/geocode"
        if self._client is not None:
            return await self._client.get(url, params=params)

        async with httpx.AsyncClient(
            timeout=self._settings.external_request_timeout_seconds
        ) as client:
            return await client.get(url, params=params)

    @staticmethod
    def _error_message(status_code: int, payload: Mapping[str, Any]) -> str:
        message = payload.get("message")
        detail = message if isinstance(message, str) else "GraphHopper rejected the search request"
        return f"GraphHopper geocoding request failed with status {status_code}: {detail}"
