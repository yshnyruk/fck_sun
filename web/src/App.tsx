import * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { MapView } from "./components/MapView";
import { config } from "./config";
import type { MapStyleName } from "./map/mapConfig";
import "./App.css";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

const recentDestinations = [
  "Home",
  "Work",
  "Central Park",
  "Riverside Market",
  "City Library",
  "West Station",
  "Sunset Beach",
  "Old Town",
];

type DestinationSearchResult = {
  name: string;
  label: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
};

function isDestinationSearchResult(value: unknown): value is DestinationSearchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  const coordinate = result.coordinate;
  if (!coordinate || typeof coordinate !== "object") return false;
  const point = coordinate as Record<string, unknown>;
  return (
    typeof result.name === "string" &&
    typeof result.label === "string" &&
    typeof point.latitude === "number" &&
    typeof point.longitude === "number"
  );
}

function App() {
  type StartingLocationMethod = "current" | "manual";

  const [shadowsEnabled, setShadowsEnabled] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isClosingSearch, setIsClosingSearch] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [panelHeight, setPanelHeight] = useState(84);
  const [currentTime] = useState(() => {
    const now = new Date();
    return Math.round((now.getHours() + now.getMinutes() / 60) * 2) / 2;
  });
  const [time, setTime] = useState(currentTime);
  const [dragDistance, setDragDistance] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ y: number; height: number } | null>(null);
  const wasDragged = useRef(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<maplibregl.LngLat | null>(null);
  const selectedLocationRef = useRef<maplibregl.LngLat | null>(null);
  const selectedMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [startingLocationMethod, setStartingLocationMethod] =
    useState<StartingLocationMethod>("current");
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleName>("default");
  const [mapStyleOpen, setMapStyleOpen] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationSuggestions, setDestinationSuggestions] = useState<DestinationSearchResult[]>(
    [],
  );
  const [destinationSearchState, setDestinationSearchState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [selectedDestination, setSelectedDestination] = useState<DestinationSearchResult | null>(
    null,
  );
  const setStartingLocation = useCallback((location: maplibregl.LngLatLike) => {
    const lngLat = maplibregl.LngLat.convert(location);
    if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return;
    setSelectedLocation(lngLat);
    selectedLocationRef.current = lngLat;
  }, []);
  const focusCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Current location is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: maplibregl.LngLatLike = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        const map = mapRef.current;
        setStartingLocationMethod("current");
        setLocationError(null);
        setStartingLocation(location);
        if (!map) return;
        selectedMarkerRef.current?.remove();
        selectedMarkerRef.current = null;
        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setLngLat(location);
        } else {
          const markerElement = document.createElement("div");
          markerElement.className = "current-location-marker";
          markerElement.setAttribute("aria-label", "Your current location");
          currentLocationMarkerRef.current = new maplibregl.Marker({
            element: markerElement,
            anchor: "center",
          })
            .setLngLat(location)
            .addTo(map);
          currentLocationMarkerRef.current.getElement().addEventListener("click", (event) => {
            event.stopPropagation();
          });
        }
        map.flyTo({
          center: location,
          zoom: Math.max(map.getZoom(), 15),
          essential: true,
        });
      },
      () => {
        setLocationError("Unable to determine your current location. Enter it manually instead.");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
  }, [setStartingLocation]);

  useEffect(() => {
    return () => {
      currentLocationMarkerRef.current?.remove();
      currentLocationMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const query = destinationQuery.trim();
    if (query.length < 2 || selectedDestination?.name === query) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setDestinationSearchState("loading");
      try {
        const response = await fetch(
          `${config.apiBaseUrl}/search?q=${encodeURIComponent(query)}&limit=5`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Destination search failed with status ${response.status}`);
        }
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== "object" ||
          !("results" in data) ||
          !Array.isArray(data.results)
        ) {
          throw new Error("Destination search returned an invalid response.");
        }
        if (!data.results.every(isDestinationSearchResult)) {
          throw new Error("Destination search returned invalid results.");
        }
        setDestinationSuggestions(data.results);
        setDestinationSearchState("idle");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Unable to search for destinations.", error);
        setDestinationSuggestions([]);
        setDestinationSearchState("error");
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [destinationQuery, selectedDestination]);

  const handleDestinationQueryChange = (value: string) => {
    setDestinationQuery(value);
    setDestinationSuggestions([]);
    setDestinationSearchState("idle");
    if (selectedDestination && value !== selectedDestination.name) {
      setSelectedDestination(null);
    }
  };
  const handleDestinationSelect = (destination: DestinationSearchResult) => {
    setDestinationQuery(destination.name);
    setSelectedDestination(destination);
    setDestinationSuggestions([]);
    setDestinationSearchState("idle");
    closeSearchScreen();
  };

  const formattedTime = `${String(Math.floor(time)).padStart(2, "0")}:${time % 1 ? "30" : "00"}`;
  const collapsedHeight = 84;
  const getSnapHeights = () => [
    collapsedHeight,
    Math.round(window.innerHeight * 0.4),
    Math.round(window.innerHeight * 0.9),
  ];
  const restingHeight = panelExpanded ? panelHeight : collapsedHeight;
  const maxPanelHeight = Math.round(window.innerHeight * 0.9);
  const sheetHeight = `${Math.min(maxPanelHeight, Math.max(collapsedHeight, restingHeight + dragDistance))}px`;
  const panelAtMaximum = panelHeight >= maxPanelHeight;
  const handleLocationSelect = useCallback((location: maplibregl.LngLatLike) => {
    const lngLat = maplibregl.LngLat.convert(location);
    if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return;

    if (
      selectedLocationRef.current &&
      Math.abs(selectedLocationRef.current.lng - lngLat.lng) < 0.00001 &&
      Math.abs(selectedLocationRef.current.lat - lngLat.lat) < 0.00001
    ) {
      selectedMarkerRef.current?.remove();
      selectedMarkerRef.current = null;
      setSelectedLocation(null);
      selectedLocationRef.current = null;
      return;
    }

    selectedMarkerRef.current?.remove();
    const marker = mapRef.current
      ? new maplibregl.Marker({ color: "#247acb" }).setLngLat(lngLat).addTo(mapRef.current)
      : null;
    if (marker) {
      marker.getElement().addEventListener("click", (event) => {
        event.stopPropagation();
        marker.remove();
        selectedMarkerRef.current = null;
        selectedLocationRef.current = null;
        setSelectedLocation(null);
      });
    }
    selectedMarkerRef.current = marker;
    selectedLocationRef.current = lngLat;
    setSelectedLocation(lngLat);
    setStartingLocationMethod("manual");
    setManualLatitude(lngLat.lat.toFixed(5));
    setManualLongitude(lngLat.lng.toFixed(5));
    setLocationError(null);
  }, []);
  const handleManualLocationSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setLocationError("Enter a latitude from -90 to 90 and longitude from -180 to 180.");
      return;
    }
    handleLocationSelect([longitude, latitude]);
    setStartingLocationMethod("manual");
    setLocationError(null);
    mapRef.current?.flyTo({
      center: [longitude, latitude],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      essential: true,
    });
  };
  const handleMapClick = useCallback(() => {
    if (!selectedMarkerRef.current) return false;

    selectedMarkerRef.current?.remove();
    selectedMarkerRef.current = null;
    selectedLocationRef.current = null;
    setSelectedLocation(null);
    return true;
  }, []);
  const openSearchScreen = () => {
    setIsClosingSearch(false);
    setSearchOpen(true);
  };
  const closeSearchScreen = () => {
    setIsClosingSearch(true);
    window.setTimeout(() => {
      setSearchOpen(false);
      setIsClosingSearch(false);
      setPanelExpanded(false);
      setPanelHeight(collapsedHeight);
      setDragDistance(0);
    }, 260);
  };
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (searchOpen) return;
    dragStart.current = { y: event.clientY, height: restingHeight };
    wasDragged.current = false;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (dragStart.current === null || searchOpen) return;
    const distance = Math.min(
      maxPanelHeight - dragStart.current.height,
      Math.max(-184, dragStart.current.y - event.clientY),
    );
    wasDragged.current = Math.abs(distance) > 8;
    setDragDistance(
      Math.min(
        maxPanelHeight - dragStart.current.height,
        Math.max(collapsedHeight - dragStart.current.height, distance),
      ),
    );
  };
  const handlePointerUp = (event?: React.PointerEvent<HTMLElement>) => {
    if (dragStart.current === null) return;
    if (searchOpen) {
      setDragDistance(0);
      setIsDragging(false);
      dragStart.current = null;
      return;
    }
    const distance = event ? dragStart.current.y - event.clientY : dragDistance;
    const nextHeight = dragStart.current.height + distance;
    const nextPanelHeight = getSnapHeights().reduce((closest, snapHeight) =>
      Math.abs(snapHeight - nextHeight) < Math.abs(closest - nextHeight) ? snapHeight : closest,
    );
    setPanelExpanded(nextPanelHeight > collapsedHeight);
    setPanelHeight(nextPanelHeight);
    setDragDistance(0);
    setIsDragging(false);
    dragStart.current = null;
  };
  const handleHandleClick = () => {
    if (wasDragged.current) {
      wasDragged.current = false;
      return;
    }
    const snapHeights = getSnapHeights();
    const currentIndex = snapHeights.indexOf(panelHeight);
    const nextHeight = snapHeights[(currentIndex + 1) % snapHeights.length];
    setPanelExpanded(nextHeight > collapsedHeight);
    setPanelHeight(nextHeight);
  };
  const handlePanelClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      wasDragged.current ||
      searchOpen ||
      (event.target as HTMLElement).closest("button, input")
    ) {
      wasDragged.current = false;
      return;
    }
    handleHandleClick();
  };

  return (
    <main className="h-full w-full overflow-hidden">
      <section
        className={`map-canvas ${shadowsEnabled ? "show-shadows" : ""} ${panelAtMaximum ? "panel-at-maximum" : ""}`}
        style={{ "--sheet-height": sheetHeight } as React.CSSProperties}
        aria-label="Map"
      >
        <MapView
          mapRef={mapRef}
          onLocationSelect={handleLocationSelect}
          onMapClick={handleMapClick}
          onMapReady={focusCurrentLocation}
          mapStyle={mapStyle}
        />
        {selectedLocation && (
          <div className="selected-location" role="status" aria-live="polite">
            Starting location selected: {selectedLocation.lat.toFixed(5)},{" "}
            {selectedLocation.lng.toFixed(5)}
          </div>
        )}

        <div className="map-style-control absolute right-4 top-4 z-[7] sm:right-6">
          <div className={`map-style-switcher ${mapStyleOpen ? "open" : ""}`}>
            <div className="map-style-options" role="group" aria-label="Map style">
              {(["default", "satellite", "terrain"] as const).map((styleName) => (
                <button
                  key={styleName}
                  className={mapStyle === styleName ? "selected" : ""}
                  type="button"
                  aria-pressed={mapStyle === styleName}
                  onClick={() => {
                    setMapStyle(styleName);
                    setMapStyleOpen(false);
                  }}
                >
                  {styleName}
                </button>
              ))}
            </div>
            <button
              className="map-style-toggle"
              type="button"
              aria-expanded={mapStyleOpen}
              aria-label="Choose map style"
              onClick={() => setMapStyleOpen((open) => !open)}
            >
              <Icon name="layers" />
            </button>
          </div>
        </div>

        <div className="controls-stack absolute right-4 z-[7] flex flex-col gap-2 sm:right-6">
          <button
            className="relative grid h-11 w-11 place-items-center rounded-full border-0 bg-white/95 text-[#1d5c9b] shadow-[0_4px_14px_rgba(31,72,109,0.18)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247acb]"
            type="button"
            aria-label="Orient map north"
            title="Orient map north"
            onClick={() => mapRef.current?.resetNorth()}
          >
            <Icon name="compass" />
            <span className="absolute top-0 text-[8px] font-extrabold text-[#e85c69]">N</span>
          </button>
          <button
            className="grid h-11 w-11 place-items-center rounded-full border-0 bg-white/95 text-[#1d5c9b] shadow-[0_4px_14px_rgba(31,72,109,0.18)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247acb]"
            type="button"
            aria-label="Return to my location"
            title="Return to my location"
            onClick={(event) => {
              event.stopPropagation();
              focusCurrentLocation();
            }}
          >
            <Icon name="crosshair" />
          </button>
          <button
            className={`grid h-11 w-11 place-items-center rounded-full border-0 shadow-[0_4px_14px_rgba(31,72,109,0.18)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247acb] ${
              shadowsEnabled ? "bg-[#247acb] text-white" : "bg-white/95 text-[#1d5c9b]"
            }`}
            type="button"
            aria-pressed={shadowsEnabled}
            aria-label={shadowsEnabled ? "Turn shadows off" : "Turn shadows on"}
            onClick={() => setShadowsEnabled((enabled) => !enabled)}
          >
            <Icon name="shadow" />
          </button>
        </div>

        {shadowsEnabled && (
          <div className="time-dial" aria-label="Shadow time">
            <div className="dial-arc" />
            <div className="dial-marker marker-midnight">
              <Icon name="moon" />
              <span>00:00</span>
            </div>
            <div className="dial-marker marker-sunrise">
              <Icon name="sunrise" />
              <span>06:00</span>
            </div>
            <div className="dial-marker marker-midday">
              <Icon name="sun" />
              <span>12:00</span>
            </div>
            <div className="dial-marker marker-sunset">
              <Icon name="sunset" />
              <span>18:00</span>
            </div>
            <div className="dial-now">
              <span className="dial-now-arrow" />
              <strong>{formattedTime}</strong>
            </div>
            <input
              aria-label="Choose time of day"
              type="range"
              min="0"
              max="24"
              step="0.5"
              value={time}
              onChange={(event) => setTime(Number(event.target.value))}
            />
            {time !== currentTime && (
              <button className="return-now" type="button" onClick={() => setTime(currentTime)}>
                Tap to return to now
              </button>
            )}
          </div>
        )}

        <div
          className={`search-panel h-[var(--sheet-height)] ${isDragging ? "dragging" : "transition-[height] duration-300 ease-out"} ${panelExpanded ? "panel-expanded" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handlePanelClick}
        >
          <button
            className="search-handle touch-none"
            type="button"
            aria-label="Expand destination search"
            onClick={handleHandleClick}
          >
            <span />
          </button>
          <div className="search-row mx-auto max-w-[600px]">
            <Icon name="search" />
            <input
              aria-label="Search for a destination"
              placeholder="Where to?"
              value={destinationQuery}
              onChange={(event) => handleDestinationQueryChange(event.target.value)}
              onFocus={openSearchScreen}
            />
            <button
              className="search-arrow"
              type="button"
              aria-label="Expand search"
              onClick={(event) => {
                event.stopPropagation();
                setPanelHeight(getSnapHeights()[1]);
                openSearchScreen();
              }}
            >
              <Icon name="chevron" />
            </button>
          </div>
          {panelExpanded && (
            <div className="recent-destinations">
              <div className="starting-location">
                <p>Starting location</p>
                <div
                  className="starting-location-methods"
                  role="group"
                  aria-label="Starting location method"
                >
                  <button
                    className={startingLocationMethod === "current" ? "selected" : ""}
                    type="button"
                    aria-pressed={startingLocationMethod === "current"}
                    onClick={(event) => {
                      event.stopPropagation();
                      setStartingLocationMethod("current");
                      focusCurrentLocation();
                    }}
                  >
                    Use current location
                  </button>
                  <button
                    className={startingLocationMethod === "manual" ? "selected" : ""}
                    type="button"
                    aria-pressed={startingLocationMethod === "manual"}
                    onClick={(event) => {
                      event.stopPropagation();
                      setStartingLocationMethod("manual");
                      setLocationError(null);
                    }}
                  >
                    Enter manually
                  </button>
                </div>
                {startingLocationMethod === "manual" && (
                  <form className="manual-location-form" onSubmit={handleManualLocationSubmit}>
                    <label>
                      Latitude
                      <input
                        inputMode="decimal"
                        type="number"
                        min="-90"
                        max="90"
                        step="any"
                        value={manualLatitude}
                        onChange={(event) => setManualLatitude(event.target.value)}
                        placeholder="40.7128"
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        inputMode="decimal"
                        type="number"
                        min="-180"
                        max="180"
                        step="any"
                        value={manualLongitude}
                        onChange={(event) => setManualLongitude(event.target.value)}
                        placeholder="-74.0060"
                      />
                    </label>
                    <button type="submit">Set starting location</button>
                  </form>
                )}
                {locationError && (
                  <p className="location-error" role="alert">
                    {locationError}
                  </p>
                )}
                <p className="location-help">
                  You can also tap the map to choose a starting point.
                </p>
              </div>
              <p>Recent destinations</p>
              {recentDestinations.map((destination) => (
                <button type="button" key={destination}>
                  <span className="recent-icon">
                    <Icon name="arrow" />
                  </span>
                  {destination}
                </button>
              ))}
            </div>
          )}
        </div>
        {searchOpen && (
          <div className={`search-screen ${isClosingSearch ? "closing" : ""}`}>
            <div className="search-screen-header">
              <div className="search-row">
                <button
                  className="search-back"
                  type="button"
                  aria-label="Close search"
                  onClick={closeSearchScreen}
                >
                  <Icon name="back" />
                </button>
                <input
                  autoFocus
                  aria-label="Search for a destination"
                  placeholder="Where to?"
                  value={destinationQuery}
                  onChange={(event) => handleDestinationQueryChange(event.target.value)}
                />
              </div>
            </div>
            <div className="recent-destinations">
              {destinationSearchState === "loading" && (
                <p role="status">Searching destinations...</p>
              )}
              {destinationSearchState === "error" && (
                <p className="location-error" role="alert">
                  Destination search is unavailable. Try again.
                </p>
              )}
              {destinationSearchState === "idle" &&
                destinationQuery.trim().length >= 2 &&
                destinationSuggestions.length === 0 &&
                !selectedDestination && <p>No matching destinations found.</p>}
              {destinationSuggestions.length > 0 && (
                <>
                  <p>Matching destinations</p>
                  {destinationSuggestions.map((destination) => (
                    <button
                      type="button"
                      key={`${destination.name}-${destination.coordinate.latitude}-${destination.coordinate.longitude}`}
                      onClick={() => handleDestinationSelect(destination)}
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
              {destinationQuery.trim().length < 2 && (
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
        )}
      </section>
    </main>
  );
}

export default App;
