from api.schemas.routes import (
    CoverageConfidence,
    LineStringGeometry,
    Route,
    ShadeClassification,
    ShadeEstimate,
    ShadePreference,
    ShadeSegment,
)
from api.services.route_planning import score_routes_with_frontend_shade


def candidate(
    route_id: str,
    distance_m: float,
    classification: ShadeClassification,
) -> Route:
    return Route(
        id=route_id,
        geometry=LineStringGeometry(coordinates=[(-74.0, 40.7), (-73.99, 40.7)]),
        distance_m=distance_m,
        duration_s=600,
        coverage_confidence=CoverageConfidence.INSUFFICIENT,
        shade=ShadeEstimate(
            shade_coverage_percent=None,
            classified_distance_m=0,
            unknown_distance_m=distance_m,
            segments=[
                ShadeSegment(
                    start_distance_m=0,
                    end_distance_m=distance_m,
                    classification=classification,
                    coverage_confidence=(
                        CoverageConfidence.PARTIAL
                        if classification is not ShadeClassification.UNKNOWN
                        else CoverageConfidence.INSUFFICIENT
                    ),
                )
            ],
        ),
    )


def test_backend_scores_routes_using_frontend_samples() -> None:
    response = score_routes_with_frontend_shade(
        [
            candidate("exposed", 1000, ShadeClassification.CONFIRMED_EXPOSURE),
            candidate("shaded", 1050, ShadeClassification.CONFIRMED_SHADE),
        ],
        ShadePreference.FULL,
    )

    assert response.recommended_route.id == "shaded"
    assert response.recommended_route.shade is not None
    assert response.recommended_route.shade.shade_coverage_percent == 100


def test_unknown_frontend_samples_keep_efficiency_ranking() -> None:
    response = score_routes_with_frontend_shade(
        [
            candidate("short", 1000, ShadeClassification.UNKNOWN),
            candidate("long", 1100, ShadeClassification.UNKNOWN),
        ],
        ShadePreference.FULL,
    )

    assert response.recommended_route.id == "short"
    assert response.recommended_route.coverage_confidence is CoverageConfidence.INSUFFICIENT
