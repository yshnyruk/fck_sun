"""Calculate distance-weighted overall shade coverage."""

from collections.abc import Mapping

from api.schemas.route_coverage import RouteShadeCoverage, ShadeCoverageThresholds
from api.schemas.routes import CoverageConfidence, Route, ShadeClassification, ShadeEstimate
from api.schemas.segment_shadows import SegmentShadow
from api.schemas.segments import RouteSegment

_DISTANCE_TOLERANCE_M = 1e-6


class RouteShadeCoverageError(Exception):
    """Raised when segment shade results cannot be summarized safely."""


def calculate_route_shade_coverage(
    segments: list[RouteSegment],
    shadows: list[SegmentShadow],
    thresholds: ShadeCoverageThresholds | None = None,
) -> RouteShadeCoverage:
    """Return a distance-weighted summary without treating unknown as exposure."""
    if not segments:
        raise RouteShadeCoverageError("At least one route segment is required")

    _index_segments(segments)
    shadows_by_id = _index_shadows(shadows)
    shaded_distance = 0.0
    exposed_distance = 0.0
    unknown_distance = 0.0
    confidences: list[CoverageConfidence] = []

    for segment in segments:
        shadow = shadows_by_id.get(segment.id)
        if shadow is None or not shadow.data_available:
            unknown_distance += segment.distance_m
            if shadow is not None:
                confidences.append(shadow.coverage_confidence)
            continue

        confidences.append(shadow.coverage_confidence)
        shaded, exposed = _classified_distances(segment.distance_m, shadow)
        shaded_distance += shaded
        exposed_distance += exposed

    total_distance = shaded_distance + exposed_distance + unknown_distance
    if total_distance <= 0:
        raise RouteShadeCoverageError("Route segment distances must be positive")

    settings = thresholds or ShadeCoverageThresholds()
    usable_percentage = (shaded_distance + exposed_distance) / total_distance * 100
    return RouteShadeCoverage(
        total_distance_m=total_distance,
        shaded_distance_m=shaded_distance,
        exposed_distance_m=exposed_distance,
        unknown_distance_m=unknown_distance,
        shaded_percentage=shaded_distance / total_distance * 100,
        exposed_percentage=exposed_distance / total_distance * 100,
        unknown_percentage=unknown_distance / total_distance * 100,
        usable_percentage=usable_percentage,
        coverage_confidence=_overall_confidence(
            shaded_distance + exposed_distance,
            unknown_distance,
            confidences,
            settings,
        ),
    )


def attach_route_shade_coverage(route: Route, coverage: RouteShadeCoverage) -> Route:
    """Attach normalized coverage metadata while preserving the pedestrian route."""
    return route.model_copy(
        update={
            "coverage_confidence": coverage.coverage_confidence,
            "shade": ShadeEstimate(
                shade_coverage_percent=coverage.shaded_percentage,
                classified_distance_m=(coverage.shaded_distance_m + coverage.exposed_distance_m),
                unknown_distance_m=coverage.unknown_distance_m,
            ),
        }
    )


def _index_segments(segments: list[RouteSegment]) -> Mapping[str, RouteSegment]:
    indexed = {segment.id: segment for segment in segments}
    if len(indexed) != len(segments):
        raise RouteShadeCoverageError("Route segment identifiers must be unique")
    return indexed


def _index_shadows(shadows: list[SegmentShadow]) -> Mapping[str, SegmentShadow]:
    indexed = {shadow.segment_id: shadow for shadow in shadows}
    if len(indexed) != len(shadows):
        raise RouteShadeCoverageError("Segment shadow identifiers must be unique")
    return indexed


def _classified_distances(
    distance_m: float,
    shadow: SegmentShadow,
) -> tuple[float, float]:
    if shadow.classification is ShadeClassification.CONFIRMED_SHADE:
        if shadow.shade_percentage is None:
            return distance_m, 0.0
        shaded = distance_m * shadow.shade_percentage / 100
        return shaded, distance_m - shaded
    if shadow.classification is ShadeClassification.CONFIRMED_EXPOSURE:
        return 0.0, distance_m
    return 0.0, 0.0


def _overall_confidence(
    classified_distance_m: float,
    unknown_distance_m: float,
    confidences: list[CoverageConfidence],
    thresholds: ShadeCoverageThresholds,
) -> CoverageConfidence:
    total_distance_m = classified_distance_m + unknown_distance_m
    usable_ratio = classified_distance_m / total_distance_m if total_distance_m else 0
    if usable_ratio < thresholds.insufficient_below_usable_ratio:
        return CoverageConfidence.INSUFFICIENT
    if usable_ratio < thresholds.high_minimum_usable_ratio or any(
        confidence is not CoverageConfidence.HIGH for confidence in confidences
    ):
        return CoverageConfidence.PARTIAL
    return CoverageConfidence.HIGH
