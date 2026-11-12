from datetime import UTC, datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from api.schemas.routes import Coordinate, CoverageConfidence, ShadeClassification
from api.schemas.shadows import (
    ShadowRequest,
    ShadowResponse,
    ShadowSample,
    ShadowViewport,
)


def test_shadow_request_accepts_utc_viewport_time() -> None:
    request = ShadowRequest(
        viewport=ShadowViewport(west=-74.1, south=40.6, east=-73.9, north=40.8),
        requested_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
    )

    assert request.viewport.west == -74.1
    assert request.requested_time.tzinfo is UTC


def test_shadow_viewport_rejects_invalid_bounds() -> None:
    with pytest.raises(ValidationError, match="west must be less than east"):
        ShadowViewport(west=10, south=40, east=10, north=41)

    with pytest.raises(ValidationError, match="south must be less than north"):
        ShadowViewport(west=10, south=41, east=11, north=40)


def test_shadow_request_rejects_non_utc_time() -> None:
    with pytest.raises(ValidationError, match="must be expressed in UTC"):
        ShadowRequest(
            viewport=ShadowViewport(west=-74.1, south=40.6, east=-73.9, north=40.8),
            requested_time=datetime(2026, 6, 1, 12, 0, tzinfo=timezone(timedelta(hours=1))),
        )


def test_shadow_response_preserves_unknown_reason_and_confidence() -> None:
    response = ShadowResponse(
        viewport=ShadowViewport(west=-74.1, south=40.6, east=-73.9, north=40.8),
        requested_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
        coverage_confidence=CoverageConfidence.PARTIAL,
        samples=[
            ShadowSample(
                location=Coordinate(latitude=40.7, longitude=-74.0),
                classification=ShadeClassification.CONFIRMED_SHADE,
                evaluated_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
            ),
            ShadowSample(
                location=Coordinate(latitude=40.71, longitude=-74.01),
                classification=ShadeClassification.UNKNOWN,
                evaluated_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
                unknown_reason="shadow layer data was unavailable",
            ),
        ],
    )

    assert response.coverage_confidence is CoverageConfidence.PARTIAL
    assert response.samples[0].classification is ShadeClassification.CONFIRMED_SHADE
    assert response.samples[1].unknown_reason == "shadow layer data was unavailable"


def test_unknown_shadow_sample_requires_reason() -> None:
    with pytest.raises(ValidationError, match="unknown_reason is required"):
        ShadowSample(
            location=Coordinate(latitude=40.7, longitude=-74.0),
            classification=ShadeClassification.UNKNOWN,
            evaluated_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
        )
