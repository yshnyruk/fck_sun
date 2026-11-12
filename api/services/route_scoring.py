"""Score route candidates using shade preference-specific weights."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType

from api.schemas.route_coverage import RouteShadeCoverage
from api.schemas.routes import CoverageConfidence, Route, ShadePreference


@dataclass(frozen=True)
class RouteScoringWeights:
    shade: float
    distance: float
    duration: float

    def __post_init__(self) -> None:
        if min(self.shade, self.distance, self.duration) < 0:
            raise ValueError("route scoring weights must be non-negative")
        if abs(self.shade + self.distance + self.duration - 1) > 1e-9:
            raise ValueError("route scoring weights must sum to 1")


DEFAULT_SCORING_WEIGHTS: Mapping[ShadePreference, RouteScoringWeights] = MappingProxyType(
    {
        ShadePreference.FULL: RouteScoringWeights(shade=0.70, distance=0.15, duration=0.15),
        ShadePreference.MORE: RouteScoringWeights(shade=0.55, distance=0.25, duration=0.20),
        ShadePreference.MEDIUM: RouteScoringWeights(shade=0.40, distance=0.30, duration=0.30),
        ShadePreference.LESS: RouteScoringWeights(shade=0.20, distance=0.40, duration=0.40),
        ShadePreference.NO_SHADOW: RouteScoringWeights(
            shade=0.05,
            distance=0.475,
            duration=0.475,
        ),
    }
)


@dataclass(frozen=True)
class RouteScore:
    route_id: str
    score: float
    shade_score: float
    distance_score: float
    duration_score: float
    weights: RouteScoringWeights


def score_routes(
    routes: Sequence[Route],
    coverages: Mapping[str, RouteShadeCoverage],
    preference: ShadePreference,
) -> list[RouteScore]:
    """Return scores ordered from best to worst for the selected preference."""
    if not routes:
        raise ValueError("at least one route is required")
    if len({route.id for route in routes}) != len(routes):
        raise ValueError("route identifiers must be unique")

    missing_coverage = [route.id for route in routes if route.id not in coverages]
    if missing_coverage:
        raise ValueError(f"missing shade coverage for routes: {', '.join(missing_coverage)}")

    shortest_distance = min(route.distance_m for route in routes)
    shortest_duration = min(route.duration_s for route in routes)
    base_weights = DEFAULT_SCORING_WEIGHTS[preference]
    all_insufficient = all(
        coverages[route.id].coverage_confidence is CoverageConfidence.INSUFFICIENT
        for route in routes
    )
    weights = _effective_weights(base_weights, all_insufficient)

    scored = [
        _score_route(
            route,
            coverages[route.id],
            shortest_distance,
            shortest_duration,
            weights,
        )
        for route in routes
    ]
    confidence_rank = {
        CoverageConfidence.HIGH: 0,
        CoverageConfidence.PARTIAL: 1,
        CoverageConfidence.INSUFFICIENT: 2,
    }
    return sorted(
        scored,
        key=lambda item: (
            -item.score,
            confidence_rank[coverages[item.route_id].coverage_confidence],
            next(route.duration_s for route in routes if route.id == item.route_id),
            next(route.distance_m for route in routes if route.id == item.route_id),
        ),
    )


def rank_routes(
    routes: Sequence[Route],
    coverages: Mapping[str, RouteShadeCoverage],
    preference: ShadePreference,
) -> list[Route]:
    """Attach calculated scores and return routes ordered best to worst."""
    scores = score_routes(routes, coverages, preference)
    return [
        next(route for route in routes if route.id == route_score.route_id).model_copy(
            update={"score": route_score.score}
        )
        for route_score in scores
    ]


def select_recommended_route(
    routes: Sequence[Route],
    coverages: Mapping[str, RouteShadeCoverage],
    preference: ShadePreference,
) -> tuple[Route, list[Route]]:
    """Return the highest-scoring route and the remaining alternatives."""
    ranked_routes = rank_routes(routes, coverages, preference)
    return ranked_routes[0], ranked_routes[1:]


def _effective_weights(
    weights: RouteScoringWeights,
    all_insufficient: bool,
) -> RouteScoringWeights:
    if not all_insufficient:
        return weights
    efficiency_total = weights.distance + weights.duration
    return RouteScoringWeights(
        shade=0,
        distance=weights.distance / efficiency_total,
        duration=weights.duration / efficiency_total,
    )


def _score_route(
    route: Route,
    coverage: RouteShadeCoverage,
    shortest_distance: float,
    shortest_duration: float,
    weights: RouteScoringWeights,
) -> RouteScore:
    shade_score = coverage.shaded_distance_m / coverage.total_distance_m
    if coverage.coverage_confidence is CoverageConfidence.INSUFFICIENT:
        shade_score = 0
    distance_score = shortest_distance / route.distance_m
    duration_score = shortest_duration / route.duration_s
    score = (
        weights.shade * shade_score
        + weights.distance * distance_score
        + weights.duration * duration_score
    )
    return RouteScore(
        route_id=route.id,
        score=score,
        shade_score=shade_score,
        distance_score=distance_score,
        duration_score=duration_score,
        weights=weights,
    )
