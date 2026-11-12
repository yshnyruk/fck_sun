"""Schemas for geographic location search."""

from pydantic import BaseModel, Field

from .routes import Coordinate


class LocationSearchResult(BaseModel):
    """A location returned by the search provider."""

    name: str = Field(min_length=1)
    label: str = Field(min_length=1)
    coordinate: Coordinate


class LocationSearchResponse(BaseModel):
    """Normalized location autocomplete response."""

    results: list[LocationSearchResult]
