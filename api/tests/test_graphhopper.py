from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest

from api.core.config import Settings
from api.integrations.graphhopper import (
    GraphHopperAdapter,
    GraphHopperConfigurationError,
    GraphHopperNoRouteError,
    GraphHopperRequestError,
    GraphHopperResponseError,
)
from api.schemas.routes import Coordinate


def graphhopper_response() -> dict[str, Any]:
    return {
        "paths": [
            {
                "distance": 1250.5,
                "time": 900000,
                "points": {
                    "type": "LineString",
                    "coordinates": [[-74.0, 40.7], [-73.99, 40.71]],
                },
            }
        ]
    }


def graphhopper_alternatives_response() -> dict[str, Any]:
    response = graphhopper_response()
    response["paths"].append(
        {
            "distance": 1450,
            "time": 1020000,
            "points": {
                "type": "LineString",
                "coordinates": [[-74.0, 40.7], [-74.01, 40.72], [-73.99, 40.71]],
            },
        }
    )
    return response


@pytest.fixture
async def graphhopper_client() -> AsyncIterator[httpx.AsyncClient]:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/route"
        assert request.url.params.get_list("point") == ["40.7,-74.0", "40.71,-73.99"]
        assert request.url.params["profile"] == "foot"
        assert request.url.params["algorithm"] == "alternative_route"
        assert request.url.params["points_encoded"] == "false"
        return httpx.Response(200, json=graphhopper_response())

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://graphhopper.test",
    ) as client:
        yield client


@pytest.mark.anyio
async def test_adapter_normalizes_graphhopper_routes(
    graphhopper_client: httpx.AsyncClient,
) -> None:
    adapter = GraphHopperAdapter(
        Settings(
            graphhopper_base_url="https://graphhopper.test",
            graphhopper_api_key="test-key",
        ),
        graphhopper_client,
    )

    routes = await adapter.get_routes(
        Coordinate(latitude=40.7, longitude=-74.0),
        Coordinate(latitude=40.71, longitude=-73.99),
    )

    assert routes[0].id == "graphhopper-1"
    assert routes[0].distance_m == 1250.5
    assert routes[0].duration_s == 900
    assert routes[0].geometry.coordinates == [(-74.0, 40.7), (-73.99, 40.71)]


@pytest.mark.anyio
async def test_adapter_returns_available_alternative_routes() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["algorithm"] == "alternative_route"
        assert request.url.params["alternative_route.max_paths"] == "3"
        return httpx.Response(200, json=graphhopper_alternatives_response())

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://graphhopper.test",
    ) as client:
        adapter = GraphHopperAdapter(
            Settings(graphhopper_api_key="test-key"),
            client,
        )

        routes = await adapter.get_routes(
            Coordinate(latitude=40.7, longitude=-74.0),
            Coordinate(latitude=40.71, longitude=-73.99),
        )

    assert [route.id for route in routes] == ["graphhopper-1", "graphhopper-2"]
    assert routes[0].geometry.coordinates != routes[1].geometry.coordinates
    assert routes[1].distance_m == 1450
    assert routes[1].duration_s == 1020


@pytest.mark.anyio
async def test_adapter_requires_api_key(graphhopper_client: httpx.AsyncClient) -> None:
    adapter = GraphHopperAdapter(Settings.model_validate({}), graphhopper_client)

    with pytest.raises(GraphHopperConfigurationError, match="GRAPHHOPPER_API_KEY"):
        await adapter.get_routes(
            Coordinate(latitude=40.7, longitude=-74.0),
            Coordinate(latitude=40.71, longitude=-73.99),
        )


@pytest.mark.anyio
async def test_adapter_handles_provider_errors() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"message": "Too many requests"})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://graphhopper.test",
    ) as client:
        adapter = GraphHopperAdapter(
            Settings(graphhopper_api_key="test-key"),
            client,
        )

        with pytest.raises(GraphHopperRequestError, match="Too many requests"):
            await adapter.get_routes(
                Coordinate(latitude=40.7, longitude=-74.0),
                Coordinate(latitude=40.71, longitude=-73.99),
            )


@pytest.mark.anyio
async def test_adapter_rejects_malformed_provider_response() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"paths": [{"distance": 10}]})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://graphhopper.test",
    ) as client:
        adapter = GraphHopperAdapter(Settings(graphhopper_api_key="test-key"), client)

        with pytest.raises(GraphHopperResponseError, match="invalid route response"):
            await adapter.get_routes(
                Coordinate(latitude=40.7, longitude=-74.0),
                Coordinate(latitude=40.71, longitude=-73.99),
            )


@pytest.mark.anyio
async def test_adapter_reports_when_no_route_is_available() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"paths": []})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://graphhopper.test",
    ) as client:
        adapter = GraphHopperAdapter(Settings(graphhopper_api_key="test-key"), client)

        with pytest.raises(GraphHopperNoRouteError, match="could not generate"):
            await adapter.get_routes(
                Coordinate(latitude=40.7, longitude=-74.0),
                Coordinate(latitude=40.71, longitude=-73.99),
            )
