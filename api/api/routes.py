from datetime import UTC, datetime
from typing import Annotated

from api.core.config import get_settings
from api.integrations.graphhopper import (
    GraphHopperAdapter,
    GraphHopperError,
    GraphHopperNoRouteError,
)
from api.integrations.graphhopper_geocoding import GraphHopperGeocodingError
from api.integrations.shademap import (
    ShadeMapAdapter,
    ShadeMapConfigurationError,
    ShadeMapError,
)
from api.schemas.routes import RouteRequest, RouteResponse
from api.schemas.search import LocationSearchResponse
from api.schemas.shadows import ShadowRequest, ShadowResponse, ShadowViewport
from api.services.location_search import (
    LocationSearchService,
    create_location_search_service,
)
from api.services.route_planning import RoutePlanningError, RoutePlanningService
from api.services.viewport_shadows import ViewportShadowService
from fastapi import APIRouter, Depends, Query
from starlette.exceptions import HTTPException

router = APIRouter(prefix="/api/v1")


@router.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


def get_route_planning_service() -> RoutePlanningService:
    settings = get_settings()
    return RoutePlanningService(
        GraphHopperAdapter(settings),
        ShadeMapAdapter(settings),
    )


def get_location_search_service() -> LocationSearchService:
    return create_location_search_service(get_settings())


def get_viewport_shadow_service() -> ViewportShadowService:
    return ViewportShadowService(ShadeMapAdapter(get_settings()))


@router.get("/shadows", response_model=ShadowResponse, tags=["shadows"])
async def get_viewport_shadows(
    service: Annotated[ViewportShadowService, Depends(get_viewport_shadow_service)],
    west: Annotated[float, Query(ge=-180, le=180)],
    south: Annotated[float, Query(ge=-90, le=90)],
    east: Annotated[float, Query(ge=-180, le=180)],
    north: Annotated[float, Query(ge=-90, le=90)],
    time: Annotated[
        datetime,
        Query(description="Requested time as a UTC ISO 8601 timestamp."),
    ],
) -> ShadowResponse:
    if time.tzinfo is None or time.utcoffset() != UTC.utcoffset(time):
        raise HTTPException(
            status_code=422,
            detail="The time query parameter must be an ISO 8601 UTC timestamp.",
        )
    try:
        request = ShadowRequest(
            viewport=ShadowViewport(west=west, south=south, east=east, north=north),
            requested_time=time,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    try:
        return await service.get_shadows(request)
    except ShadeMapConfigurationError as error:
        raise HTTPException(
            status_code=503,
            detail="Viewport shadow data is not configured.",
        ) from error
    except ShadeMapError as error:
        raise HTTPException(
            status_code=502,
            detail="Viewport shadow provider is unavailable or returned invalid data.",
        ) from error


@router.post("/routes", response_model=RouteResponse, tags=["routes"])
async def generate_routes(
    request: RouteRequest,
    service: Annotated[RoutePlanningService, Depends(get_route_planning_service)],
) -> RouteResponse:
    try:
        return await service.plan(request)
    except (GraphHopperNoRouteError, RoutePlanningError) as error:
        raise HTTPException(
            status_code=422,
            detail="No pedestrian route could be generated for these coordinates.",
        ) from error
    except GraphHopperError as error:
        raise HTTPException(
            status_code=502,
            detail="Route planning provider is unavailable.",
        ) from error


@router.get("/search", response_model=LocationSearchResponse, tags=["search"])
async def search_locations(
    service: Annotated[LocationSearchService, Depends(get_location_search_service)],
    q: str = Query(min_length=2, max_length=200, pattern=r".*\S.*"),
    limit: int = Query(default=5, ge=1, le=10),
) -> LocationSearchResponse:
    try:
        results = await service.search(q, limit=limit)
    except GraphHopperGeocodingError as error:
        raise HTTPException(
            status_code=502,
            detail="Location search provider is unavailable.",
        ) from error
    return LocationSearchResponse(results=results)
