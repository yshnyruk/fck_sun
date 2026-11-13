"""Retrieve normalized shadow information for a requested map viewport."""

from typing import Protocol

from api.schemas.shadows import ShadowRequest, ShadowResponse


class ViewportShadowProvider(Protocol):
    async def get_shadows(self, request: ShadowRequest) -> ShadowResponse: ...


class ViewportShadowService:
    """Coordinate viewport shadow requests through a configured provider."""

    def __init__(self, provider: ViewportShadowProvider) -> None:
        self._provider = provider

    async def get_shadows(self, request: ShadowRequest) -> ShadowResponse:
        """Return the provider's normalized, time-specific viewport shadow data."""
        return await self._provider.get_shadows(request)
