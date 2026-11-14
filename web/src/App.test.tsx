import { fireEvent, render, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { LngLatLike } from "maplibre-gl";
import App from "./App";
import { SHADE_PREFERENCES } from "./shadePreferences";
import { toLocalDateTimeInput, toUtcISOString } from "./planningTime";

vi.mock("./components/MapView", () => ({
  MapView: ({
    onMapLongPress,
    onMapShortPress,
    onMapReady,
  }: {
    onMapLongPress: (location: LngLatLike) => void;
    onMapShortPress: () => void;
    onMapReady: () => void;
  }) => (
    <>
      <button type="button" onClick={onMapReady}>
        Set test starting location
      </button>
      <button type="button" onClick={() => onMapLongPress([-73.96, 40.8])}>
        Long press map
      </button>
      <button type="button" onClick={onMapShortPress}>
        Short press map
      </button>
    </>
  ),
}));

vi.mock("./routeShadeSampling", () => ({
  sampleRouteShadows: async (routes: unknown[]) => routes,
}));

const geolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, "geolocation");
const routeResponse = {
  recommended_route: {
    id: "route-1",
    geometry: {
      type: "LineString",
      coordinates: [
        [-73.98, 40.75],
        [-73.97, 40.78],
      ],
    },
    distance_m: 1200,
    duration_s: 900,
    score: 0.8,
    shade: {
      shade_coverage_percent: 65,
      classified_distance_m: 1000,
      unknown_distance_m: 200,
      segments: [],
    },
    coverage_confidence: "partial",
  },
  alternatives: [],
};

