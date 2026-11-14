import type { PlannedRoute } from "./routeApi";

export type NavigationProgress = {
  completedDistanceM: number;
  remainingDistanceM: number;
  remainingDurationS: number;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function distanceBetween(first: [number, number], second: [number, number]): number {
  const earthRadiusM = 6_371_000;
  const latitudeDelta = toRadians(second[1] - first[1]);
  const longitudeDelta = toRadians(second[0] - first[0]);
  const firstLatitude = toRadians(first[1]);
  const secondLatitude = toRadians(second[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function getNavigationProgress(
  route: PlannedRoute,
  location: [number, number],
): NavigationProgress {
  const coordinates = route.geometry.coordinates;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let distanceAlongRouteM = 0;
  let walkedDistanceM = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    if (!start || !end) continue;
    const segmentLength = distanceBetween(start, end);
    const latitudeScale = 111_320;
    const longitudeScale = latitudeScale * Math.cos(toRadians((start[1] + end[1]) / 2));
    const endX = (end[0] - start[0]) * longitudeScale;
    const endY = (end[1] - start[1]) * latitudeScale;
    const locationX = (location[0] - start[0]) * longitudeScale;
    const locationY = (location[1] - start[1]) * latitudeScale;
    const denominator = endX * endX + endY * endY;
    const fraction =
      denominator === 0
        ? 0
        : Math.max(0, Math.min(1, (locationX * endX + locationY * endY) / denominator));
    const distanceToSegment = Math.hypot(locationX - fraction * endX, locationY - fraction * endY);
    if (distanceToSegment < nearestDistance) {
      nearestDistance = distanceToSegment;
      distanceAlongRouteM = walkedDistanceM + segmentLength * fraction;
    }
    walkedDistanceM += segmentLength;
  }

  const progress =
    walkedDistanceM > 0 ? Math.max(0, Math.min(1, distanceAlongRouteM / walkedDistanceM)) : 0;
  const completedDistanceM = route.distance_m * progress;
  const remainingDistanceM = Math.max(0, route.distance_m * (1 - progress));
  return {
    completedDistanceM,
    remainingDistanceM,
    remainingDurationS: route.duration_s * (1 - progress),
  };
}

export function formatDistance(distanceM: number): string {
  return distanceM >= 1000
    ? `${(distanceM / 1000).toFixed(1)} km`
    : `${Math.round(distanceM / 10) * 10} m`;
}

export function formatDuration(durationS: number): string {
  const minutes = Math.max(1, Math.ceil(durationS / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}
