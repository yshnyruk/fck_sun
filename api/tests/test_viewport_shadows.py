import asyncio
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from api.api.routes import get_viewport_shadow_service
from api.main import app
from api.schemas.routes import CoverageConfidence, ShadeClassification
from api.schemas.shadows import ShadowRequest, ShadowResponse, ShadowSample
from api.services.viewport_shadows import ViewportShadowService


class FakeShadowProvider:
    def __init__(self) -> None:
        self.request: ShadowRequest | None = None

    async def get_shadows(self, request: ShadowRequest) -> ShadowResponse:
        self.request = request
        return ShadowResponse(
            viewport=request.viewport,
            requested_time=request.requested_time,
            coverage_confidence=CoverageConfidence.PARTIAL,
            samples=[
                ShadowSample(
                    location={"latitude": 40.7, "longitude": -74.0},
                    classification=ShadeClassification.UNKNOWN,
                    evaluated_time=request.requested_time,
                    unknown_reason="provider data unavailable at this location",
                )
            ],
        )


def test_viewport_shadow_service_forwards_request_without_changing_data() -> None:
    provider = FakeShadowProvider()
    service = ViewportShadowService(provider)
    request = ShadowRequest(
        viewport={"west": -74.1, "south": 40.6, "east": -73.9, "north": 40.8},
        requested_time=datetime(2026, 6, 1, 12, tzinfo=UTC),
    )

    result = asyncio.run(service.get_shadows(request))

    assert provider.request == request
    assert result.coverage_confidence is CoverageConfidence.PARTIAL
    assert result.samples[0].classification is ShadeClassification.UNKNOWN
    assert result.samples[0].data_available is False


def test_shadows_endpoint_returns_viewport_data_and_requested_time() -> None:
    provider = FakeShadowProvider()
    app.dependency_overrides[get_viewport_shadow_service] = lambda: ViewportShadowService(
        provider
    )
    try:
        response = TestClient(app).get(
            "/api/v1/shadows",
            params={
                "west": -74.1,
                "south": 40.6,
                "east": -73.9,
                "north": 40.8,
                "time": "2026-06-01T12:00:00Z",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["coverage_confidence"] == "partial"
    assert payload["requested_time"] == "2026-06-01T12:00:00Z"
    assert payload["samples"][0]["classification"] == "unknown"
    assert payload["samples"][0]["data_available"] is False
    assert provider.request is not None
    assert provider.request.viewport.west == -74.1


def test_shadows_endpoint_rejects_invalid_bounds_and_non_utc_time() -> None:
    client = TestClient(app)
    base = {
        "west": -74.1,
        "south": 40.6,
        "east": -73.9,
        "north": 40.8,
        "time": "2026-06-01T12:00:00Z",
    }

    invalid_bounds = client.get(
        "/api/v1/shadows", params={**base, "west": -73.9}
    )
    non_utc_time = client.get(
        "/api/v1/shadows", params={**base, "time": "2026-06-01T14:00:00+02:00"}
    )

    assert invalid_bounds.status_code == 422
    assert non_utc_time.status_code == 422
