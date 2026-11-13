import pytest
from fastapi.testclient import TestClient

from api.api.routes import get_route_planning_service
from api.integrations.graphhopper import GraphHopperNoRouteError, GraphHopperRequestError
from api.main import app
from api.schemas.routes import (
    Coordinate,
    CoverageConfidence,
    LineStringGeometry,
    Route,
    RouteRequest,
    RouteResponse,
    ShadeClassification,
    ShadeEstimate,
)
from api.schemas.shadows import ShadowRequest, ShadowResponse, ShadowSample
from api.services.route_planning import RoutePlanningError, RoutePlanningService


def build_route(
    route_id: str,
    distance_m: float,
    coordinates: list[tuple[float, float]] | None = None,
) -> Route:
    return Route(
        id=route_id,
        geometry=LineStringGeometry(
            coordinates=coordinates or [(-74.0, 40.7), (-73.99, 40.71)],
        ),
        distance_m=distance_m,
        duration_s=900,
        coverage_confidence=CoverageConfidence.INSUFFICIENT,
    )


@pytest.mark.anyio
async def test_route_planning_service_returns_recommended_route_and_alternatives() -> None:
    class StubAdapter:
        async def get_routes(
            self,
            origin: Coordinate,
            destination: Coordinate,
            *,
            max_paths: int = 3,
        ) -> list[Route]:
            assert origin.latitude == 40.7
            assert destination.longitude == -73.99
            return [build_route("route-1", 1250), build_route("route-2", 1400)]

    response = await RoutePlanningService(StubAdapter()).plan(
        RouteRequest(
            origin=Coordinate(latitude=40.7, longitude=-74.0),
            destination=Coordinate(latitude=40.71, longitude=-73.99),
        )
    )

    assert response.recommended_route.id == "route-1"
    assert response.alternatives[0].id == "route-2"
    assert response.recommended_route.score is not None
    assert response.alternatives[0].score is not None
    assert response.recommended_route.shade is not None
    assert response.recommended_route.shade.shade_coverage_percent is None
    assert response.recommended_route.shade.unknown_distance_m == 1250
    assert response.recommended_route.shade.segments
    assert response.alternatives[0].shade is not None
    assert response.alternatives[0].shade.shade_coverage_percent is None
    assert response.recommended_route.coverage_confidence is CoverageConfidence.INSUFFICIENT


@pytest.mark.anyio
async def test_route_planning_discards_unverified_provider_shade_estimates() -> None:
    class StubAdapter:
        async def get_routes(
            self,
            origin: Coordinate,
            destination: Coordinate,
            *,
            max_paths: int = 3,
        ) -> list[Route]:
            route = build_route("route-without-shade-data", 1250)
            route.shade = ShadeEstimate(
                shade_coverage_percent=100,
                classified_distance_m=1250,
                unknown_distance_m=0,
            )
            route.coverage_confidence = CoverageConfidence.HIGH
            return [route]

    response = await RoutePlanningService(StubAdapter()).plan(
        RouteRequest(
            origin=Coordinate(latitude=40.7, longitude=-74.0),
            destination=Coordinate(latitude=40.71, longitude=-73.99),
        )
    )

    assert response.recommended_route.id == "route-without-shade-data"
    assert response.recommended_route.distance_m == 1250
    assert response.recommended_route.duration_s == 900
    assert response.recommended_route.shade is not None
    assert response.recommended_route.shade.shade_coverage_percent is None
    assert response.recommended_route.shade.unknown_distance_m == 1250
    assert response.recommended_route.coverage_confidence is CoverageConfidence.INSUFFICIENT


