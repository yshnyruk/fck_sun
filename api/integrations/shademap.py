"""ShadeMap adapter for time-specific geographic shadow information."""

from collections.abc import Mapping
from typing import Any

import httpx
from pydantic import ValidationError

from api.core.config import Settings
from api.schemas.shadows import ShadowRequest, ShadowResponse


class ShadeMapError(Exception):
    """Base error for failures communicating with ShadeMap."""


class ShadeMapConfigurationError(ShadeMapError):
    """Raised when ShadeMap cannot be called with the current configuration."""


class ShadeMapRequestError(ShadeMapError):
    """Raised when ShadeMap cannot be reached or rejects a request."""


class ShadeMapResponseError(ShadeMapError):
    """Raised when ShadeMap returns unusable geographic shadow information."""


class ShadeMapAdapter:
    """Retrieve and normalize ShadeMap shadow data."""

    _SHADOWS_PATH = "/api/v1/shadows"

    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._client = client

    async def get_shadows(self, request: ShadowRequest) -> ShadowResponse:
        """Return the shadow information available for a viewport and UTC time."""
        if not self._settings.shademap_api_key:
            raise ShadeMapConfigurationError(
                "SHADEMAP_API_KEY must be configured before requesting shadow data"
            )

        params = (
            ("west", str(request.viewport.west)),
            ("south", str(request.viewport.south)),
            ("east", str(request.viewport.east)),
            ("north", str(request.viewport.north)),
            ("time", request.requested_time.isoformat()),
            ("key", self._settings.shademap_api_key),
        )

        try:
            response = await self._request(params)
        except httpx.RequestError as error:
            raise ShadeMapRequestError("ShadeMap request failed") from error

        try:
            payload = response.json()
        except ValueError as error:
            raise ShadeMapResponseError("ShadeMap returned invalid JSON") from error

        if not isinstance(payload, Mapping):
            raise ShadeMapResponseError("ShadeMap returned an invalid response object")
        if response.is_error:
            raise ShadeMapRequestError(self._error_message(response.status_code, payload))

        try:
            return self._to_shadow_response(payload, request)
        except ValidationError as error:
            raise ShadeMapResponseError(
                "ShadeMap returned invalid shadow information"
            ) from error

    async def _request(
        self,
        params: tuple[tuple[str, str], ...],
    ) -> httpx.Response:
        url = self._settings.shademap_base_url.rstrip("/") + self._SHADOWS_PATH
        if self._client is not None:
            return await self._client.get(url, params=params)

        async with httpx.AsyncClient(
            timeout=self._settings.external_request_timeout_seconds
        ) as client:
            return await client.get(url, params=params)

    @staticmethod
    def _to_shadow_response(
        payload: Mapping[str, Any],
        request: ShadowRequest,
    ) -> ShadowResponse:
        """Validate the provider payload while supplying request context if omitted."""
        data: dict[str, Any] = dict(payload)
        nested_data = data.get("data")
        if isinstance(nested_data, Mapping):
            data = dict(nested_data)

        data.setdefault("viewport", request.viewport.model_dump())
        data.setdefault("requested_time", request.requested_time)
        if "coverage_confidence" not in data and "coverage" in data:
            data["coverage_confidence"] = data["coverage"]
        if "samples" not in data and isinstance(data.get("features"), list):
            data["samples"] = ShadeMapAdapter._features_to_samples(
                data["features"], request
            )
        return ShadowResponse.model_validate(data)

    @staticmethod
    def _features_to_samples(
        features: list[Any],
        request: ShadowRequest,
    ) -> list[dict[str, Any]]:
        samples: list[dict[str, Any]] = []
        for feature in features:
            if not isinstance(feature, Mapping):
                continue
            geometry = feature.get("geometry")
            properties = feature.get("properties")
            if not isinstance(geometry, Mapping) or not isinstance(properties, Mapping):
                continue
            coordinates = geometry.get("coordinates")
            if (
                geometry.get("type") != "Point"
                or not isinstance(coordinates, list)
                or len(coordinates) != 2
            ):
                continue
            classification = properties.get("classification", properties.get("shade"))
            if classification == "shade":
                classification = "confirmed_shade"
            elif classification in {"sun", "exposure"}:
                classification = "confirmed_exposure"
            if not isinstance(classification, str):
                classification = "unknown"
            sample: dict[str, Any] = {
                "location": {
                    "longitude": coordinates[0],
                    "latitude": coordinates[1],
                },
                "classification": classification,
                "evaluated_time": properties.get("evaluated_time", request.requested_time),
            }
            if classification == "unknown":
                sample["unknown_reason"] = properties.get(
                    "unknown_reason", "ShadeMap did not classify this location"
                )
            samples.append(sample)
        return samples

    @staticmethod
    def _error_message(status_code: int, payload: Mapping[str, Any]) -> str:
        message = payload.get("message") or payload.get("error")
        detail = message if isinstance(message, str) else "ShadeMap rejected the request"
        return f"ShadeMap request failed with status {status_code}: {detail}"
