"""ShadeMap adapter for time-specific geographic shadow information."""

from typing import Any

import httpx

from api.core.config import Settings
from api.schemas.shadows import ShadowRequest, ShadowResponse
from api.services.shadow_processing import (
    ShadowResponseProcessingError,
    process_shademap_response,
)


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
        """Return shadow information available for a viewport and UTC time."""
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

        if not isinstance(payload, dict):
            raise ShadeMapResponseError("ShadeMap returned an invalid response object")
        if response.is_error:
            raise ShadeMapRequestError(self._error_message(response.status_code, payload))

        try:
            return process_shademap_response(payload, request)
        except ShadowResponseProcessingError as error:
            raise ShadeMapResponseError("ShadeMap returned invalid shadow information") from error

    async def _request(
        self,
        params: tuple[tuple[str, str], ...],
    ) -> httpx.Response:
        url = self._settings.shademap_base_url.rstrip("/") + self._SHADOWS_PATH
        if self._client is not None:
            return await self._client.get(
                url,
                params=params,
                timeout=self._settings.external_request_timeout_seconds,
            )

        async with httpx.AsyncClient(
            timeout=self._settings.external_request_timeout_seconds
        ) as client:
            return await client.get(url, params=params)

    @staticmethod
    def _error_message(status_code: int, payload: dict[str, Any]) -> str:
        message = payload.get("message") or payload.get("error")
        detail = message if isinstance(message, str) else "ShadeMap rejected the request"
        return f"ShadeMap request failed with status {status_code}: {detail}"
