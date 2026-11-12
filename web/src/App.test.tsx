import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "./App";
import { SHADE_PREFERENCES } from "./shadePreferences";
import { toLocalDateTimeInput, toUtcISOString } from "./planningTime";

vi.mock("./components/MapView", () => ({
  MapView: ({ onLocationSelect }: { onLocationSelect: (location: [number, number]) => void }) => (
    <button type="button" onClick={() => onLocationSelect([-73.98, 40.75])}>
      Set test starting location
    </button>
  ),
}));

async function selectCentralPark(): Promise<void> {
  const destinationInputs = screen.getAllByRole("textbox", {
    name: "Search for a destination",
  });
  fireEvent.focus(destinationInputs[0]);
  const activeSearchInput = screen
    .getAllByRole("textbox", {
      name: "Search for a destination",
    })
    .at(-1);
  if (!activeSearchInput) throw new Error("Destination search input was not rendered");
  fireEvent.change(activeSearchInput, { target: { value: "Central Park" } });

  fireEvent.click(await screen.findByRole("button", { name: /Central Park/ }));
  await screen.findByRole("heading", { name: "Central Park" });
}

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

    expect(toUtcISOString(toLocalDateTimeInput(localDeparture))).toBe(localDeparture.toISOString());
    expect(toUtcISOString("")).toBeNull();
  });

  it("submits selected route inputs and displays loading while the request is pending", async () => {
    let finishRouteRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                name: "Central Park",
                label: "New York, NY",
                coordinate: { latitude: 40.78, longitude: -73.97 },
              },
            ],
          }),
        } as Response);
      }
      return new Promise<Response>((resolve) => {
        finishRouteRequest = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Set test starting location" }));

    await selectCentralPark();
    fireEvent.click(screen.getByRole("tab", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: /Planning time:/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Depart at" }));
    const selectedDeparture = new Date(2030, 4, 10, 14, 30);
    fireEvent.change(screen.getByLabelText("Departure date and time"), {
      target: { value: toLocalDateTimeInput(selectedDeparture) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Start navigation/ }));

    expect(
      (await screen.findByRole("button", { name: "Planning route..." })).hasAttribute("disabled"),
    ).toBe(true);
    const routeRequest = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/routes"));
    expect(routeRequest).toBeDefined();
    expect(routeRequest?.[1]?.method).toBe("POST");
    expect(routeRequest?.[1]?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(String(routeRequest?.[1]?.body))).toMatchObject({
      origin: { latitude: 40.75, longitude: -73.98 },
      destination: { latitude: 40.78, longitude: -73.97 },
      planning_mode: "depart_at",
      shade_preference: "more",
      departure_time: selectedDeparture.toISOString(),
    });

    finishRouteRequest?.({
      ok: true,
      json: async () => ({ recommended_route: {}, alternatives: [] }),
    } as Response);
    expect((await screen.findByRole("button", { name: "Navigation started" })).textContent).toBe(
      "Navigation started",
    );
  });

  it("shows a starting location error and skips submission when origin is missing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/search?")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                name: "Central Park",
                label: "New York, NY",
                coordinate: { latitude: 40.78, longitude: -73.97 },
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ recommended_route: {}, alternatives: [] }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await selectCentralPark();
    fireEvent.click(screen.getByRole("button", { name: /Start navigation/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Choose a starting location before planning a route.",
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/routes"))).toBe(false);
  });

  it("rejects a past scheduled departure before sending a route request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/search?")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                name: "Central Park",
                label: "New York, NY",
                coordinate: { latitude: 40.78, longitude: -73.97 },
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ recommended_route: {}, alternatives: [] }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Set test starting location" }));
    await selectCentralPark();
    fireEvent.click(screen.getByRole("button", { name: /Planning time:/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Depart at" }));
    fireEvent.change(screen.getByLabelText("Departure date and time"), {
      target: { value: toLocalDateTimeInput(new Date(Date.now() - 60 * 60 * 1000)) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Start navigation/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Departure time must be in the future.",
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/routes"))).toBe(false);
  });
});
