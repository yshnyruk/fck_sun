import { Icon } from "./Icon";
import type { DestinationSearchResult } from "./RoutePlannerPanel";

type SearchTarget = "origin" | "destination";
type SearchState = "idle" | "loading" | "error";

type LocationSearchOverlayProps = {
  isOpen: boolean;
  isClosing: boolean;
  target: SearchTarget;
  query: string;
  searchState: SearchState;
  suggestions: DestinationSearchResult[];
  recentDestinations: string[];
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onChooseOnMap: () => void;
  onSelect: (destination: DestinationSearchResult) => void;
};

export function LocationSearchOverlay({
  isOpen,
  isClosing,
  target,
  query,
  searchState,
  suggestions,
  recentDestinations,
  onClose,
  onQueryChange,
  onChooseOnMap,
  onSelect,
}: LocationSearchOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className={`search-screen ${isClosing ? "closing" : ""}`}>
      <div className="search-screen-header">
        <div className="search-row">
          <button className="search-back" type="button" aria-label="Close search" onClick={onClose}>
            <Icon name="back" />
          </button>
          <input
            autoFocus
            aria-label={
              target === "origin" ? "Search for a starting point" : "Search for a destination"
            }
            placeholder={target === "origin" ? "Search for a starting point" : "Where to?"}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        {target === "destination" && (
          <button className="choose-on-map" type="button" onClick={onChooseOnMap}>
            <Icon name="crosshair" />
            Choose on map
          </button>
        )}
      </div>
      <div className="recent-destinations">
        {searchState === "loading" && <p role="status">Searching locations...</p>}
        {searchState === "error" && (
          <p className="location-error" role="alert">
            Location search is unavailable. Try again.
          </p>
        )}
        {searchState === "idle" && query.trim().length >= 2 && suggestions.length === 0 && (
          <p>No matching {target === "origin" ? "starting points" : "destinations"} found.</p>
        )}
        {suggestions.length > 0 && (
          <>
            <p>{target === "origin" ? "Matching starting points" : "Matching destinations"}</p>
            {suggestions.map((destination) => (
              <button
                type="button"
                key={`${destination.name}-${destination.coordinate.latitude}-${destination.coordinate.longitude}`}
                onClick={() => onSelect(destination)}
              >
                <span className="recent-icon">
                  <Icon name="arrow" />
                </span>
                <span>
                  <strong className="destination-name">{destination.name}</strong>
                  <small className="destination-label">{destination.label}</small>
                </span>
              </button>
            ))}
          </>
        )}
        {query.trim().length < 2 && target === "destination" && (
          <>
            <p>Recent destinations</p>
            {recentDestinations.map((destination) => (
              <button type="button" key={destination}>
                <span className="recent-icon">
                  <Icon name="arrow" />
                </span>
                {destination}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
