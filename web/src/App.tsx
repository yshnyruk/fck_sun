import * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { MapView } from "./components/MapView";
import { config } from "./config";
import { parseRoutePlanningResponse, type RoutePlanningResponse } from "./routeApi";
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
type SearchTarget = "origin" | "destination";

function RouteSummary({
  route,
  recommended = false,
  label,
}: {
  route: RoutePlanningResponse["recommended_route"];
  recommended?: boolean;
  label?: string;
}) {
  const distance =
    route.distance_m >= 1000
      ? `${(route.distance_m / 1000).toFixed(1)} km`
      : `${Math.round(route.distance_m)} m`;
  const durationMinutes = Math.round(route.duration_s / 60);
  const shadePercent = route.shade?.shade_coverage_percent;
  const confidence =
    route.coverage_confidence === "high"
      ? "High data coverage"
      : route.coverage_confidence === "partial"
        ? "Partial data coverage"
        : "Shade data unavailable";

  return (
    <article className="route-summary">
      <div className="route-summary-heading">
        <strong>{recommended ? "Recommended route" : label}</strong>
        <span>{distance} · {durationMinutes} min</span>
      </div>
      <p>
        {shadePercent === null || shadePercent === undefined
          ? "Shade estimate unavailable"
          : `Estimated shade ${Math.round(shadePercent)}%`}
        {` · ${confidence}`}
      </p>
      {route.shade && route.shade.unknown_distance_m > 0 && (
        <p className="route-summary-unknown">
          Shade unknown for {Math.round(route.shade.unknown_distance_m)} m of this route
        </p>
      )}
    </article>
  );
}

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
  const searchCloseTimeoutRef = useRef<number | null>(null);
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
  const destinationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<maplibregl.LngLat | null>(null);
  const [startingPointLabel, setStartingPointLabel] = useState("Choose a starting point");
  const [startingPointDetail, setStartingPointDetail] = useState("");
  const selectedLocationRef = useRef<maplibregl.LngLat | null>(null);
  const [shadePreference, setShadePreference] = useState<ShadePreference>("full");
  const [navigationStarted, setNavigationStarted] = useState(false);
  const [routeRequestState, setRouteRequestState] = useState<"idle" | "loading" | "error">("idle");
  const [routeRequestError, setRouteRequestError] = useState<string | null>(null);
  const [plannedRoutes, setPlannedRoutes] = useState<RoutePlanningResponse | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleName>("default");
  const [mapStyleOpen, setMapStyleOpen] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState<SearchTarget>("destination");
  const [isPickingDestinationOnMap, setIsPickingDestinationOnMap] = useState(false);
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
  const [minimumPlanningDateTime] = useState(() =>
    toLocalDateTimeInput(new Date(Date.now() + 60_000)),
  );
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
      setPlanningModeMenuAbove(spaceBelow < optionsHeight + 8 && spaceAbove >= optionsHeight + 8);
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
  const setStartingLocation = useCallback(
    (location: maplibregl.LngLatLike, label = "Current location", detail = "Device location") => {
      const lngLat = maplibregl.LngLat.convert(location);
      if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return;
      setSelectedLocation(lngLat);
      selectedLocationRef.current = lngLat;
      setStartingPointLabel(label);
      setStartingPointDetail(detail);
      setRouteRequestError(null);
      setRouteRequestState("idle");
    },
    [],
  );
  const focusCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setRouteRequestError("Location access is unavailable. Choose a starting point on the map.");
      setRouteRequestState("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: maplibregl.LngLatLike = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        const map = mapRef.current;
        setStartingLocation(location);
        if (!map) return;
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
        setRouteRequestError("Could not get your location. Choose a starting point on the map.");
        setRouteRequestState("error");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
  }, [setStartingLocation]);

  useEffect(() => {
    return () => {
      if (searchCloseTimeoutRef.current !== null) {
        window.clearTimeout(searchCloseTimeoutRef.current);
      }
      currentLocationMarkerRef.current?.remove();
      currentLocationMarkerRef.current = null;
      destinationMarkerRef.current?.remove();
      destinationMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const query = destinationQuery.trim();
    if (
      query.length < 2 ||
      (searchTarget === "destination" && selectedDestination?.name === query)
    ) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setDestinationSearchState("loading");
      try {
        const response = await fetch(
          `${config.apiBaseUrl}/search?q=${encodeURIComponent(query)}&limit=5`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Location search failed with status ${response.status}`);
        }
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== "object" ||
          !("results" in data) ||
          !Array.isArray(data.results)
        ) {
          throw new Error("Location search returned an invalid response.");
        }
        if (!data.results.every(isDestinationSearchResult)) {
          throw new Error("Location search returned invalid results.");
        }
        setDestinationSuggestions(data.results);
        setDestinationSearchState("idle");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Unable to search for locations.", error);
        setDestinationSuggestions([]);
        setDestinationSearchState("error");
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [destinationQuery, searchTarget, selectedDestination]);

  const handleDestinationQueryChange = (value: string) => {
    setDestinationQuery(value);
    if (searchTarget === "destination") setNavigationStarted(false);
    setDestinationSuggestions([]);
    setDestinationSearchState("idle");
    setRouteRequestError(null);
  };
  const handleDestinationSelect = (destination: DestinationSearchResult) => {
    const selectedOrigin = searchTarget === "origin";
    if (selectedOrigin) {
      setStartingLocation(
        [destination.coordinate.longitude, destination.coordinate.latitude],
        destination.name,
        destination.label,
      );
      setDestinationQuery("");
    } else {
      destinationMarkerRef.current?.remove();
      destinationMarkerRef.current = null;
      setDestinationQuery(destination.name);
      setSelectedDestination(destination);
      selectedDestinationRef.current = destination;
      if (!selectedLocationRef.current) focusCurrentLocation();
    }
    setNavigationStarted(false);
    setRouteRequestError(null);
    setRouteRequestState("idle");
    setDestinationSuggestions([]);
    setDestinationSearchState("idle");
    setIsClosingSearch(true);
    if (searchCloseTimeoutRef.current !== null) {
      window.clearTimeout(searchCloseTimeoutRef.current);
    }
    searchCloseTimeoutRef.current = window.setTimeout(() => {
      setSearchOpen(false);
      setIsClosingSearch(false);
      setPanelExpanded(true);
      setPanelHeight(Math.round(window.innerHeight * 0.4));
      setDragDistance(0);
      if (selectedOrigin) {
        setSearchTarget("destination");
        setDestinationQuery(selectedDestinationRef.current?.name ?? "");
      }
      searchCloseTimeoutRef.current = null;
    }, 260);
  };
  const startNavigation = async () => {
    if (!selectedDestination) {
      setRouteRequestError("Choose a destination before planning a route.");
      setRouteRequestState("error");
      return;
    }
    if (!selectedLocation) {
      setRouteRequestError("Choose a starting location before planning a route.");
      setRouteRequestState("error");
      return;
    }

    const departureTime = planningMode === "depart_at" ? toUtcISOString(departureDateTime) : null;
    if (planningMode === "depart_at") {
      if (!departureTime) {
        setRouteRequestError("Enter a valid departure date and time.");
        setRouteRequestState("error");
        return;
      }
      if (new Date(departureTime) <= new Date()) {
        setRouteRequestError("Departure time must be in the future.");
        setRouteRequestState("error");
        return;
      }
    }
    const arrivalTime = planningMode === "arrive_by" ? toUtcISOString(arrivalDateTime) : null;
    if (planningMode === "arrive_by") {
      if (!arrivalTime) {
        setRouteRequestError("Enter a valid arrival date and time.");
        setRouteRequestState("error");
        return;
      }
      if (new Date(arrivalTime) <= new Date()) {
        setRouteRequestError("Arrival time must be in the future.");
        setRouteRequestState("error");
        return;
      }
    }

    setRouteRequestState("loading");
    setRouteRequestError(null);
    setPlannedRoutes(null);
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
      const result = parseRoutePlanningResponse(await response.json());
      if (!result) throw new Error("Route planning returned an invalid response");
      setPlannedRoutes(result);
      setRouteRequestState("idle");
      setNavigationStarted(true);
    } catch (error) {
      console.error("Unable to start navigation.", error);
      setRouteRequestState("error");
      setRouteRequestError("Unable to plan this route. Try again.");
    }
  };

  const formattedTime = `${String(Math.floor(time)).padStart(2, "0")}:${time % 1 ? "30" : "00"}`;
  const planningModeLabel =
    planningMode === "leave_now"
      ? `Leave ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date())}`
      : (PLANNING_MODES.find((mode) => mode.value === planningMode)?.label ?? "Leave now");
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
  const clearDestination = useCallback(() => {
    if (!selectedDestinationRef.current) return;
    destinationMarkerRef.current?.remove();
    destinationMarkerRef.current = null;
    selectedDestinationRef.current = null;
    setSelectedDestination(null);
    setDestinationQuery("");
    setDestinationSuggestions([]);
    setDestinationSearchState("idle");
    setNavigationStarted(false);
    setRouteRequestError(null);
    setRouteRequestState("idle");
    setPanelExpanded(false);
    setPanelHeight(collapsedHeight);
    setDragDistance(0);
  }, []);
  const handleMapShortPress = useCallback(() => {
    clearDestination();
  }, [clearDestination]);
  const handleMapLongPress = useCallback((location: maplibregl.LngLatLike) => {
    const lngLat = maplibregl.LngLat.convert(location);
    if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return;

    const destination: DestinationSearchResult = {
      name: "Pinned destination",
      label: `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`,
      coordinate: { latitude: lngLat.lat, longitude: lngLat.lng },
    };
    selectedDestinationRef.current = destination;
    setSelectedDestination(destination);
    setDestinationQuery(destination.name);
    setNavigationStarted(false);
    setRouteRequestError(null);
    setRouteRequestState("idle");
    setIsPickingDestinationOnMap(false);
    setSearchOpen(false);
    setIsClosingSearch(false);
    setDestinationSuggestions([]);
    setDestinationSearchState("idle");
    setPanelExpanded(true);
    setPanelHeight(Math.round(window.innerHeight * 0.4));
    if (!selectedLocationRef.current) focusCurrentLocation();

    const map = mapRef.current;
    if (map) {
      destinationMarkerRef.current?.remove();
      const markerElement = document.createElement("div");
      markerElement.className = "destination-location-marker";
      markerElement.setAttribute("aria-label", "Pinned destination");
      destinationMarkerRef.current = new maplibregl.Marker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat(lngLat)
        .addTo(map);
      destinationMarkerRef.current.getElement().addEventListener("click", (event) => {
        event.stopPropagation();
        clearDestination();
      });
    }
  }, [clearDestination, focusCurrentLocation]);
  const reverseRoutePoints = () => {
    if (!selectedDestination || !selectedLocation) return;

    const previousDestination = selectedDestination;
    const previousOrigin = selectedLocation;
    const previousOriginLabel = startingPointLabel;
    const previousOriginDetail = startingPointDetail;
    destinationMarkerRef.current?.remove();
    destinationMarkerRef.current = null;
    const nextOrigin = maplibregl.LngLat.convert([
      previousDestination.coordinate.longitude,
      previousDestination.coordinate.latitude,
    ]);
    const nextDestination: DestinationSearchResult = {
      name: previousOriginLabel,
      label: previousOriginDetail || "Selected starting point",
      coordinate: { latitude: previousOrigin.lat, longitude: previousOrigin.lng },
    };

    selectedLocationRef.current = nextOrigin;
    setSelectedLocation(nextOrigin);
    setStartingPointLabel(previousDestination.name);
    setStartingPointDetail(previousDestination.label);
    setSelectedDestination(nextDestination);
    selectedDestinationRef.current = nextDestination;
    setSearchTarget("destination");
    setDestinationQuery(nextDestination.name);
    setNavigationStarted(false);
    setRouteRequestError(null);
    setRouteRequestState("idle");
  };
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
  const openSearchScreen = (target: SearchTarget = "destination") => {
    if (searchCloseTimeoutRef.current !== null) {
      window.clearTimeout(searchCloseTimeoutRef.current);
      searchCloseTimeoutRef.current = null;
    }
    setSearchTarget(target);
    setDestinationQuery(target === "destination" && !selectedDestinationRef.current ? destinationQuery : "");
    setDestinationSuggestions([]);
    setDestinationSearchState("idle");
    setIsClosingSearch(false);
    setSearchOpen(true);
  };
  const closeSearchScreen = () => {
    setIsClosingSearch(true);
    if (searchCloseTimeoutRef.current !== null) {
      window.clearTimeout(searchCloseTimeoutRef.current);
    }
    searchCloseTimeoutRef.current = window.setTimeout(() => {
      setSearchOpen(false);
      setIsClosingSearch(false);
      if (!selectedDestinationRef.current) {
        setPanelExpanded(false);
        setPanelHeight(collapsedHeight);
      }
      setDragDistance(0);
      searchCloseTimeoutRef.current = null;
    }, 260);
  };
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (searchOpen) return;
    if (
      (event.target as HTMLElement).closest(
        "button, input, select, textarea, [role='button'], [role='option'], [role='tab']",
      )
    ) {
      return;
    }
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
          onMapLongPress={handleMapLongPress}
          onMapShortPress={handleMapShortPress}
          onMapDragStart={resetExpandedMapControls}
          onMapReady={focusCurrentLocation}
          mapStyle={mapStyle}
          route={plannedRoutes?.recommended_route ?? null}
        />
        {selectedDestination && (
          <section className="route-points-card" aria-label="Route locations">
            <div className="route-points-fields">
              <div className="route-point-field">
                <span className="route-point-symbol route-point-origin" aria-hidden="true" />
                <input
                  aria-label="Starting point"
                  type="text"
                  value={startingPointLabel}
                  readOnly
                  onClick={() => openSearchScreen("origin")}
                />
                <button
                  className="use-current-location"
                  type="button"
                  aria-label="Use current location as starting point"
                  title="Use current location"
                  onClick={(event) => {
                    event.stopPropagation();
                    focusCurrentLocation();
                  }}
                >
                  <Icon name="crosshair" />
                </button>
              </div>
              <div className="route-point-field">
                <span className="route-point-symbol route-point-destination" aria-hidden="true" />
                <input
                  aria-label="Destination"
                  type="text"
                  value={selectedDestination.name}
                  readOnly
                  onClick={() => openSearchScreen("destination")}
                />
              </div>
            </div>
            <button
              className="reverse-route-points"
              type="button"
              aria-label="Reverse starting point and destination"
              title="Reverse route"
              disabled={!selectedLocation}
              onClick={(event) => {
                event.stopPropagation();
                reverseRoutePoints();
              }}
            >
              <Icon name="swap" />
            </button>
          </section>
        )}
        {isPickingDestinationOnMap && (
          <div className="map-pick-hint" role="status">
            <span>Long-press the map to place the destination</span>
            <button
              type="button"
              onClick={() => {
                setIsPickingDestinationOnMap(false);
              }}
            >
              Cancel
            </button>
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
          {!selectedDestination && (
            <div className="search-row mx-auto max-w-[600px]">
              <Icon name="search" />
              <input
                  aria-label={searchTarget === "origin" ? "Search for a starting point" : "Search for a destination"}
                  placeholder={searchTarget === "origin" ? "Starting point" : "Where to?"}
                value={destinationQuery}
                onChange={(event) => handleDestinationQueryChange(event.target.value)}
                  onFocus={() => openSearchScreen()}
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
                    destinationMarkerRef.current?.remove();
                    destinationMarkerRef.current = null;
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
                  ref={planningModeTriggerRef}
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
                          setRouteRequestError(null);
                          setRouteRequestState("idle");
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
                      min={minimumPlanningDateTime}
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
                      min={minimumPlanningDateTime}
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
              {plannedRoutes && (
                <section className="planned-routes" aria-label="Planned routes" aria-live="polite">
                  <RouteSummary route={plannedRoutes.recommended_route} recommended />
                  {plannedRoutes.alternatives.map((route, index) => (
                    <RouteSummary key={route.id} route={route} label={`Alternative ${index + 1}`} />
                  ))}
                </section>
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
                  aria-label={searchTarget === "origin" ? "Search for a starting point" : "Search for a destination"}
                  placeholder={searchTarget === "origin" ? "Search for a starting point" : "Where to?"}
                  value={destinationQuery}
                  onChange={(event) => handleDestinationQueryChange(event.target.value)}
                />
              </div>
              {searchTarget === "destination" && (
                <button
                  className="choose-on-map"
                  type="button"
                  onClick={() => {
                    setIsPickingDestinationOnMap(true);
                    setDestinationSearchState("idle");
                    setDestinationSuggestions([]);
                    setIsClosingSearch(false);
                    setSearchOpen(false);
                  }}
                >
                  <Icon name="crosshair" />
                  Choose on map
                </button>
              )}
            </div>
            <div className="recent-destinations">
              {destinationSearchState === "loading" && (
                <p role="status">Searching locations...</p>
              )}
              {destinationSearchState === "error" && (
                <p className="location-error" role="alert">
                  Location search is unavailable. Try again.
                </p>
              )}
              {destinationSearchState === "idle" &&
                destinationQuery.trim().length >= 2 &&
                destinationSuggestions.length === 0 &&
                <p>
                  No matching {searchTarget === "origin" ? "starting points" : "destinations"} found.
                </p>}
              {destinationSuggestions.length > 0 && (
                <>
                  <p>{searchTarget === "origin" ? "Matching starting points" : "Matching destinations"}</p>
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
              {destinationQuery.trim().length < 2 && searchTarget === "destination" && (
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
