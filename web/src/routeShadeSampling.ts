import * as maplibregl from "maplibre-gl";
import type ShadeMap from "mapbox-gl-shadow-simulator";
import { config } from "./config";
import { BASE_MAP_STYLE, INITIAL_MAP_VIEW, INITIAL_MAP_ZOOM } from "./map/mapConfig";
import type { PlannedRoute } from "./routeApi";

const SAMPLE_TIMEOUT_MS = 15_000;
const EARTH_RADIUS_M = 6_371_008.8;

/** Sample candidate route segments on an invisible MapLibre map using ShadeMap. */
export async function sampleRouteShadows(
  routes: PlannedRoute[],
  signal: AbortSignal,
  evaluationTime: string,
): Promise<PlannedRoute[]> {
  if (!config.shadeMapApiKey || routes.length === 0 || signal.aborted) return routes;

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "512px",
    height: "512px",
    visibility: "hidden",
    pointerEvents: "none",
  });
  document.body.append(container);

  let map: maplibregl.Map;
  try {
    map = new maplibregl.Map({
      container,
      style: BASE_MAP_STYLE,
      center: INITIAL_MAP_VIEW,
      zoom: INITIAL_MAP_ZOOM,
      attributionControl: false,
      interactive: false,
    });
  } catch {
    container.remove();
    return routes;
  }
  let shadeMap: ShadeMap | null = null;
  const dispose = () => {
    shadeMap?.remove();
    map.remove();
    container.remove();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timer);
        signal.removeEventListener("abort", handleAbort);
        window.removeEventListener("unhandledrejection", handleSdkFailure);
      };
      const handleAbort = () => reject(new DOMException("Aborted", "AbortError"));
      const timer = window.setTimeout(
        () => {
          cleanup();
          reject(new Error("ShadeMap sampling timed out"));
        },
        SAMPLE_TIMEOUT_MS,
      );
      const handleSdkFailure = (event: PromiseRejectionEvent) => {
        const message = event.reason instanceof Error ? event.reason.message : "";
        if (!message.startsWith("Could not load ShadeMap API.")) return;
        event.preventDefault();
        cleanup();
        reject(new Error("ShadeMap could not initialize"));
      };
      signal.addEventListener("abort", handleAbort, { once: true });
      window.addEventListener("unhandledrejection", handleSdkFailure);
      map.once("load", () => {
        void import("mapbox-gl-shadow-simulator")
          .then(({ default: ShadeMapSdk }) => {
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            shadeMap = new ShadeMapSdk({
              apiKey: config.shadeMapApiKey,
              date: new Date(evaluationTime),
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
            shadeMap.on("idle", () => {
              cleanup();
              resolve();
            });
            shadeMap.addTo(map as unknown as Parameters<typeof shadeMap.addTo>[0]);
          })
          .catch((error: unknown) => {
            cleanup();
            reject(error);
          });
      });
    });

    if (!shadeMap || signal.aborted) return routes;
    const coords = routes.flatMap((route) => route.geometry.coordinates);
    const bounds = coords.reduce(
      (result, coordinate) => result.extend(coordinate),
      new maplibregl.LngLatBounds(coords[0], coords[0]),
    );
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, SAMPLE_TIMEOUT_MS);
      shadeMap?.once("idle", () => {
        window.clearTimeout(timer);
        resolve();
      });
      map.fitBounds(bounds, { padding: 24, maxZoom: 16, duration: 0 });
    });
    if (signal.aborted) return routes;

    return await Promise.all(
      routes.map(async (route) => {
        const segments = route.shade?.segments ?? [];
        const updatedSegments = await Promise.all(
          segments.map(async (segment) => {
            const distance = (segment.start_distance_m + segment.end_distance_m) / 2;
            const [longitude, latitude] = coordinateAtDistance(route, distance);
            const pixel = map.project([longitude, latitude]);
            try {
              const shaded = await shadeMap?.isPositionInShade(pixel.x, pixel.y);
              return {
                ...segment,
                classification:
                  shaded === undefined
                    ? ("unknown" as const)
                    : shaded
                      ? ("confirmed_shade" as const)
                      : ("confirmed_exposure" as const),
                coverage_confidence: shaded === undefined ? ("insufficient" as const) : ("partial" as const),
              };
            } catch {
              return { ...segment, classification: "unknown" as const, coverage_confidence: "insufficient" as const };
            }
          }),
        );
        const shadedDistance = updatedSegments.reduce(
          (total, segment) =>
            total +
            (segment.classification === "confirmed_shade"
              ? segment.end_distance_m - segment.start_distance_m
              : 0),
          0,
        );
        const unknownDistance = updatedSegments.reduce(
          (total, segment) =>
            total +
            (segment.classification === "unknown"
              ? segment.end_distance_m - segment.start_distance_m
              : 0),
          0,
        );
        const classifiedDistance = Math.max(0, route.distance_m - unknownDistance);
        return {
          ...route,
          shade: {
            shade_coverage_percent:
              classifiedDistance > 0 ? (shadedDistance / classifiedDistance) * 100 : null,
            classified_distance_m: classifiedDistance,
            unknown_distance_m: unknownDistance,
            segments: updatedSegments,
          },
          coverage_confidence: classifiedDistance > 0 ? ("partial" as const) : ("insufficient" as const),
        };
      }),
    );
  } catch {
    return routes;
  } finally {
    dispose();
  }
}

function coordinateAtDistance(
  route: PlannedRoute,
  targetDistance: number,
): [longitude: number, latitude: number] {
  const coordinates = route.geometry.coordinates;
  const lengths = coordinates.slice(1).map((coordinate, index) =>
    haversineDistance(coordinates[index], coordinate),
  );
  const totalGeometryDistance = lengths.reduce((total, length) => total + length, 0);
  const geometryTarget = (targetDistance / route.distance_m) * totalGeometryDistance;
  let traversed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (traversed + length >= geometryTarget || index === lengths.length - 1) {
      const ratio = length > 0 ? (geometryTarget - traversed) / length : 0;
      const start = coordinates[index];
      const end = coordinates[index + 1];
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    }
    traversed += length;
  }
  return coordinates[coordinates.length - 1];
}

function haversineDistance(
  start: [number, number],
  end: [number, number],
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDifference = toRadians(end[1] - start[1]);
  const longitudeDifference = toRadians(end[0] - start[0]);
  const value =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(start[1])) *
      Math.cos(toRadians(end[1])) *
      Math.sin(longitudeDifference / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