beforeEach(() => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: {
            latitude: 40.75,
            longitude: -73.98,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
      watchPosition: (success: PositionCallback) => {
        success({
          coords: {
            latitude: 40.75,
            longitude: -73.98,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
        return 1;
      },
      clearWatch: () => undefined,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (geolocationDescriptor) {
    Object.defineProperty(navigator, "geolocation", geolocationDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "geolocation");
  }
});

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
  await waitForElementToBeRemoved(() =>
    screen.queryByRole("textbox", { name: "Search for a destination" }),
  );
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

  it("shows a straight shadow-time slider and updates its displayed time", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Turn shadows on" }));
    expect(screen.getByText("Shadow time")).toBeDefined();
    const slider = screen.getByRole("slider", { name: "Choose time of day" });
    fireEvent.change(slider, { target: { value: "12" } });

    expect(within(screen.getByLabelText("Shadow time")).getByText("12:00", { selector: "strong" }))
      .toBeDefined();
    expect(screen.getByText("06:00")).toBeDefined();
    expect(screen.getByText("18:00")).toBeDefined();
  });

  it("keeps planned routes visible while the separate shadow overlay is toggled", async () => {
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
      return { ok: true, json: async () => routeResponse } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Set test starting location" }));
    await selectCentralPark();
    expect(await screen.findByText("Recommended route")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Turn shadows on" }));
    expect(screen.getByText("Recommended route")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Turn shadows off" }));
    expect(screen.getByText("Recommended route")).toBeDefined();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/routes/candidates"))).toHaveLength(
      1,
    );
  });

  it("converts a selected local departure time to an ISO timestamp", () => {
    const localDeparture = new Date(2030, 4, 10, 14, 30);

    expect(toUtcISOString(toLocalDateTimeInput(localDeparture))).toBe(localDeparture.toISOString());
    expect(toUtcISOString("")).toBeNull();
  });

  it("submits selected route inputs and displays loading while the request is pending", async () => {
    let finishRouteRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
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
      if (url.endsWith("/routes/score")) {
        return Promise.resolve({ ok: true, json: async () => routeResponse } as Response);
      }
      return new Promise<Response>((resolve) => {
        finishRouteRequest = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Set test starting location" }));

    await selectCentralPark();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/routes/candidates"))).toBe(true);
    expect((screen.getByLabelText("Starting point") as HTMLInputElement).value).toBe(
      "Current location",
    );
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("Central Park");
    fireEvent.click(screen.getByRole("tab", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: /Planning time:/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Depart at" }));
    const selectedDeparture = new Date(2030, 4, 10, 14, 30);
    fireEvent.change(screen.getByLabelText("Departure date and time"), {
      target: { value: toLocalDateTimeInput(selectedDeparture) },
    });
    expect(
      (await screen.findByRole("button", { name: "Planning route..." })).hasAttribute("disabled"),
    ).toBe(true);
    const routeRequest = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith("/routes/candidates"))
      .at(-1);
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
      json: async () => routeResponse,
    } as Response);
    expect(await screen.findByText("Recommended route")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Start navigation" }));
    expect((await screen.findByRole("button", { name: "End navigation" })).textContent).toBe(
      "End navigation",
    );
    expect(screen.getByRole("region", { name: "Navigation progress" })).toBeDefined();
    expect(screen.getByText(/1.2 km remaining/)).toBeDefined();
    expect(screen.getByText(/1.2 km · 15 min/)).toBeDefined();
    expect(screen.getByText("Overall shade coverage")).toBeDefined();
    const selectedRouteDetails = within(
      screen.getByRole("region", { name: "Selected route details" }),
    );
    expect(selectedRouteDetails.getByText("Selected route shade coverage")).toBeDefined();
    expect(selectedRouteDetails.getByText("65%")).toBeDefined();
    expect(selectedRouteDetails.getByText("Partial")).toBeDefined();
    expect(
      selectedRouteDetails.getByText("Some segments have unknown shade and are not counted as exposed."),
    ).toBeDefined();
    expect(selectedRouteDetails.getByText("Shade unknown for 200 m of this route")).toBeDefined();
  });

  it("reverses the displayed points and submits their reversed coordinates", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
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
        json: async () => routeResponse,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Set test starting location" }));
    await selectCentralPark();
    fireEvent.click(screen.getByRole("button", { name: "Reverse starting point and destination" }));

    expect((screen.getByLabelText("Starting point") as HTMLInputElement).value).toBe(
      "Central Park",
    );
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe(
      "Current location",
    );
    expect(screen.getByText("Device location")).toBeDefined();
    await screen.findByText("Recommended route");
    fireEvent.click(screen.getByRole("button", { name: "Start navigation" }));
    await screen.findByRole("button", { name: "End navigation" });
    const routeRequest = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith("/routes/candidates"))
      .at(-1);
    expect(JSON.parse(String(routeRequest?.[1]?.body))).toMatchObject({
      origin: { latitude: 40.78, longitude: -73.97 },
      destination: { latitude: 40.75, longitude: -73.98 },
    });
  });

  it("uses the current location button to update the route origin", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 40.71,
          longitude: -74.01,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
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
        json: async () => routeResponse,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Set test starting location" }));
    await selectCentralPark();
    fireEvent.click(screen.getByRole("button", { name: "Use current location as starting point" }));

    expect((screen.getByLabelText("Starting point") as HTMLInputElement).value).toBe(
      "Current location",
    );
    await screen.findByText("Recommended route");
    fireEvent.click(screen.getByRole("button", { name: "Start navigation" }));
    await screen.findByRole("button", { name: "End navigation" });

    const routeRequest = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith("/routes/candidates"))
      .at(-1);
    expect(JSON.parse(String(routeRequest?.[1]?.body)).origin).toEqual({
      latitude: 40.71,
      longitude: -74.01,
    });
  });

  it("opens the matching location search when either route point is tapped", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/search")) {
        const query = url.searchParams.get("q");
        const result =
          query === "Union Square"
            ? {
                name: "Union Square",
                label: "Manhattan, NY",
                coordinate: { latitude: 40.7359, longitude: -73.9911 },
              }
            : query === "Brooklyn Bridge"
              ? {
                  name: "Brooklyn Bridge",
                  label: "New York, NY",
                  coordinate: { latitude: 40.7061, longitude: -73.9969 },
                }
              : {
                  name: "Central Park",
                  label: "New York, NY",
                  coordinate: { latitude: 40.78, longitude: -73.97 },
                };
        return { ok: true, json: async () => ({ results: [result] }) } as Response;
      }
      return {
        ok: true,
        json: async () => routeResponse,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Set test starting location" }));
    await selectCentralPark();

    fireEvent.click(screen.getByLabelText("Starting point"));
    const originSearch = await screen.findByRole("textbox", {
      name: "Search for a starting point",
    });
    fireEvent.change(originSearch, { target: { value: "Union Square" } });
    fireEvent.click(await screen.findByRole("button", { name: /Union Square/ }));
    await waitForElementToBeRemoved(() =>
      screen.queryByRole("textbox", { name: "Search for a starting point" }),
    );
    expect((screen.getByLabelText("Starting point") as HTMLInputElement).value).toBe(
      "Union Square",
    );
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe("Central Park");

    fireEvent.click(screen.getByLabelText("Destination"));
    const destinationSearch = await screen.findByRole("textbox", {
      name: "Search for a destination",
    });
    fireEvent.change(destinationSearch, { target: { value: "Brooklyn Bridge" } });
    fireEvent.click(await screen.findByRole("button", { name: /Brooklyn Bridge/ }));
    expect((screen.getByLabelText("Starting point") as HTMLInputElement).value).toBe(
      "Union Square",
    );
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe(
      "Brooklyn Bridge",
    );
  });

  it("uses a long press to place the destination while a short press leaves the route unchanged", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Short press map" }));
    expect(screen.queryByRole("region", { name: "Route locations" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Long press map" }));
    expect((screen.getByLabelText("Destination") as HTMLInputElement).value).toBe(
      "Pinned destination",
    );
    expect(screen.getByText("40.80000, -73.96000")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Short press map" }));
    expect(screen.queryByRole("region", { name: "Route locations" })).toBeNull();
  });

  it("shows a starting location error and skips submission when origin is missing", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
          error?.({ code: 1, message: "Location access denied" } as GeolocationPositionError);
        },
      },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
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
        json: async () => routeResponse,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await selectCentralPark();
    expect((screen.getByRole("button", { name: /Start navigation/ }) as HTMLButtonElement).disabled)
      .toBe(true);
    const routeRequests = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith("/routes/candidates"))
      .map(([, init]) => JSON.parse(String(init?.body)) as { planning_mode: string });
    expect(routeRequests).toHaveLength(0);
  });

  it("rejects a past scheduled departure before sending a route request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
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
        json: async () => routeResponse,
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
    const routeRequests = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith("/routes/candidates"))
      .map(([, init]) => JSON.parse(String(init?.body)) as { planning_mode: string });
    expect(routeRequests.some((request) => request.planning_mode === "depart_at")).toBe(false);
  });
});
