from datetime import UTC, datetime

import pytest

from api.schemas.routes import (
    Coordinate,
    CoverageConfidence,
    LineStringGeometry,
    ShadeClassification,
)
from api.schemas.segments import RouteSegment
from api.schemas.shadows import ShadowRequest, ShadowResponse, ShadowSample, ShadowViewport
from api.schemas.timing import RouteTiming, SegmentArrivalTime
from api.services.segment_shadow_mapping import (
    ShadowProviderError,
    map_shadows_to_segments,
)


def route_segments() -> list[RouteSegment]:
    return [
        RouteSegment(
            id="segment-1",
            geometry=LineStringGeometry(coordinates=[(-74.0, 40.0), (-73.99, 40.0)]),
            distance_m=100,
            start_distance_m=0,
            end_distance_m=100,
        ),
        RouteSegment(
            id="segment-2",
            geometry=LineStringGeometry(coordinates=[(-73.99, 40.0), (-73.98, 40.0)]),
            distance_m=100,
            start_distance_m=100,
            end_distance_m=200,
        ),
    ]


def route_timing() -> RouteTiming:
    return RouteTiming(
        departure_time=datetime(2026, 6, 1, 12, 0, tzinfo=UTC),
        expected_arrival_time=datetime(2026, 6, 1, 12, 10, tzinfo=UTC),
        segment_arrivals=[
            SegmentArrivalTime(
                segment_id="segment-1",
                distance_from_start_m=100,
                expected_arrival=datetime(2026, 6, 1, 12, 5, tzinfo=UTC),
            ),
            SegmentArrivalTime(
                segment_id="segment-2",
                distance_from_start_m=200,
                expected_arrival=datetime(2026, 6, 1, 12, 10, tzinfo=UTC),
            ),
        ],
    )


class StubProvider:
    def __init__(self, responses: list[ShadowResponse | Exception]) -> None:
        self.responses = responses
        self.requests: list[ShadowRequest] = []

    async def get_shadows(self, request: ShadowRequest) -> ShadowResponse:
        self.requests.append(request)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def response(
    classification: ShadeClassification,
    timestamp: datetime,
) -> ShadowResponse:
    sample = ShadowSample(
        location=Coordinate(latitude=40.0, longitude=-74.0),
        classification=classification,
        evaluated_time=timestamp,
        unknown_reason="no data" if classification is ShadeClassification.UNKNOWN else None,
    )
    return ShadowResponse(
        viewport=ShadowViewport(west=-74.1, south=39.9, east=-73.9, north=40.1),
        requested_time=timestamp,
        coverage_confidence=CoverageConfidence.HIGH,
        samples=[sample],
    )


@pytest.mark.anyio
async def test_maps_each_response_to_the_correct_segment_and_time() -> None:
    provider = StubProvider(
        [
            response(ShadeClassification.CONFIRMED_SHADE, datetime(2026, 6, 1, 12, 5, tzinfo=UTC)),
            response(
                ShadeClassification.CONFIRMED_EXPOSURE,
                datetime(2026, 6, 1, 12, 10, tzinfo=UTC),
            ),
        ]
    )

    mapped = await map_shadows_to_segments(route_segments(), route_timing(), provider)

    assert [item.segment_id for item in mapped] == ["segment-1", "segment-2"]
    assert [item.classification for item in mapped] == [
        ShadeClassification.CONFIRMED_SHADE,
        ShadeClassification.CONFIRMED_EXPOSURE,
    ]
    assert [item.expected_arrival for item in mapped] == [
        datetime(2026, 6, 1, 12, 5, tzinfo=UTC),
        datetime(2026, 6, 1, 12, 10, tzinfo=UTC),
    ]
    assert provider.requests[0].requested_time == mapped[0].expected_arrival


@pytest.mark.anyio
async def test_provider_failure_becomes_unknown_for_only_that_segment() -> None:
    provider = StubProvider(
        [
            ShadowProviderError("provider unavailable"),
            response(ShadeClassification.CONFIRMED_SHADE, datetime(2026, 6, 1, 12, 10, tzinfo=UTC)),
        ]
    )

    mapped = await map_shadows_to_segments(route_segments(), route_timing(), provider)

    assert mapped[0].classification is ShadeClassification.UNKNOWN
    assert mapped[0].data_available is False
    assert mapped[1].classification is ShadeClassification.CONFIRMED_SHADE


@pytest.mark.anyio
async def test_empty_provider_response_becomes_unknown() -> None:
    provider = StubProvider(
        [
            response(ShadeClassification.UNKNOWN, datetime(2026, 6, 1, 12, 5, tzinfo=UTC)),
            response(ShadeClassification.UNKNOWN, datetime(2026, 6, 1, 12, 10, tzinfo=UTC)),
        ]
    )

    mapped = await map_shadows_to_segments(route_segments(), route_timing(), provider)

    assert all(item.classification is ShadeClassification.UNKNOWN for item in mapped)
    assert all(item.data_available is False for item in mapped)


@pytest.mark.anyio
async def test_duplicate_segment_location_and_time_uses_cached_response() -> None:
    segments = [route_segments()[0], route_segments()[0].model_copy(update={"id": "segment-2"})]
    timing = route_timing().model_copy(
        update={
            "segment_arrivals": [
                route_timing().segment_arrivals[0],
                route_timing().segment_arrivals[0].model_copy(update={"segment_id": "segment-2"}),
            ]
        }
    )
    provider = StubProvider(
        [response(ShadeClassification.CONFIRMED_SHADE, datetime(2026, 6, 1, 12, 5, tzinfo=UTC))]
    )

    mapped = await map_shadows_to_segments(segments, timing, provider)

    assert len(mapped) == 2
    assert len(provider.requests) == 1
