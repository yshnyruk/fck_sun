"""Location autocomplete service."""

from api.core.config import Settings
from api.integrations.graphhopper_geocoding import GraphHopperGeocodingAdapter
from api.schemas.search import LocationSearchResult


class LocationSearchService:
    """Find geographic locations using the configured geocoding provider."""

    def __init__(self, adapter: GraphHopperGeocodingAdapter) -> None:
        self._adapter = adapter

    async def search(self, query: str, *, limit: int = 5) -> list[LocationSearchResult]:
        return await self._adapter.search(query.strip(), limit=limit)


def create_location_search_service(settings: Settings) -> LocationSearchService:
    return LocationSearchService(GraphHopperGeocodingAdapter(settings))
