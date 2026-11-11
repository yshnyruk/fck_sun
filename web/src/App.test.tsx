import { describe, it, expect } from "vitest";

describe("FckSun frontend", () => {
  it("provides a browser DOM environment", () => {
    const element = document.createElement("div");

    element.textContent = "FckSun";

    expect(element.textContent).toBe("FckSun");
    expect(window).toBeDefined();
  });
});
