import * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { MapView } from "./components/MapView";
import { config } from "./config";
import type { MapStyleName } from "./map/mapConfig";
import { SHADE_PREFERENCES, type ShadePreference } from "./shadePreferences";
import { toLocalDateTimeInput, toUtcISOString } from "./planningTime";
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

const PLANNING_MODES = [
  { value: "leave_now", label: "Leave now" },
  { value: "depart_at", label: "Depart at" },
  { value: "arrive_by", label: "Arrive by" },
] as const;
type PlanningMode = (typeof PLANNING_MODES)[number]["value"];

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
  const [shadowsEnabled, setShadowsEnabled] = useState(false);
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
  const [shadePreference, setShadePreference] = useState<ShadePreference>("full");
  const [navigationStarted, setNavigationStarted] = useState(false);
  const [routeRequestState, setRouteRequestState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [routeRequestError, setRouteRequestError] = useState<string | null>(null);
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
  const [planningMode, setPlanningMode] = useState<PlanningMode>("leave_now");
  const [planningModeMenuOpen, setPlanningModeMenuOpen] = useState(false);
  const [planningModeMenuAbove, setPlanningModeMenuAbove] = useState(false);
  const planningModeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const planningModeOptionsRef = useRef<HTMLDivElement | null>(null);
  const [departureDateTime, setDepartureDateTime] = useState("");
  const [arrivalDateTime, setArrivalDateTime] = useState("");
  useLayoutEffect(() => {
    if (!planningModeMenuOpen) return;

    const positionMenu = () => {
      const trigger = planningModeTriggerRef.current;
      const options = planningModeOptionsRef.current;
      if (!trigger || !options) return;
      const triggerRect = trigger.getBoundingClientRect();
      const optionsHeight = options.getBoundingClientRect().height;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      setPlanningModeMenuAbove(
        spaceBelow < optionsHeight + 8 && spaceAbove >= optionsHeight + 8,
      );
    };

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [planningModeMenuOpen]);
  const selectedDestinationRef = useRef<DestinationSearchResult | null>(null);
  const setStartingLocation = useCallback((location: maplibregl.LngLatLike) => {
    const lngLat = maplibregl.LngLat.convert(location);
    if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return;
    setSelectedLocation(lngLat);
    selectedLocationRef.current = lngLat;
  }, []);
  const focusCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: maplibregl.LngLatLike = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        const map = mapRef.current;
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
      (error) => {
        console.error("Unable to determine the user's current location.", error);
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
    setNavigationStarted(false);
    setDestinationSuggestions([]);
    setDestinationSearchState("idle");
    if (selectedDestination && value !== selectedDestination.name) {
      setSelectedDestination(null);
      selectedDestinationRef.current = null;
    }
  };
  const handleDestinationSelect = (destination: DestinationSearchResult) => {
    setDestinationQuery(destination.name);
    setSelectedDestination(destination);
    selectedDestinationRef.current = destination;
    setNavigationStarted(false);
    setDestinationSuggestions([]);
    setDestinationSearchState("idle");
    setIsClosingSearch(true);
    window.setTimeout(() => {
      setSearchOpen(false);
      setIsClosingSearch(false);
      setPanelExpanded(true);
      setPanelHeight(Math.round(window.innerHeight * 0.4));
      setDragDistance(0);
    }, 260);
  };
  const startNavigation = async () => {
    if (!selectedDestination || !selectedLocation) {
      setRouteRequestError("Your current location is not available yet.");
      setRouteRequestState("error");
      return;
    }

    const departureTime = planningMode === "depart_at" ? toUtcISOString(departureDateTime) : null;
    if (planningMode === "depart_at" && (!departureTime || new Date(departureTime) <= new Date())) {
      setRouteRequestError("Choose a future departure date and time.");
      setRouteRequestState("error");
      return;
    }
    const arrivalTime = planningMode === "arrive_by" ? toUtcISOString(arrivalDateTime) : null;
    if (planningMode === "arrive_by" && (!arrivalTime || new Date(arrivalTime) <= new Date())) {
      setRouteRequestError("Choose a future arrival date and time.");
      setRouteRequestState("error");
      return;
    }

    setRouteRequestState("loading");
    setRouteRequestError(null);
    try {
      const response = await fetch(`${config.apiBaseUrl}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: {
            latitude: selectedLocation.lat,
            longitude: selectedLocation.lng,
          },
          destination: selectedDestination.coordinate,
          planning_mode: planningMode,
          shade_preference: shadePreference,
          ...(planningMode === "depart_at"
            ? { departure_time: departureTime }
            : planningMode === "arrive_by"
              ? { arrival_time: arrivalTime }
              : { departure_time: new Date().toISOString() }),
        }),
      });
      if (!response.ok) {
        throw new Error(`Route planning failed with status ${response.status}`);
      }
      await response.json();
      setRouteRequestState("idle");
      setNavigationStarted(true);
    } catch (error) {
      console.error("Unable to start navigation.", error);
      setRouteRequestState("error");
      setRouteRequestError("Unable to plan this route. Try again.");
    }
  };

  const formattedTime = `${String(Math.floor(time)).padStart(2, "0")}:${time % 1 ? "30" : "00"}`;
  const planningModeLabel = planningMode === "leave_now"
    ? `Leave ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date())}`
    : PLANNING_MODES.find((mode) => mode.value === planningMode)?.label ?? "Leave now";
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
  }, []);
  const handleMapClick = useCallback(() => {
    if (!selectedMarkerRef.current) return false;

    selectedMarkerRef.current?.remove();
    selectedMarkerRef.current = null;
    selectedLocationRef.current = null;
    setSelectedLocation(null);
    return true;
  }, []);
  const resetExpandedMapControls = useCallback(() => {
    setMapStyleOpen(false);
    setIsClosingSearch(false);
    setSearchOpen(false);
    if (!selectedDestinationRef.current) {
      setPanelExpanded(false);
      setPanelHeight(collapsedHeight);
    }
    setDragDistance(0);
    setIsDragging(false);
    dragStart.current = null;
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
          onMapDragStart={resetExpandedMapControls}
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
                  ref={planningModeTriggerRef}
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
          {!selectedDestination && (
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
          )}
          {panelExpanded && !selectedDestination && (
            <div className="recent-destinations">
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
          {selectedDestination && (
            <div className="route-planner">
              <div className="route-planner-header">
                <div>
                  <h2>{selectedDestination.name}</h2>
                  <p className="route-planner-label">{selectedDestination.label}</p>
                </div>
                <button
                  className="route-planner-close"
                  type="button"
                  aria-label="Choose a different destination"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedDestination(null);
                    selectedDestinationRef.current = null;
                    setDestinationQuery("");
                    setPanelHeight(getSnapHeights()[1]);
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="route-planner-tabs" role="tablist" aria-label="Shade preference">
                {SHADE_PREFERENCES.map((preference) => (
                  <button
                    key={preference.value}
                    className={shadePreference === preference.value ? "selected" : ""}
                    type="button"
                    role="tab"
                    aria-selected={shadePreference === preference.value}
                    onClick={(event) => {
                      event.stopPropagation();
                      setShadePreference(preference.value);
                    }}
                  >
                    {preference.label}
                  </button>
                ))}
              </div>
              <div className="planning-mode">
                <button
                  className="planning-mode-trigger"
                  type="button"
                  aria-label={`Planning time: ${planningModeLabel}`}
                  aria-haspopup="listbox"
                  aria-expanded={planningModeMenuOpen}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPlanningModeMenuOpen((open) => !open);
                  }}
                >
                  {planningModeLabel}
                  <span aria-hidden="true">▾</span>
                </button>
                {planningModeMenuOpen && (
                  <div
                    ref={planningModeOptionsRef}
                    className={`planning-mode-options ${planningModeMenuAbove ? "above" : ""}`}
                    role="listbox"
                    aria-label="Planning time"
                  >
                    {PLANNING_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        className={planningMode === mode.value ? "selected" : ""}
                        type="button"
                        role="option"
                        aria-selected={planningMode === mode.value}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPlanningMode(mode.value);
                          setPlanningModeMenuOpen(false);
                        }}
                      >
                        {mode.value === "leave_now" ? "Leave now" : mode.label}
                      </button>
                    ))}
                  </div>
                )}
                {planningMode === "depart_at" && (
                  <label className="departure-time-field">
                    <input
                      aria-label="Departure date and time"
                      type="datetime-local"
                      required
                      min={toLocalDateTimeInput(new Date(Date.now() + 60_000))}
                      value={departureDateTime}
                      onChange={(event) => {
                        setDepartureDateTime(event.target.value);
                        setRouteRequestError(null);
                        if (routeRequestState === "error") setRouteRequestState("idle");
                      }}
                    />
                  </label>
                )}
                {planningMode === "arrive_by" && (
                  <label className="departure-time-field">
                    <input
                      aria-label="Arrival date and time"
                      type="datetime-local"
                      required
                      min={toLocalDateTimeInput(new Date(Date.now() + 60_000))}
                      value={arrivalDateTime}
                      onChange={(event) => {
                        setArrivalDateTime(event.target.value);
                        setRouteRequestError(null);
                        if (routeRequestState === "error") setRouteRequestState("idle");
                      }}
                    />
                  </label>
                )}
              </div>
              <button
                className="start-navigation"
                type="button"
                disabled={routeRequestState === "loading"}
                onClick={(event) => {
                  event.stopPropagation();
                  void startNavigation();
                }}
              >
                {routeRequestState === "loading"
                  ? "Planning route..."
                  : navigationStarted
                    ? "Navigation started"
                    : "Start navigation"}
              </button>
              {routeRequestError && (
                <p className="location-error" role="alert">
                  {routeRequestError}
                </p>
              )}
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
