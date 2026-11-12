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

The frontend only reads `VITE_API_BASE_URL`, which defaults to `/api/v1`.
Browser-exposed `VITE_` variables must not contain private service
credentials.

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
