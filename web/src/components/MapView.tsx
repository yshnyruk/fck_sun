import * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { BASE_MAP_STYLE, INITIAL_MAP_VIEW, INITIAL_MAP_ZOOM, MAP_STYLES } from "../map/mapConfig";
import type { MapStyleName } from "../map/mapConfig";

type MapViewProps = {
  mapRef: React.RefObject<maplibregl.Map | null>;
  onLocationSelect: (location: maplibregl.LngLatLike) => void;
  onMapClick: () => boolean;
  onMapDragStart: () => void;
  onMapReady: () => void;
  mapStyle: MapStyleName;
};

export function MapView({
  mapRef,
  onLocationSelect,
  onMapClick,
  onMapDragStart,
  onMapReady,
  mapStyle,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

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
    const handleMapClick = () => {
      onMapClick();
    };
    const clearLongPress = () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
    const startLongPress = (event: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      clearLongPress();
      const location = event.lngLat;
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        onLocationSelect(location);
      }, 650);
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
  }, [mapRef, onLocationSelect, onMapClick, onMapDragStart, onMapReady]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(MAP_STYLES[mapStyle]);
    }
  }, [mapRef, mapStyle]);

  return <div ref={containerRef} className="maplibre-map" aria-label="Interactive map" />;
}
