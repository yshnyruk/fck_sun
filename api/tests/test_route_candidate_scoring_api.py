from fastapi.testclient import TestClient

from api.api.routes import get_route_candidate_service
from api.main import app
from api.schemas.routes import (
    CoverageConfidence,
    LineStringGeometry,
    Route,
    RouteResponse,
    ShadeClassification,
    ShadeEstimate,
    ShadeSegment,
)


def candidate(route_id: str, classification: str) -> dict[str, object]:
    return {
        "id": route_id,
        "geometry": {
            "type": "LineString",
            "coordinates": [[-74.0, 40.7], [-73.99, 40.7]],
        },
        "distance_m": 1000,
        "duration_s": 600,
        "score": None,
        "shade": {
            "shade_coverage_percent": None,
            "classified_distance_m": 0,
            "unknown_distance_m": 1000,
            "segments": [
                {
                    "start_distance_m": 0,
                    "end_distance_m": 1000,
                    "classification": classification,
                    "coverage_confidence": (
                        "partial" if classification != "unknown" else "insufficient"
                    ),
                }
            ],
        },
        "coverage_confidence": "insufficient",
    }


def test_route_score_endpoint_ranks_frontend_sampled_candidates() -> None:
    response = TestClient(app).post(
        "/api/v1/routes/score",
        json={
            "shade_preference": "full",
            "routes": [
                candidate("route-exposed", "confirmed_exposure"),
                candidate("route-shaded", "confirmed_shade"),
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["recommended_route"]["id"] == "route-shaded"
    assert payload["recommended_route"]["shade"]["shade_coverage_percent"] == 100


def test_route_score_endpoint_rejects_candidates_without_shade_segments() -> None:
    route = candidate("route-1", "unknown")
    route["shade"] = None
    response = TestClient(app).post(
        "/api/v1/routes/score",
        json={"shade_preference": "medium", "routes": [route]},
    )

    assert response.status_code == 422


def test_route_candidate_endpoint_does_not_require_a_shade_provider() -> None:
    route = Route(
        id="route-1",
        geometry=LineStringGeometry(coordinates=[(-74.0, 40.7), (-73.99, 40.7)]),
        distance_m=1000,
        duration_s=600,
        coverage_confidence=CoverageConfidence.INSUFFICIENT,
        shade=ShadeEstimate(
            shade_coverage_percent=None,
            classified_distance_m=0,
            unknown_distance_m=1000,
            segments=[
                ShadeSegment(
                    start_distance_m=0,
                    end_distance_m=1000,
                    classification=ShadeClassification.UNKNOWN,
                    coverage_confidence=CoverageConfidence.INSUFFICIENT,
                )
            ],
        ),
    )

    class CandidateService:
        async def plan(self, request: object) -> RouteResponse:
            return RouteResponse(recommended_route=route, alternatives=[])

    app.dependency_overrides[get_route_candidate_service] = lambda: CandidateService()
    try:
        response = TestClient(app).post(
            "/api/v1/routes/candidates",
            json={
                "origin": {"latitude": 40.7, "longitude": -74.0},
                "destination": {"latitude": 40.71, "longitude": -73.99},
                "shade_preference": "medium",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["recommended_route"]["id"] == "route-1"
