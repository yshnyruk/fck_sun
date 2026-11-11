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
