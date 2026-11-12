import type { PlannedRoute, ShadeClassification } from "../routeApi";

export type RouteShadeLineFeature = {
  type: "Feature";
  properties: {
    route_id: string;
    classification: ShadeClassification;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
};

const EARTH_RADIUS_M = 6_371_008.8;
const DISTANCE_EPSILON_M = 1e-6;

export function buildRouteShadeFeatures(route: PlannedRoute): RouteShadeLineFeature[] {
  const coordinates = route.geometry.coordinates;
  const cumulativeDistances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] + distanceBetween(coordinates[index - 1], coordinates[index]),
    );
  }

  const geometryDistance = cumulativeDistances[cumulativeDistances.length - 1];
  if (geometryDistance <= DISTANCE_EPSILON_M) {
    return [createFeature(route.id, "unknown", coordinates)];
  }

  const intervals = route.shade?.segments ?? [];
  if (intervals.length === 0) {
    return [createFeature(route.id, "unknown", coordinates)];
  }

  const features: RouteShadeLineFeature[] = [];
  let cursor = 0;
  for (const interval of [...intervals].sort(
    (first, second) => first.start_distance_m - second.start_distance_m,
  )) {
    const start = Math.min(
      geometryDistance,
      Math.max(cursor, Math.max(0, interval.start_distance_m)),
    );
    const end = Math.min(geometryDistance, Math.max(0, interval.end_distance_m));
    if (start > cursor + DISTANCE_EPSILON_M) {
      features.push(createFeature(route.id, "unknown", clipGeometry(cursor, start)));
      cursor = start;
    }
    if (end > start + DISTANCE_EPSILON_M) {
      features.push(createFeature(route.id, interval.classification, clipGeometry(start, end)));
      cursor = end;
    }
  }
  if (geometryDistance > cursor + DISTANCE_EPSILON_M) {
    features.push(createFeature(route.id, "unknown", clipGeometry(cursor, geometryDistance)));
  }

  return features.length > 0 ? features : [createFeature(route.id, "unknown", coordinates)];

  function clipGeometry(startDistance: number, endDistance: number): [number, number][] {
    const clipped: [number, number][] = [pointAtDistance(startDistance)];
    for (let index = 1; index < coordinates.length - 1; index += 1) {
      const vertexDistance = cumulativeDistances[index];
      if (
        vertexDistance > startDistance + DISTANCE_EPSILON_M &&
        vertexDistance < endDistance - DISTANCE_EPSILON_M
      ) {
        clipped.push(coordinates[index]);
      }
    }
    clipped.push(pointAtDistance(endDistance));
    return clipped;
  }

  function pointAtDistance(distance: number): [number, number] {
    const target = Math.min(geometryDistance, Math.max(0, distance));
    for (let index = 1; index < coordinates.length; index += 1) {
      const start = cumulativeDistances[index - 1];
      const end = cumulativeDistances[index];
      if (target <= end || index === coordinates.length - 1) {
        const edgeLength = end - start;
        return interpolateGreatCircle(
          coordinates[index - 1],
          coordinates[index],
          edgeLength <= DISTANCE_EPSILON_M ? 0 : (target - start) / edgeLength,
        );
      }
    }
    return coordinates[coordinates.length - 1];
  }
}

function createFeature(
  routeId: string,
  classification: ShadeClassification,
  coordinates: [number, number][],
): RouteShadeLineFeature {
  return {
    type: "Feature",
    properties: { route_id: routeId, classification },
    geometry: { type: "LineString", coordinates },
  };
}

function distanceBetween(first: [number, number], second: [number, number]): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude1 = toRadians(first[1]);
  const latitude2 = toRadians(second[1]);
  const latitudeDifference = latitude2 - latitude1;
  const longitudeDifference = toRadians(second[0] - first[0]);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDifference / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function interpolateGreatCircle(
  first: [number, number],
  second: [number, number],
  fraction: number,
): [number, number] {
  if (fraction <= 0) return first;
  if (fraction >= 1) return second;

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const toDegrees = (radians: number) => (radians * 180) / Math.PI;
  const latitude1 = toRadians(first[1]);
  const longitude1 = toRadians(first[0]);
  const latitude2 = toRadians(second[1]);
  const longitude2 = toRadians(second[0]);
  const firstVector = [
    Math.cos(latitude1) * Math.cos(longitude1),
    Math.cos(latitude1) * Math.sin(longitude1),
    Math.sin(latitude1),
  ];
  const secondVector = [
    Math.cos(latitude2) * Math.cos(longitude2),
    Math.cos(latitude2) * Math.sin(longitude2),
    Math.sin(latitude2),
  ];
  const dotProduct = firstVector.reduce(
    (sum, value, index) => sum + value * secondVector[index],
    0,
  );
  const angle = Math.acos(Math.min(1, Math.max(-1, dotProduct)));
  if (angle < 1e-10) return first;

  const sineAngle = Math.sin(angle);
  const firstWeight = Math.sin((1 - fraction) * angle) / sineAngle;
  const secondWeight = Math.sin(fraction * angle) / sineAngle;
  const x = firstWeight * firstVector[0] + secondWeight * secondVector[0];
  const y = firstWeight * firstVector[1] + secondWeight * secondVector[1];
  const z = firstWeight * firstVector[2] + secondWeight * secondVector[2];
  return [toDegrees(Math.atan2(y, x)), toDegrees(Math.atan2(z, Math.hypot(x, y)))];
}
