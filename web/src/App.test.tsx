import { describe, it, expect } from "vitest";
import { SHADE_PREFERENCES } from "./shadePreferences";

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
});
