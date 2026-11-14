import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, getNavigationProgress } from "./navigation";
import type { PlannedRoute } from "./routeApi";

const route: PlannedRoute = {
  id: "route",
  geometry: {
    type: "LineString",
    coordinates: [
      [0, 0],
      [0.01, 0],
    ],
  },
  distance_m: 1000,
  duration_s: 600,
  score: null,
  shade: null,
  coverage_confidence: "insufficient",
};

describe("navigation progress", () => {
  it("projects the current position onto the selected route", () => {
    const progress = getNavigationProgress(route, [0.005, 0]);

    expect(progress.completedDistanceM).toBeCloseTo(500, -1);
    expect(progress.remainingDistanceM).toBeCloseTo(500, -1);
    expect(progress.completedDistanceM + progress.remainingDistanceM).toBeCloseTo(1000, -1);
    expect(progress.remainingDurationS).toBeCloseTo(300, -1);
  });

  it("keeps progress within the route when the GPS fix is beyond either endpoint", () => {
    expect(getNavigationProgress(route, [-1, 0]).remainingDistanceM).toBe(1000);
    expect(getNavigationProgress(route, [1, 0]).remainingDistanceM).toBe(0);
  });

  it("formats remaining distance and time for the progress panel", () => {
    expect(formatDistance(840)).toBe("840 m");
    expect(formatDistance(1200)).toBe("1.2 km");
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(3660)).toBe("1 hr 1 min");
  });
});
