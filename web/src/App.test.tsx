import { describe, it, expect } from "vitest";
import { SHADE_PREFERENCES } from "./shadePreferences";
import { toLocalDateTimeInput, toUtcISOString } from "./planningTime";

describe("FckSun frontend", () => {
  it("provides a browser DOM environment", () => {
    const element = document.createElement("div");

    element.textContent = "FckSun";

    expect(element.textContent).toBe("FckSun");
    expect(window).toBeDefined();
  });

  it("defines the five route-planning shade preferences", () => {
    expect(SHADE_PREFERENCES.map((preference) => preference.value)).toEqual([
      "full",
      "more",
      "medium",
      "less",
      "no_shadow",
    ]);
  });

  it("converts a selected local departure time to an ISO timestamp", () => {
    const localDeparture = new Date(2030, 4, 10, 14, 30);

    expect(toUtcISOString(toLocalDateTimeInput(localDeparture))).toBe(
      localDeparture.toISOString(),
    );
    expect(toUtcISOString("")).toBeNull();
  });
});
