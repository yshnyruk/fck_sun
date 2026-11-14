import * as maplibregl from "maplibre-gl";
import type ShadeMap from "mapbox-gl-shadow-simulator";
import { useEffect, useRef, useState } from "react";
import { config } from "../config";
import { BASE_MAP_STYLE, INITIAL_MAP_VIEW, INITIAL_MAP_ZOOM, MAP_STYLES } from "../map/mapConfig";
import type { MapStyleName } from "../map/mapConfig";
import { buildRouteShadeFeatures } from "../map/routeShadeSegments";
import type { PlannedRoute } from "../routeApi";

type MapViewProps = {
  mapRef: React.RefObject<maplibregl.Map | null>;
  onMapLongPress: (location: maplibregl.LngLatLike) => void;
  onMapShortPress: () => void;
  onMapDragStart: () => void;
  onMapReady: () => void;
  onSelectRoute: (routeId: string) => void;
  mapStyle: MapStyleName;
  routes: PlannedRoute[];
  selectedRouteId: string | null;
  navigationLocation: [number, number] | null;
  routeArrivalTimes: Record<string, string>;
  shadowsEnabled: boolean;
  shadowTime: string;
};

export function MapView({
  mapRef,
  onMapLongPress,
  onMapShortPress,
  onMapDragStart,
  onMapReady,
  onSelectRoute,
  mapStyle,
  routes,
  selectedRouteId,
  navigationLocation,
  routeArrivalTimes,
  shadowsEnabled,
  shadowTime,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appliedMapStyleRef = useRef<MapStyleName>("default");
  const longPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const shadeMapRef = useRef<ShadeMap | null>(null);
  const navigationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const shadowTimeRef = useRef(shadowTime);
  const onSelectRouteRef = useRef(onSelectRoute);
  const [shadowStatus, setShadowStatus] = useState<"idle" | "ready" | "error">("idle");

  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!navigationLocation || !map) {
      navigationMarkerRef.current?.remove();
      navigationMarkerRef.current = null;
      return;
    }
    if (!navigationMarkerRef.current) {
      const element = document.createElement("div");
      element.className = "navigation-location-marker";
      element.setAttribute("aria-label", "Your live location on the selected route");
      navigationMarkerRef.current = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat(navigationLocation)
        .addTo(map);
    }
    navigationMarkerRef.current.setLngLat(navigationLocation);
    map.easeTo({ center: navigationLocation, duration: 350, essential: true });
  }, [mapRef, navigationLocation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: BASE_MAP_STYLE,
      center: INITIAL_MAP_VIEW,
      zoom: INITIAL_MAP_ZOOM,
      minZoom: 2,
      maxZoom: 19,
      attributionControl: { compact: true },
    });

    const hideThreeDimensionalBuildings = () => {
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type === "fill-extrusion") {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
    };
    const clearLongPress = () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
    const startLongPress = (event: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      clearLongPress();
      longPressTriggeredRef.current = false;
      const location = event.lngLat;
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressTriggeredRef.current = true;
        onMapLongPress(location);
      }, 650);
    };
    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      const clickableLayers = [
        "planned-route-selected-casing",
        "planned-route-shade-segments",
        "planned-route-exposure-segments",
        "planned-route-unknown-segments",
        "planned-route-alternative-line",
        "planned-route-alternative-casing",
      ].filter((layer) => map.getLayer(layer));
      if (clickableLayers.length > 0) {
        const routeFeature = map.queryRenderedFeatures(event.point, { layers: clickableLayers })[0];
        const routeId = routeFeature?.properties?.route_id;
        if (typeof routeId === "string") {
          onSelectRouteRef.current(routeId);
          return;
        }
      }
      onMapShortPress();
    };
    const handleMapDragStart = () => {
      clearLongPress();
      onMapDragStart();
    };
    const resizeObserver = new ResizeObserver(() => map.resize());

    mapRef.current = map;
    map.on("style.load", hideThreeDimensionalBuildings);
    map.on("click", handleMapClick);
    map.on("mousedown", startLongPress);
    map.on("mouseup", clearLongPress);
    map.on("touchstart", startLongPress);
    map.on("touchend", clearLongPress);
    map.on("dragstart", handleMapDragStart);
    map.once("load", onMapReady);
    resizeObserver.observe(container);

    return () => {
      map.off("style.load", hideThreeDimensionalBuildings);
      map.off("click", handleMapClick);
      map.off("mousedown", startLongPress);
      map.off("mouseup", clearLongPress);
      map.off("touchstart", startLongPress);
      map.off("touchend", clearLongPress);
      map.off("dragstart", handleMapDragStart);
      clearLongPress();
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [mapRef, onMapLongPress, onMapShortPress, onMapDragStart, onMapReady]);

  useEffect(() => {
    if (mapRef.current && appliedMapStyleRef.current !== mapStyle) {
      mapRef.current.setStyle(MAP_STYLES[mapStyle]);
      appliedMapStyleRef.current = mapStyle;
    }
  }, [mapRef, mapStyle]);

  useEffect(() => {
    shadowTimeRef.current = shadowTime;
    shadeMapRef.current?.setDate(new Date(shadowTime));
  }, [shadowTime]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !shadowsEnabled || !config.shadeMapApiKey) return;

    let disposed = false;
    let initializationTimer: ReturnType<typeof window.setTimeout> | null = null;
    let initializationFrame: number | null = null;
    let shadeMap: ShadeMap | null = null;
    const handleSdkRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : "";
      if (!message.startsWith("Could not load ShadeMap API.")) return;
      event.preventDefault();
      if (initializationTimer !== null) window.clearTimeout(initializationTimer);
      setShadowStatus("error");
    };
    window.addEventListener("unhandledrejection", handleSdkRejection);

    const initializeShadeMap = async () => {
      if (disposed || shadeMap || !map.isStyleLoaded()) return;
      map.off("load", initializeShadeMap);
      try {
        const { default: ShadeMapSdk } = await import("mapbox-gl-shadow-simulator");
        if (disposed || shadeMap || !map.isStyleLoaded()) return;
        const currentShadeMap = new ShadeMapSdk({
          apiKey: config.shadeMapApiKey,
          date: new Date(shadowTimeRef.current),
          color: "#142a3d",
          opacity: 0.42,
          getFeatures: async () =>
            (map.getSource("openmaptiles")
              ? map
                  .querySourceFeatures("openmaptiles", { sourceLayer: "building" })
                  .filter((feature) => {
                    const properties = feature.properties;
                    return (
                      properties !== null &&
                      properties.underground !== "true" &&
                      (properties.height !== undefined || properties.render_height !== undefined)
                    );
                  })
              : []) as unknown as Awaited<
              ReturnType<NonNullable<ConstructorParameters<typeof ShadeMap>[0]["getFeatures"]>>
            >,
        });
        shadeMap = currentShadeMap;
        currentShadeMap.on("idle", () => {
          if (!disposed && shadeMapRef.current === currentShadeMap) {
            if (initializationTimer !== null) window.clearTimeout(initializationTimer);
            setShadowStatus("ready");
          }
        });
        shadeMapRef.current = currentShadeMap;
        currentShadeMap.addTo(map as unknown as Parameters<typeof currentShadeMap.addTo>[0]);
        if (initializationTimer !== null) window.clearTimeout(initializationTimer);
        initializationTimer = window.setTimeout(() => {
          if (!disposed) setShadowStatus("error");
        }, 20_000);
      } catch {
        if (!disposed) setShadowStatus("error");
      }
    };

    map.on("style.load", initializeShadeMap);
    if (map.isStyleLoaded()) initializeShadeMap();
    else map.once("load", initializeShadeMap);
    initializationFrame = window.requestAnimationFrame(() => setShadowStatus("idle"));

    return () => {
      disposed = true;
      map.off("style.load", initializeShadeMap);
      map.off("load", initializeShadeMap);
      if (initializationTimer !== null) window.clearTimeout(initializationTimer);
      if (initializationFrame !== null) window.cancelAnimationFrame(initializationFrame);
      window.removeEventListener("unhandledrejection", handleSdkRejection);
      shadeMap?.remove();
      if (shadeMapRef.current === shadeMap) shadeMapRef.current = null;
    };
  }, [mapRef, mapStyle, shadowsEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let rendered = false;
    let arrivalMarkers: maplibregl.Marker[] = [];
    const renderRoutes = () => {
      if (rendered || !map.isStyleLoaded()) return;
      rendered = true;
      for (const layerId of [
        "planned-route-selected-casing",
        "planned-route-shade-segments",
        "planned-route-exposure-segments",
        "planned-route-unknown-segments",
        "planned-route-alternative-line",
        "planned-route-alternative-casing",
      ]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      arrivalMarkers.forEach((marker) => marker.remove());
      arrivalMarkers = [];
      if (map.getSource("planned-route-segments")) map.removeSource("planned-route-segments");
      if (map.getSource("planned-routes")) map.removeSource("planned-routes");
      if (routes.length === 0 || !selectedRouteId) return;

      map.addSource("planned-routes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: routes.map((route) => ({
            type: "Feature",
            properties: { route_id: route.id },
            geometry: route.geometry,
          })),
        },
      });
      const selectedRoute = routes.find((route) => route.id === selectedRouteId);
      if (!selectedRoute) return;
      map.addSource("planned-route-segments", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: buildRouteShadeFeatures(selectedRoute).map((feature) => ({
            ...feature,
            properties: { ...feature.properties, route_id: selectedRoute.id },
          })),
        },
      });
      map.addLayer({
        id: "planned-route-alternative-casing",
        type: "line",
        source: "planned-routes",
        filter: ["!=", ["get", "route_id"], selectedRouteId],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.88 },
      });

      for (const route of routes) {
        const coordinates = route.geometry.coordinates;
        const midpoint = coordinates[Math.floor(coordinates.length / 2)];
        const arrival = routeArrivalTimes[route.id];
        if (!midpoint || !arrival) continue;
        const formattedArrival = new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(arrival));
        const element = document.createElement("div");
        element.className = `route-arrival-marker${
          route.id === selectedRouteId ? " selected" : ""
        }`;
        element.setAttribute("aria-label", `Estimated arrival ${formattedArrival}`);
        element.innerHTML = `<span class="route-arrival-balloon" aria-hidden="true">🎈</span><span class="route-arrival-time">${formattedArrival}</span>`;
        arrivalMarkers.push(new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(midpoint).addTo(map));
      }
      map.addLayer({
        id: "planned-route-alternative-line",
        type: "line",
        source: "planned-routes",
        filter: ["!=", ["get", "route_id"], selectedRouteId],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#70879b", "line-width": 4, "line-opacity": 0.88 },
      });
      map.addLayer({
        id: "planned-route-selected-casing",
        type: "line",
        source: "planned-routes",
        filter: ["==", ["get", "route_id"], selectedRouteId],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.96 },
      });
      map.addLayer({
        id: "planned-route-shade-segments",
        type: "line",
        source: "planned-route-segments",
        filter: ["==", ["get", "classification"], "confirmed_shade"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#23845b", "line-width": 6, "line-opacity": 1 },
      });
      map.addLayer({
        id: "planned-route-exposure-segments",
        type: "line",
        source: "planned-route-segments",
        filter: ["==", ["get", "classification"], "confirmed_exposure"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#dc8435", "line-width": 6, "line-opacity": 1 },
      });
      map.addLayer({
        id: "planned-route-unknown-segments",
        type: "line",
        source: "planned-route-segments",
        filter: ["==", ["get", "classification"], "unknown"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#75879a",
          "line-width": 5,
          "line-dasharray": [1.5, 1.5],
          "line-opacity": 0.95,
        },
      });

      const coordinates = selectedRoute.geometry.coordinates;
      const bounds = coordinates.reduce(
        (result, coordinate) => result.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
      );
      map.fitBounds(bounds, { padding: 72, maxZoom: 16, duration: 450 });
    };

    if (map.isStyleLoaded()) renderRoutes();
    map.on("style.load", renderRoutes);
    map.on("load", renderRoutes);
    map.on("render", renderRoutes);
    return () => {
      map.off("style.load", renderRoutes);
      map.off("load", renderRoutes);
      map.off("render", renderRoutes);
      arrivalMarkers.forEach((marker) => marker.remove());
    };
  }, [mapRef, routes, selectedRouteId, routeArrivalTimes, mapStyle]);

  return (
    <>
      <div ref={containerRef} className="maplibre-map" aria-label="Interactive map" />
      {shadowsEnabled && (
        <div
          className="absolute bottom-[calc(var(--sheet-height)+1rem)] left-4 z-[5] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-[#24435c] shadow-md sm:left-6"
          role="status"
          aria-live="polite"
        >
          {!config.shadeMapApiKey && "Configure a ShadeMap browser key to show shadows"}
          {config.shadeMapApiKey && shadowStatus === "idle" && "Loading shadow data…"}
          {config.shadeMapApiKey && shadowStatus === "ready" && "ShadeMap shadows loaded"}
          {config.shadeMapApiKey &&
            shadowStatus === "error" &&
            "ShadeMap could not load shadows for this area"}
        </div>
      )}
    </>
  );
}
