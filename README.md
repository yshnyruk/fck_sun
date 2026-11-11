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
