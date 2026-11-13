# ShadeMap capability validation

Validated on 2026-11-12 against the public ShadeMap help and about pages:

- [ShadeMap help](https://shademap.app/help/)
- [ShadeMap about](https://shademap.app/about/)

## Findings

| Requirement | Result | Evidence or limitation |
| --- | --- | --- |
| Request a specified date and time | Supported in the browser product | The help page describes ShadeMap as simulating shadows for any date and time and provides a date/time control. |
| Compare the same location at different times | Supported in the browser product | The simulator recalculates shadow positions from the selected date and time. |
| Query an individual coordinate | Not verified for the server adapter | Public documentation describes map-pixel simulation and a location's sun/shadow hours, but does not document a coordinate JSON endpoint. |
| Query an area or viewport | Supported in the browser product; server contract unverified | The help page states that data displayed in the map viewport is used for shadow calculation. No public server request/response contract was found. |
| Geographic precision | Variable | Default data is an estimate and can be off by several metres. Premium LiDAR/photogrammetry data is described as accurate to within 30 cm where available. |
| Buildings | Supported | Building data is sourced from OpenStreetMap, Overture Maps, or Mapbox Streets. Missing building heights default to 3.1 m. |
| Trees and terrain | Supported | The public help page describes tree, mountain, and terrain shadows. It also documents above/below-canopy behavior. |
| Bridges, tunnels, covered walkways, and canopies | Not independently verified | The public documentation does not identify these as distinct, queryable source classes. They must not be presented as confirmed ShadeMap capabilities without provider documentation or observed data. |
| Missing geographic data | Partially documented | The provider documents estimated/default data and variable error, but does not publish a machine-readable missing/unknown response representation. FckSun must preserve unknown coverage rather than infer exposure. |
| API authentication and server requests | Not verified | The public about page offers API keys and describes a JavaScript toolkit, but does not publish the HTTP endpoint, authentication header/query convention, or JSON schema used by this adapter. |

## FckSun test matrix

The adapter tests use deterministic HTTP mocks to verify that FckSun can preserve the
inputs and outputs needed by its internal contract:

1. The same viewport is sent with two different UTC timestamps.
2. Two different viewports are sent with the same UTC timestamp.
3. High, partial, and insufficient coverage can be represented.
4. Unknown samples retain an explicit reason and are not converted to exposure.

These are adapter-contract tests, not live ShadeMap capability tests. They prove that
the application boundary is time- and viewport-aware, but cannot prove that
`https://shademap.app/api/v1/shadows` is a supported public endpoint.

The normalized FckSun sample structure contains geographic coordinates, the evaluated
UTC timestamp, a controlled shade classification (`confirmed_shade`,
`confirmed_exposure`, or `unknown`), `data_available`, the source identifier, and an
optional percentage only when the provider supplies a valid 0-100 value. Invalid or
missing classifications and timestamps remain unknown; they are never converted into
confirmed exposure.

## MVP decision

ShadeMap is **not yet sufficient as a verified backend provider for the MVP**.

It is a promising browser-side shadow simulation source with the required conceptual
inputs (date/time and geographic map area), but the current public documentation does
not establish a stable server-side API for route-segment sampling. Before enabling
ShadeMap-backed route recommendations, obtain and validate the provider's API
documentation or credentials, including:

- the supported request format for coordinates or viewport geometry;
- the authentication mechanism and rate limits;
- the response schema and precision guarantees;
- explicit behavior for unavailable building, tree, and terrain data;
- coverage/licensing terms for route-scale and navigation use.

Until then, the backend must treat the current ShadeMap adapter as an unverified
integration boundary and must not claim complete shade coverage.

## Map rendering integration

The official `mapbox-gl-shadow-simulator` SDK supports MapLibre and is the
documented browser integration. Its browser initialization calls
`POST https://shademap.app/sdk/load`; it does not provide the JSON viewport
endpoint previously assumed by `ShadeMapAdapter`. The FckSun map uses this SDK
for its current shadow overlay and reads building features from the active
OpenFreeMap vector source when available. The SDK runs in the browser, so it
requires a separate client key in `web/.env` as `VITE_SHADEMAP_API_KEY`. Never
reuse or expose the server-only `SHADEMAP_API_KEY`.

The configured frontend key was checked against the documented SDK load route
on 2026-11-13 and received HTTP 403. The map therefore reports that ShadeMap
could not load shadows until a valid browser SDK key is configured. This is an
authentication result, not evidence that the SDK produced shade data.
