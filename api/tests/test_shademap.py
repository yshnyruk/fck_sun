from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from api.core.config import Settings
from api.integrations.shademap import (
    ShadeMapAdapter,
    ShadeMapConfigurationError,
    ShadeMapRequestError,
    ShadeMapResponseError,
)
from api.schemas.routes import CoverageConfidence
from api.schemas.shadows import ShadowRequest, ShadowViewport


def shadow_request() -> ShadowRequest:
    return ShadowRequest(
        viewport=ShadowViewport(west=-74.1, south=40.6, east=-73.9, north=40.8),
        requested_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
    )


def shademap_response() -> dict[str, Any]:
    request = shadow_request()
    return {
        "coverage_confidence": "partial",
        "viewport": request.viewport.model_dump(),
        "requested_time": request.requested_time.isoformat(),
        "samples": [
            {
                "location": {"latitude": 40.7, "longitude": -74.0},
                "classification": "confirmed_shade",
                "evaluated_time": request.requested_time.isoformat(),
            },
            {
                "location": {"latitude": 40.71, "longitude": -74.01},
                "classification": "unknown",
                "evaluated_time": request.requested_time.isoformat(),
                "unknown_reason": "vegetation data unavailable",
            },
        ],
    }


@pytest.fixture
async def shademap_client() -> AsyncIterator[httpx.AsyncClient]:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/shadows"
        assert request.url.params["west"] == "-74.1"
        assert request.url.params["time"] == "2026-06-01T12:00:00+00:00"
        assert request.url.params["key"] == "test-key"
        return httpx.Response(200, json=shademap_response())

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://shademap.test",
    ) as client:
        yield client


@pytest.mark.anyio
async def test_adapter_normalizes_shademap_shadow_information(
    shademap_client: httpx.AsyncClient,
) -> None:
    adapter = ShadeMapAdapter(
        Settings(shademap_base_url="https://shademap.test", shademap_api_key="test-key"),
        shademap_client,
    )

    response = await adapter.get_shadows(shadow_request())

    assert response.coverage_confidence is CoverageConfidence.PARTIAL
    assert response.samples[0].location.latitude == 40.7
    assert response.samples[1].unknown_reason == "vegetation data unavailable"


@pytest.mark.anyio
async def test_adapter_uses_request_context_for_nested_provider_payload() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": {
                    "coverage_confidence": "high",
                    "samples": [],
                }
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://shademap.test",
    ) as client:
        adapter = ShadeMapAdapter(Settings(shademap_api_key="test-key"), client)
        response = await adapter.get_shadows(shadow_request())

    assert response.coverage_confidence is CoverageConfidence.HIGH
    assert response.viewport == shadow_request().viewport


@pytest.mark.anyio
async def test_adapter_requires_api_key() -> None:
    adapter = ShadeMapAdapter(Settings.model_validate({}))

    with pytest.raises(ShadeMapConfigurationError, match="SHADEMAP_API_KEY"):
        await adapter.get_shadows(shadow_request())


@pytest.mark.anyio
async def test_adapter_handles_provider_errors() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"message": "service unavailable"})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://shademap.test",
    ) as client:
        adapter = ShadeMapAdapter(Settings(shademap_api_key="test-key"), client)

        with pytest.raises(ShadeMapRequestError, match="service unavailable"):
            await adapter.get_shadows(shadow_request())


@pytest.mark.anyio
async def test_adapter_rejects_malformed_provider_response() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"samples": []})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://shademap.test",
    ) as client:
        adapter = ShadeMapAdapter(Settings(shademap_api_key="test-key"), client)

        with pytest.raises(ShadeMapResponseError, match="invalid shadow information"):
            await adapter.get_shadows(shadow_request())
