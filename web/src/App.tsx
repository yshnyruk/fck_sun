import * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

const BASE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const INITIAL_MAP_VIEW: maplibregl.MapOptions["center"] = [-73.97, 40.78];
const INITIAL_MAP_ZOOM = 12;
const MAP_STYLES = {
  default: BASE_MAP_STYLE,
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "© Esri",
      },
    },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }],
  },
  terrain: {
    version: 8,
    sources: {
      terrain: {
        type: "raster",
        tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenTopoMap contributors",
      },
    },
    layers: [{ id: "terrain", type: "raster", source: "terrain" }],
  },
} satisfies Record<string, maplibregl.StyleSpecification | string>;

type MapStyleName = keyof typeof MAP_STYLES;

type IconName =
  | "arrow"
  | "back"
  | "chevron"
  | "compass"
  | "crosshair"
  | "layers"
  | "moon"
  | "search"
  | "shadow"
  | "sun"
  | "sunrise"
  | "sunset";

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

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="m5 12 14-7-7 14-2-5-5-2Z" />,
    back: <path d="m15 18-6-6 6-6M9 12h10" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    compass: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m15.8 8.2-2.2 5.6-5.6 2.2 2.2-5.6 5.6-2.2Z" />
      </>
    ),
    crosshair: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 8 4-8 4-8-4 8-4Z" />
        <path d="m4 12 8 4 8-4M4 17l8 4 8-4" />
      </>
    ),
    moon: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4 4" />
      </>
    ),
    shadow: (
      <>
        <path d="M5 18h14M7 15h10M9 12h6M11 9h2" />
        <path d="m6 5 12 12" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    sunrise: (
      <>
        <path d="M3 18h18M6 15a6 6 0 0 1 12 0M12 3v3M5.6 7.6l2 2M18.4 7.6l-2 2" />
      </>
    ),
    sunset: (
      <>
        <path d="M3 18h18M6 15a6 6 0 0 1 12 0M12 3v3M5.6 7.6l2 2M18.4 7.6l-2 2" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none">
      {paths[name]}
    </svg>
  );
}

function MapView({
  mapRef,
  onLocationSelect,
  onMapClick,
  onMapReady,
  mapStyle,
}: {
  mapRef: React.RefObject<maplibregl.Map | null>;
  onLocationSelect: (location: maplibregl.LngLatLike) => void;
  onMapClick: () => boolean;
  onMapReady: () => void;
  mapStyle: MapStyleName;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_MAP_STYLE,
      center: INITIAL_MAP_VIEW,
      zoom: INITIAL_MAP_ZOOM,
      minZoom: 2,
      maxZoom: 19,
      dragPan: true,
      scrollZoom: true,
      touchZoomRotate: true,
      attributionControl: { compact: true },
    });

    mapRef.current = map;
    map.once("load", onMapReady);
    const hideThreeDimensionalBuildings = () => {
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type === "fill-extrusion") {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
    };
    map.on("style.load", hideThreeDimensionalBuildings);
    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      if (onMapClick()) return;
      onLocationSelect(event.lngLat);
    };
    map.on("click", handleMapClick);

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      map.off("click", handleMapClick);
      map.off("style.load", hideThreeDimensionalBuildings);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [mapRef, onLocationSelect, onMapClick, onMapReady]);

  useEffect(() => {
    mapRef.current?.setStyle(MAP_STYLES[mapStyle]);
  }, [mapRef, mapStyle]);

  return <div ref={containerRef} className="maplibre-map" aria-label="Interactive map" />;
}

function App() {
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
  const [mapStyle, setMapStyle] = useState<MapStyleName>("default");
  const [mapStyleOpen, setMapStyleOpen] = useState(false);
  const focusCurrentLocation = useCallback(() => {
    if (!navigator.geolocation || !mapRef.current) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: maplibregl.LngLatLike = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        const map = mapRef.current;
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
        console.error("Unable to determine current location.", error);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      currentLocationMarkerRef.current?.remove();
      currentLocationMarkerRef.current = null;
    };
  }, []);

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
  }, []);
  const handleMapClick = useCallback(() => {
    if (!selectedLocationRef.current) return false;

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
                <input autoFocus aria-label="Search for a destination" placeholder="Where to?" />
              </div>
            </div>
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
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
