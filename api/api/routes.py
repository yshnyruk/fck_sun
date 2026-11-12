from typing import Annotated

from api.core.config import get_settings
from api.integrations.graphhopper import GraphHopperAdapter, GraphHopperError
from api.integrations.graphhopper_geocoding import GraphHopperGeocodingError
from api.schemas.routes import RouteRequest, RouteResponse
from api.schemas.search import LocationSearchResponse
from api.services.location_search import (
    LocationSearchService,
    create_location_search_service,
)
from api.services.route_planning import RoutePlanningService
from fastapi import APIRouter, Depends, Query
from starlette.exceptions import HTTPException

router = APIRouter(prefix="/api/v1")


@router.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


def get_route_planning_service() -> RoutePlanningService:
    return RoutePlanningService(GraphHopperAdapter(get_settings()))


def get_location_search_service() -> LocationSearchService:
    return create_location_search_service(get_settings())


@router.post("/routes", response_model=RouteResponse, tags=["routes"])
async def generate_routes(
    request: RouteRequest,
    service: Annotated[RoutePlanningService, Depends(get_route_planning_service)],
) -> RouteResponse:
    try:
        return await service.plan(request)
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
