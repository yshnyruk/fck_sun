# Route scoring model

This document defines the scoring model for ranking pedestrian route
candidates. It is a specification for the route-scoring service; the current
route-planning flow does not yet apply these scores.

## Objectives

The score balances:

1. Confirmed shade coverage.
2. Walking distance.
3. Estimated walking duration.

Shade is a preference, not a hard constraint. A route with insufficient shade
data must remain available as a standard pedestrian route.

## Candidate normalization

For a set of candidate routes, calculate two non-negative cost ratios:

```text
distance_cost = route.distance_m / shortest_candidate_distance_m
duration_cost = route.duration_s / shortest_candidate_duration_s
```

Convert each cost into a benefit score in the range `[0, 1]`:

```text
distance_score = 1 / distance_cost
duration_score = 1 / duration_cost
```

The shortest route therefore scores `1.0` for distance, and the fastest route
scores `1.0` for duration. A route that is twice as long scores `0.5` on
distance. Provider distance and duration are authoritative; geometry-derived
lengths are not used for these metrics.

## Shade score

Use the route's distance-weighted `RouteShadeCoverage` values:

```text
shade_score = shaded_distance_m / total_distance_m
```

Unknown distance contributes neither shade nor exposure. This deliberately
prevents missing data from being presented as sunlight, while also preventing
unknown segments from receiving the same reward as confirmed shade.

For routes with `coverage_confidence = insufficient`, set the shade component
to `0` and rank the route using only its distance and duration components. The
route must still be returned, with its insufficient coverage state exposed to
the caller. Partial coverage uses the available confirmed shade and retains
the partial-confidence warning.

## Weighted score

For each candidate route, calculate:

```text
route_score =
    shade_weight * shade_score
  + distance_weight * distance_score
  + duration_weight * duration_score
```

The three weights always sum to `1.0`. Higher scores are better.

### Default preference weights

| Shade preference | Shade | Distance | Duration | Rationale |
| --- | ---: | ---: | ---: | --- |
| `full` | 0.70 | 0.15 | 0.15 | Maximize confirmed shade; tolerate reasonable route trade-offs. |
| `more` | 0.55 | 0.25 | 0.20 | Prefer shade while retaining meaningful efficiency. |
| `medium` | 0.40 | 0.30 | 0.30 | Balanced comfort, distance, and time. |
| `less` | 0.20 | 0.40 | 0.40 | Prefer efficient routes unless shade improvement is substantial. |
| `no_shadow` | 0.05 | 0.475 | 0.475 | Make shade minimally relevant; do not actively seek exposure. |

`no_shadow` does not mean “seek sunlight.” Its small shade weight preserves
confirmed shade as a harmless tie-breaker while making distance and duration
the dominant factors.

## Confidence and fallback behavior

- Unknown conditions are never converted to confirmed exposure.
- Insufficient-coverage routes are not rejected solely because shade data is
  unavailable; standard pedestrian routing remains possible.
- A route with partial coverage may outrank another route only when its
  confirmed shade and efficiency produce a higher score. The UI must continue
  to display the partial-confidence state.
- If all candidates have insufficient coverage, the score is based on distance
  and duration only, using the selected preference's distance and duration
  weights renormalized to sum to `1.0`.

## Selection and ties

Return the candidate with the highest `route_score` as the recommendation.
Retain alternatives that are meaningful pedestrian routes even when their
score is lower. For equal scores, prefer, in order:

1. Higher `coverage_confidence` (`high`, then `partial`, then
   `insufficient`).
2. Shorter duration.
3. Shorter distance.
4. Stable provider candidate order.

All parameters in this document are configuration, not API input. Changing
weights or fallback behavior requires updating this document and the scoring
tests together.
