import pytest

from api.schemas.route_coverage import RouteShadeCoverage
from api.schemas.routes import CoverageConfidence, LineStringGeometry, Route, ShadePreference
from api.services.route_scoring import (
    DEFAULT_SCORING_WEIGHTS,
    rank_routes,
    score_routes,
    select_recommended_route,
)


def route(route_id: str, distance_m: float, duration_s: float) -> Route:
    return Route(
        id=route_id,
        geometry=LineStringGeometry(coordinates=[(0, 0), (0.01, 0.01)]),
        distance_m=distance_m,
        duration_s=duration_s,
        coverage_confidence=CoverageConfidence.HIGH,
    )


def coverage(
    shaded_distance_m: float,
    total_distance_m: float = 1000,
    confidence: CoverageConfidence = CoverageConfidence.HIGH,
) -> RouteShadeCoverage:
    exposed_distance_m = total_distance_m - shaded_distance_m
    return RouteShadeCoverage(
        total_distance_m=total_distance_m,
        shaded_distance_m=shaded_distance_m,
        exposed_distance_m=exposed_distance_m,
        unknown_distance_m=0,
        shaded_percentage=shaded_distance_m / total_distance_m * 100,
        exposed_percentage=exposed_distance_m / total_distance_m * 100,
        unknown_percentage=0,
        usable_percentage=100,
        coverage_confidence=confidence,
    )


def test_each_preference_has_distinct_shade_importance() -> None:
    shade_weights = [DEFAULT_SCORING_WEIGHTS[preference].shade for preference in ShadePreference]

    assert shade_weights == [0.70, 0.55, 0.40, 0.20, 0.05]


@pytest.mark.parametrize("preference", list(ShadePreference))
def test_preference_weight_changes_route_ranking(preference: ShadePreference) -> None:
    routes = [route("shade", 1200, 1200), route("efficient", 1000, 1000)]
    coverages = {
        "shade": coverage(1000),
        "efficient": coverage(0),
    }

    scored = score_routes(routes, coverages, preference)

    if preference is ShadePreference.NO_SHADOW:
        assert scored[0].route_id == "efficient"
    else:
        assert scored[0].route_id == "shade"


def test_all_insufficient_routes_renormalize_efficiency_weights() -> None:
    routes = [route("first", 1000, 1200), route("second", 1200, 1000)]
    coverages = {
        "first": coverage(0, confidence=CoverageConfidence.INSUFFICIENT),
        "second": coverage(0, confidence=CoverageConfidence.INSUFFICIENT),
    }

    scored = score_routes(routes, coverages, ShadePreference.FULL)

    assert scored[0].weights.shade == 0
    assert scored[0].weights.distance == pytest.approx(0.5)
    assert scored[0].weights.duration == pytest.approx(0.5)


def test_rank_routes_attaches_scores_and_orders_routes() -> None:
    routes = [route("slow", 1200, 1200), route("fast", 1000, 1000)]
    coverages = {
        "slow": coverage(1000),
        "fast": coverage(0),
    }

    ranked = rank_routes(routes, coverages, ShadePreference.NO_SHADOW)

    assert [item.id for item in ranked] == ["fast", "slow"]
    assert ranked[0].score == pytest.approx(0.95)
    assert ranked[1].score is not None


def test_select_recommended_route_returns_highest_scoring_route() -> None:
    routes = [route("shade", 1200, 1200), route("efficient", 1000, 1000)]
    coverages = {
        "shade": coverage(1000),
        "efficient": coverage(0),
    }

    recommended, alternatives = select_recommended_route(
        routes,
        coverages,
        ShadePreference.FULL,
    )

    assert recommended.id == "shade"
    assert recommended.score is not None
    assert alternatives[0].id == "efficient"
    assert alternatives[0].score is not None
    assert recommended.score > alternatives[0].score


def test_select_recommended_route_omits_near_duplicate_alternatives() -> None:
    routes = [
        route("recommended", 1000, 1000),
        route("near-duplicate", 1050, 1050),
        route("meaningful", 1200, 1000),
    ]
    coverages = {
        "recommended": coverage(500),
        "near-duplicate": coverage(500),
        "meaningful": coverage(500),
    }

    recommended, alternatives = select_recommended_route(
        routes,
        coverages,
        ShadePreference.NO_SHADOW,
    )

    assert recommended.id == "recommended"
    assert [route.id for route in alternatives] == ["meaningful"]
    assert alternatives[0].distance_m == 1200
    assert alternatives[0].duration_s == 1000
    assert alternatives[0].score is not None


def test_shade_difference_makes_equal_metric_route_meaningful() -> None:
    routes = [route("recommended", 1000, 1000), route("shadier", 1000, 1000)]
    coverages = {
        "recommended": coverage(200),
        "shadier": coverage(400),
    }

    recommended, alternatives = select_recommended_route(
        routes,
        coverages,
        ShadePreference.FULL,
    )

    assert recommended.id == "shadier"
    assert [route.id for route in alternatives] == ["recommended"]
