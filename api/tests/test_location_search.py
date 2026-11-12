from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from api.api.routes import get_location_search_service
from api.core.config import Settings
from api.integrations.graphhopper_geocoding import (
    GraphHopperGeocodingAdapter,
    GraphHopperGeocodingRequestError,
    GraphHopperGeocodingResponseError,
)
from api.main import app
from api.schemas.routes import Coordinate
from api.schemas.search import LocationSearchResult
from api.services.location_search import LocationSearchService


def geocoding_response() -> dict[str, Any]:
    return {
        "hits": [
            {
                "name": "Central Park",
                "country": "United States",
                "city": "New York",
                "point": {"lat": 40.7829, "lng": -73.9654},
            }
        ]
    }


@pytest.fixture
async def geocoding_client() -> AsyncIterator[httpx.AsyncClient]:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/geocode"
        assert request.url.params["q"] == "Central Park"
        assert request.url.params["limit"] == "5"
        return httpx.Response(200, json=geocoding_response())

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://graphhopper.test",
    ) as client:
        yield client


@pytest.mark.anyio
async def test_location_search_returns_normalized_matches(
    geocoding_client: httpx.AsyncClient,
) -> None:
    adapter = GraphHopperGeocodingAdapter(
        Settings(
            graphhopper_base_url="https://graphhopper.test",
            graphhopper_api_key="test-key",
        ),
        geocoding_client,
    )

    results = await LocationSearchService(adapter).search(" Central Park ")

    assert results[0].name == "Central Park"
    assert results[0].label == "New York, United States"
    assert results[0].coordinate.latitude == 40.7829
    assert results[0].coordinate.longitude == -73.9654


@pytest.mark.anyio
async def test_location_search_rejects_malformed_provider_response() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"hits": [{"name": "Missing point"}]})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://graphhopper.test",
    ) as client:
        adapter = GraphHopperGeocodingAdapter(
            Settings(graphhopper_api_key="test-key"),
            client,
        )

        with pytest.raises(GraphHopperGeocodingResponseError):
            await adapter.search("Missing point")


@pytest.mark.anyio
async def test_location_search_propagates_provider_errors() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"message": "Service unavailable"})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://graphhopper.test",
    ) as client:
        adapter = GraphHopperGeocodingAdapter(
            Settings(graphhopper_api_key="test-key"),
            client,
        )

        with pytest.raises(GraphHopperGeocodingRequestError, match="Service unavailable"):
            await adapter.search("New York")


def test_search_endpoint_returns_results() -> None:
    class StubService:
        async def search(self, query: str, *, limit: int = 5) -> list[LocationSearchResult]:
            assert query == "Central Park"
            assert limit == 3
            return [
                LocationSearchResult(
                    name="Central Park",
                    label="New York, United States",
                    coordinate=Coordinate(latitude=40.7829, longitude=-73.9654),
                )
            ]

    app.dependency_overrides[get_location_search_service] = lambda: StubService()
    try:
        response = TestClient(app).get("/api/v1/search?q=Central%20Park&limit=3")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {
                "name": "Central Park",
                "label": "New York, United States",
                "coordinate": {"latitude": 40.7829, "longitude": -73.9654},
            }
        ]
    }


def test_search_endpoint_returns_structured_provider_error() -> None:
    async def failing_search(
        self: object,
        _: str,
        *,
        limit: int = 5,
    ) -> list[LocationSearchResult]:
        raise GraphHopperGeocodingRequestError("provider unavailable")

    class StubService:
        search = failing_search

    app.dependency_overrides[get_location_search_service] = lambda: StubService()
    try:
        response = TestClient(app).get("/api/v1/search?q=Central%20Park")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "BAD_GATEWAY",
            "message": "Location search provider is unavailable.",
            "details": None,
        }
    }


def test_search_endpoint_validates_query_length() -> None:
    response = TestClient(app).get("/api/v1/search?q=x")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_search_endpoint_rejects_blank_query() -> None:
    response = TestClient(app).get("/api/v1/search?q=%20%20")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