@pytest.mark.anyio
async def test_route_planning_attaches_time_aware_shade_partitions() -> None:
    class StubAdapter:
        async def get_routes(
            self,
            origin: Coordinate,
            destination: Coordinate,
            *,
            max_paths: int = 3,
        ) -> list[Route]:
            return [build_route("route-with-shade", 1250)]

    class StubShadeProvider:
        async def get_shadows(self, request: ShadowRequest) -> ShadowResponse:
            latitude = (request.viewport.south + request.viewport.north) / 2
            longitude = (request.viewport.west + request.viewport.east) / 2
            return ShadowResponse(
                viewport=request.viewport,
                requested_time=request.requested_time,
                coverage_confidence=CoverageConfidence.HIGH,
                samples=[
                    ShadowSample(
                        location=Coordinate(latitude=latitude, longitude=longitude),
                        classification=ShadeClassification.CONFIRMED_SHADE,
                        evaluated_time=request.requested_time,
                    )
                ],
            )

    response = await RoutePlanningService(StubAdapter(), StubShadeProvider()).plan(
        RouteRequest(
            origin=Coordinate(latitude=40.7, longitude=-74.0),
            destination=Coordinate(latitude=40.71, longitude=-73.99),
        )
    )

    route = response.recommended_route
    assert route.shade is not None
    assert route.shade.shade_coverage_percent == 100
    assert route.shade.unknown_distance_m == 0
    assert len(route.shade.segments) > 1
    assert all(
        segment.classification is ShadeClassification.CONFIRMED_SHADE
        for segment in route.shade.segments
    )
    assert route.coverage_confidence is CoverageConfidence.HIGH


@pytest.mark.anyio
async def test_route_planning_service_rejects_empty_provider_result() -> None:
    class StubAdapter:
        async def get_routes(
            self,
            origin: Coordinate,
            destination: Coordinate,
            *,
            max_paths: int = 3,
        ) -> list[Route]:
            return []

    with pytest.raises(RoutePlanningError, match="No pedestrian route"):
        await RoutePlanningService(StubAdapter()).plan(
            RouteRequest(
                origin=Coordinate(latitude=40.7, longitude=-74.0),
                destination=Coordinate(latitude=40.71, longitude=-73.99),
            )
        )


def test_routes_endpoint_returns_geometry_distance_and_duration() -> None:
    class StubService:
        async def plan(self, request: RouteRequest) -> RouteResponse:
            return RouteResponse(
                recommended_route=build_route("route-1", 1250),
                alternatives=[
                    build_route(
                        "route-2",
                        1400,
                        [(-74.0, 40.7), (-74.01, 40.72), (-73.99, 40.71)],
                    )
                ],
            )

    app.dependency_overrides[get_route_planning_service] = lambda: StubService()
    try:
        response = TestClient(app).post(
            "/api/v1/routes",
            json={
                "origin": {"latitude": 40.7, "longitude": -74.0},
                "destination": {"latitude": 40.71, "longitude": -73.99},
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    route = response.json()["recommended_route"]
    assert route["geometry"] == {
        "type": "LineString",
        "coordinates": [[-74.0, 40.7], [-73.99, 40.71]],
    }
    assert route["distance_m"] == 1250
    assert route["duration_s"] == 900
    alternative = response.json()["alternatives"][0]
    assert alternative["id"] == "route-2"
    assert alternative["geometry"]["coordinates"] != route["geometry"]["coordinates"]


def test_routes_endpoint_validates_coordinates() -> None:
    response = TestClient(app).post(
        "/api/v1/routes",
        json={
            "origin": {"latitude": 91, "longitude": -74.0},
            "destination": {"latitude": 40.71, "longitude": -73.99},
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_routes_endpoint_handles_unavailable_routing_service() -> None:
    class StubService:
        async def plan(self, request: RouteRequest) -> RouteResponse:
            raise GraphHopperRequestError("routing service unavailable")

    app.dependency_overrides[get_route_planning_service] = lambda: StubService()
    try:
        response = TestClient(app).post(
            "/api/v1/routes",
            json={
                "origin": {"latitude": 40.7, "longitude": -74.0},
                "destination": {"latitude": 40.71, "longitude": -73.99},
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "BAD_GATEWAY",
            "message": "Route planning provider is unavailable.",
            "details": None,
        }
    }


def test_routes_endpoint_handles_unavailable_route() -> None:
    class StubService:
        async def plan(self, request: RouteRequest) -> RouteResponse:
            raise GraphHopperNoRouteError("no route")

    app.dependency_overrides[get_route_planning_service] = lambda: StubService()
    try:
        response = TestClient(app).post(
            "/api/v1/routes",
            json={
                "origin": {"latitude": 40.7, "longitude": -74.0},
                "destination": {"latitude": 40.71, "longitude": -73.99},
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "UNPROCESSABLE_ENTITY",
            "message": "No pedestrian route could be generated for these coordinates.",
            "details": None,
        }
    }
