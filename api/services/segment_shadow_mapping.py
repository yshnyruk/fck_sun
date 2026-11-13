"""Associate time-aware shadow responses with ordered route segments."""

import asyncio
from datetime import UTC, datetime
from typing import Protocol

from api.schemas.routes import Coordinate, CoverageConfidence, ShadeClassification
from api.schemas.segment_shadows import SegmentShadow
from api.schemas.segments import RouteSegment
from api.schemas.shadows import ShadowRequest, ShadowResponse, ShadowViewport
from api.schemas.timing import RouteTiming


class SegmentShadowProvider(Protocol):
    async def get_shadows(self, request: ShadowRequest) -> ShadowResponse: ...


class ShadowProviderError(Exception):
    """Base error a shadow provider may expose to the mapping layer."""


class SegmentShadowMappingError(Exception):
    """Raised when segment shadow mapping cannot be completed safely."""


async def map_shadows_to_segments(
    segments: list[RouteSegment],
    timing: RouteTiming,
    provider: SegmentShadowProvider,
) -> list[SegmentShadow]:
    """Request and associate one shadow result with each ordered route segment.

    ShadeMap currently accepts a viewport, so each request uses a small viewport
    around the segment midpoint. Responses are cached by midpoint and timestamp.
    A provider failure affects only that segment and is represented as unknown.
    """
    segments_by_id = {segment.id: segment for segment in segments}
    if len(segments_by_id) != len(segments):
        raise SegmentShadowMappingError("Route segment identifiers must be unique")

    cache: dict[tuple[float, float, datetime], ShadowResponse | Exception] = {}
    semaphore = asyncio.Semaphore(8)

    async def map_one(segment: RouteSegment, evaluated_time: datetime) -> SegmentShadow:
        location = _segment_midpoint(segment)
        cache_key = (location.latitude, location.longitude, evaluated_time)
        cached = cache.get(cache_key)
        if cached is None:
            request = _shadow_request(location, evaluated_time)
            async with semaphore:
                try:
                    cached = await provider.get_shadows(request)
                except ShadowProviderError as error:
                    cached = error
            cache[cache_key] = cached

        if isinstance(cached, ShadowResponse):
            return _map_response(segment.id, location, evaluated_time, cached)
        return _unknown_result(
            segment.id,
            location,
            evaluated_time,
            f"ShadeMap request failed: {type(cached).__name__}",
        )

    tasks: list[asyncio.Task[SegmentShadow]] = []
    for arrival in timing.segment_arrivals:
        segment = segments_by_id.get(arrival.segment_id)
        if segment is None:
            raise SegmentShadowMappingError(
                f"Timing references unknown route segment {arrival.segment_id}"
            )

        evaluated_time = arrival.expected_arrival.astimezone(UTC)
        tasks.append(asyncio.create_task(map_one(segment, evaluated_time)))
    return list(await asyncio.gather(*tasks))


def _shadow_request(location: Coordinate, evaluated_time: datetime) -> ShadowRequest:
    epsilon = 0.00001
    west = max(-180.0, location.longitude - epsilon)
    east = min(180.0, location.longitude + epsilon)
    south = max(-90.0, location.latitude - epsilon)
    north = min(90.0, location.latitude + epsilon)
    return ShadowRequest(
        viewport=ShadowViewport(west=west, south=south, east=east, north=north),
        requested_time=evaluated_time,
    )


def _map_response(
    segment_id: str,
    location: Coordinate,
    evaluated_time: datetime,
    response: ShadowResponse,
) -> SegmentShadow:
    if not response.samples:
        return _unknown_result(
            segment_id,
            location,
            evaluated_time,
            "ShadeMap returned no usable shadow samples",
            response.coverage_confidence,
        )

    sample = min(response.samples, key=lambda item: _distance_squared(location, item.location))
    if sample.classification is ShadeClassification.UNKNOWN:
        return _unknown_result(
            segment_id,
            location,
            evaluated_time,
            sample.unknown_reason or "ShadeMap returned unknown shadow conditions",
            response.coverage_confidence,
        )
    return SegmentShadow(
        segment_id=segment_id,
        location=location,
        expected_arrival=evaluated_time,
        classification=sample.classification,
        coverage_confidence=response.coverage_confidence,
        source=sample.source,
        shade_percentage=sample.shade_percentage,
        data_available=True,
    )


def _unknown_result(
    segment_id: str,
    location: Coordinate,
    evaluated_time: datetime,
    reason: str,
    coverage_confidence: CoverageConfidence = CoverageConfidence.INSUFFICIENT,
) -> SegmentShadow:
    return SegmentShadow(
        segment_id=segment_id,
        location=location,
        expected_arrival=evaluated_time,
        classification=ShadeClassification.UNKNOWN,
        coverage_confidence=coverage_confidence,
        source="shademap",
        data_available=False,
        unknown_reason=reason,
    )


def _segment_midpoint(segment: RouteSegment) -> Coordinate:
    coordinates = segment.geometry.coordinates
    midpoint = coordinates[len(coordinates) // 2]
    return Coordinate(latitude=midpoint[1], longitude=midpoint[0])


def _distance_squared(first: Coordinate, second: Coordinate) -> float:
    return (first.latitude - second.latitude) ** 2 + (first.longitude - second.longitude) ** 2
