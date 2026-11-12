export type CoverageConfidence = "high" | "partial" | "insufficient";
export type ShadeClassification = "confirmed_shade" | "confirmed_exposure" | "unknown";

export type RouteShadeSegment = {
  start_distance_m: number;
  end_distance_m: number;
  classification: ShadeClassification;
  coverage_confidence: CoverageConfidence;
};

export type PlannedRoute = {
  id: string;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  distance_m: number;
  duration_s: number;
  score: number | null;
  shade: {
    shade_coverage_percent: number | null;
    classified_distance_m: number;
    unknown_distance_m: number;
    segments: RouteShadeSegment[];
  } | null;
  coverage_confidence: CoverageConfidence;
};

export type RoutePlanningResponse = {
  recommended_route: PlannedRoute;
  alternatives: PlannedRoute[];
};

const coverageValues: CoverageConfidence[] = ["high", "partial", "insufficient"];
const shadeValues: ShadeClassification[] = ["confirmed_shade", "confirmed_exposure", "unknown"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCoverageConfidence(value: unknown): value is CoverageConfidence {
  return typeof value === "string" && coverageValues.includes(value as CoverageConfidence);
}

function parseRoute(value: unknown): PlannedRoute | null {
  if (!isRecord(value) || !isRecord(value.geometry) || value.geometry.type !== "LineString") {
    return null;
  }
  const coordinates = value.geometry.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !coordinates.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        isFiniteNumber(point[0]) &&
        point[0] >= -180 &&
        point[0] <= 180 &&
        isFiniteNumber(point[1]) &&
        point[1] >= -90 &&
        point[1] <= 90,
    ) ||
    typeof value.id !== "string" ||
    !value.id ||
    !isFiniteNumber(value.distance_m) ||
    value.distance_m <= 0 ||
    !isFiniteNumber(value.duration_s) ||
    value.duration_s <= 0 ||
    (value.score !== null &&
      (!isFiniteNumber(value.score) || value.score < 0 || value.score > 1)) ||
    !isCoverageConfidence(value.coverage_confidence)
  ) {
    return null;
  }

  let shade: PlannedRoute["shade"] = null;
  if (value.shade !== null) {
    if (!isRecord(value.shade)) return null;
    const rawShade = value.shade;
    const shadePercent = rawShade.shade_coverage_percent;
    if (
      (shadePercent !== null &&
        (!isFiniteNumber(shadePercent) || shadePercent < 0 || shadePercent > 100)) ||
      !isFiniteNumber(rawShade.classified_distance_m) ||
      rawShade.classified_distance_m < 0 ||
      !isFiniteNumber(rawShade.unknown_distance_m) ||
      rawShade.unknown_distance_m < 0 ||
      !Array.isArray(rawShade.segments)
    ) {
      return null;
    }
    const segments: RouteShadeSegment[] = [];
    for (const segment of rawShade.segments) {
      if (
        !isRecord(segment) ||
        !isFiniteNumber(segment.start_distance_m) ||
        segment.start_distance_m < 0 ||
        !isFiniteNumber(segment.end_distance_m) ||
        segment.end_distance_m <= segment.start_distance_m ||
        typeof segment.classification !== "string" ||
        !shadeValues.includes(segment.classification as ShadeClassification) ||
        !isCoverageConfidence(segment.coverage_confidence)
      ) {
        return null;
      }
      segments.push({
        start_distance_m: segment.start_distance_m,
        end_distance_m: segment.end_distance_m,
        classification: segment.classification as ShadeClassification,
        coverage_confidence: segment.coverage_confidence,
      });
    }
    shade = {
      shade_coverage_percent: shadePercent,
      classified_distance_m: rawShade.classified_distance_m,
      unknown_distance_m: rawShade.unknown_distance_m,
      segments,
    };
  }

  return {
    id: value.id,
    geometry: { type: "LineString", coordinates: coordinates as [number, number][] },
    distance_m: value.distance_m,
    duration_s: value.duration_s,
    score: value.score as number | null,
    shade,
    coverage_confidence: value.coverage_confidence,
  };
}

export function parseRoutePlanningResponse(value: unknown): RoutePlanningResponse | null {
  if (!isRecord(value) || !Array.isArray(value.alternatives)) return null;
  const recommendedRoute = parseRoute(value.recommended_route);
  const alternatives = value.alternatives.map(parseRoute);
  if (!recommendedRoute || alternatives.some((route) => route === null)) return null;
  return {
    recommended_route: recommendedRoute,
    alternatives: alternatives as PlannedRoute[],
  };
}
