# fck_sun
A project of a shade-aware navigation application that calculates pedestrian by prioritizing shade over direct sun exposure

## Configuration

Copy the example files for local development:

```sh
cp api/.env.example api/.env
cp web/.env.example web/.env
```

The backend reads settings from environment variables and `api/.env` (when
present). Environment variables take precedence. `GRAPHHOPPER_API_KEY` and
`SHADEMAP_API_KEY` are server-side credentials and must never be added to
frontend configuration.

Backend settings include `ENVIRONMENT`, `LOG_LEVEL`, `CORS_ORIGINS`,
`GRAPHHOPPER_BASE_URL`, `GRAPHHOPPER_API_KEY`, `SHADEMAP_BASE_URL`,
`SHADEMAP_API_KEY`, and `EXTERNAL_REQUEST_TIMEOUT_SECONDS`.

The frontend reads `VITE_API_BASE_URL`, which defaults to `/api/v1`, and
`VITE_SHADEMAP_API_KEY`. The ShadeMap key in the frontend must be a separate
client key intended for browser use; never copy `SHADEMAP_API_KEY` into
frontend configuration. ShadeMap's MapLibre SDK uses the client key to enable
its browser shadow simulation.

## Route segmentation

The backend can split each ordered route `LineString` into renderable
`RouteSegment` objects using `segment_route_geometry`. The
`RouteSegmentationConfig.max_segment_length_m` setting controls the maximum
geodesic segment length; its default is 100 metres and callers can provide a
different value for other use cases. Long geometry edges are split with
interpolated coordinates, so adjacent segments share endpoints and can be
rendered or reconstructed in route order.

Segment distances use the WGS84 spherical mean Earth radius (6,371,008.8 m)
with haversine calculations. Consequently, the sum of segment distances is
within floating-point tolerance of the geometry length calculated by this
module, but may differ slightly from a routing provider's road-network
distance. Provider distance should remain authoritative for route totals.

## Segment arrival timing

`calculate_segment_arrival_times` assigns each ordered `RouteSegment` the
timestamp at which the walker is expected to reach that segment's end. It
derives a constant estimated walking speed from the route's provider distance
and duration, then applies cumulative segment distance. `LEAVE_NOW` uses the
current timezone-aware time, `DEPART_AT` uses the requested departure, and
`ARRIVE_BY` subtracts the route duration to derive departure.

Planning timestamps must include timezone information. The resulting
`RouteTiming` preserves that timezone and can be passed to time-aware shade
evaluation; no weather or other comfort variables are included in this
calculation.

## Segment shade mapping

Route planning uses a two-step flow. `POST /api/v1/routes/candidates` returns
pedestrian candidates without contacting ShadeMap. The frontend samples each
candidate on a hidden MapLibre canvas with the documented ShadeMap browser
SDK, then sends the classified segments to `POST /api/v1/routes/score`. The
backend remains responsible for ranking and returning the recommended route
and alternatives. The user's visible shadow overlay is a separate toggle and
does not trigger another route calculation.

The ShadeMap SDK does not expose data-coverage confidence, so SDK classifications
are labeled partial. If the SDK key, WebGL, or sampling fails, route segments
remain unknown and the backend falls back to distance and duration scoring.
The backend ShadeMap REST URL has not been verified and currently returns HTML;
it is not used by this route-candidate flow.

## Overall route shade coverage

`calculate_route_shade_coverage` summarizes `SegmentShadow` results using each
segment's distance. Confirmed shade and exposure contribute to their respective
distance totals; unknown or missing segment results contribute only to
`unknown_distance_m`. The returned `RouteShadeCoverage` exposes all three
distances and percentages, so unknown conditions are never silently counted as
sunlight or shade.

When a segment contains a valid provider shade percentage, only that segment's
distance is split between shaded and exposed totals. A route with no classified
distance is marked `insufficient`; any unknown distance or non-high segment
confidence makes the overall result `partial`.

The default configurable thresholds are:

- `high_minimum_usable_ratio = 0.80`: at least 80% of route distance must have
  usable data, and all contributing provider confidence must be high.
- `insufficient_below_usable_ratio = 0.20`: below 20% usable distance is
  insufficient for shade-based recommendations.
- Values between those thresholds are partial coverage.

These defaults make the confidence decision conservative: unknown distance is
never classified as exposure, and an insufficient shade result does not remove
the standard pedestrian route.

## Route scoring model

The documented scoring model balances confirmed shade, walking distance, and
estimated duration according to the selected shade preference. It defines the
normalization, default weights, and insufficient/partial coverage behavior in
[ROUTE_SCORING.md](./ROUTE_SCORING.md).

## Development

Install the backend dependencies in a virtual environment and the frontend
dependencies before starting the applications:

```sh
python -m venv api/.venv
api/.venv/bin/python -m pip install -r api/requirements.txt
npm --prefix web install
```

Start both applications together from the repository root:

```sh
make dev
```

The frontend is available at `http://127.0.0.1:5173` and the backend health
endpoint is available at `http://127.0.0.1:8000/api/v1/health`.

The applications can also be started independently:

```sh
make backend
make frontend
```

`make backend` uses the active Python environment, so activate
`api/.venv` first when it is not already active:

```sh
source api/.venv/bin/activate
```
