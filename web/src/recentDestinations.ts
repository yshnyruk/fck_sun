/** A destination saved locally for reuse in destination search. */
export type RecentDestination = {
  name: string;
  coordinate: {
    /** Latitude in decimal degrees, from -90 to 90. */
    latitude: number;
    /** Longitude in decimal degrees, from -180 to 180. */
    longitude: number;
  };
};

const STORAGE_KEY = "fck-sun.recent-destinations.v1";

function isRecentDestination(value: unknown): value is RecentDestination {
  if (!value || typeof value !== "object") return false;
  const destination = value as Record<string, unknown>;
  if (typeof destination.name !== "string" || !destination.name.trim()) return false;
  if (!destination.coordinate || typeof destination.coordinate !== "object") return false;
  const coordinate = destination.coordinate as Record<string, unknown>;
  return (
    typeof coordinate.latitude === "number" &&
    Number.isFinite(coordinate.latitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    typeof coordinate.longitude === "number" &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}

/** Read saved destinations, tolerating unavailable storage and malformed data. */
export function readRecentDestinations(): RecentDestination[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentDestination);
  } catch {
    return [];
  }
}

/** Save the latest selection first and deduplicate exact name/coordinate matches. */
export function saveRecentDestination(destination: RecentDestination): RecentDestination[] {
  const next = [
    destination,
    ...readRecentDestinations().filter(
      (saved) =>
        saved.name !== destination.name ||
        saved.coordinate.latitude !== destination.coordinate.latitude ||
        saved.coordinate.longitude !== destination.coordinate.longitude,
    ),
  ];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be disabled or full; the current selection still works in memory.
  }
  return next;
}
