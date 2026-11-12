import * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { BASE_MAP_STYLE, INITIAL_MAP_VIEW, INITIAL_MAP_ZOOM, MAP_STYLES } from "../map/mapConfig";
import type { MapStyleName } from "../map/mapConfig";
import type { PlannedRoute } from "../routeApi";

type MapViewProps = {
  mapRef: React.RefObject<maplibregl.Map | null>;
  onMapLongPress: (location: maplibregl.LngLatLike) => void;
  onMapShortPress: () => void;
  onMapDragStart: () => void;
  onMapReady: () => void;
  mapStyle: MapStyleName;
  routes: PlannedRoute[];
  selectedRouteId: string | null;
};

export function MapView({
  mapRef,
  onMapLongPress,
  onMapShortPress,
  onMapDragStart,
  onMapReady,
  mapStyle,
  routes,
  selectedRouteId,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

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
    const handleMapClick = () => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
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
    if (mapRef.current) {
      mapRef.current.setStyle(MAP_STYLES[mapStyle]);
    }
  }, [mapRef, mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const renderRoutes = () => {
      for (const layerId of [
        "planned-route-selected-line",
        "planned-route-selected-casing",
        "planned-route-alternative-line",
        "planned-route-alternative-casing",
      ]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
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
      map.addLayer({
        id: "planned-route-alternative-casing",
        type: "line",
        source: "planned-routes",
        filter: ["!=", ["get", "route_id"], selectedRouteId],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.88 },
      });
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
        paint: { "line-color": "#ffffff", "line-width": 11, "line-opacity": 0.96 },
      });
      map.addLayer({
        id: "planned-route-selected-line",
        type: "line",
        source: "planned-routes",
        filter: ["==", ["get", "route_id"], selectedRouteId],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#126fc1", "line-width": 6, "line-opacity": 1 },
      });

      const selectedRoute = routes.find((route) => route.id === selectedRouteId);
      if (!selectedRoute) return;
      const coordinates = selectedRoute.geometry.coordinates;
      const bounds = coordinates.reduce(
        (result, coordinate) => result.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
      );
      map.fitBounds(bounds, { padding: 72, maxZoom: 16, duration: 450 });
    };

    if (map.isStyleLoaded()) renderRoutes();
    map.on("style.load", renderRoutes);
    return () => {
      map.off("style.load", renderRoutes);
    };
  }, [mapRef, routes, selectedRouteId, mapStyle]);

  return <div ref={containerRef} className="maplibre-map" aria-label="Interactive map" />;
}
