import type { Dispatch, RefObject, SetStateAction } from "react";
import { Icon } from "./Icon";
import { SHADE_PREFERENCES, type ShadePreference } from "../shadePreferences";
import type { RoutePlanningResponse } from "../routeApi";
import { PLANNING_MODES, type PlanningMode } from "../planningModes";

export type DestinationSearchResult = {
  name: string;
  label: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
};

type RoutePlannerPanelProps = {
  destination: DestinationSearchResult;
  shadePreference: ShadePreference;
  onShadePreferenceChange: (preference: ShadePreference) => void;
  planningMode: PlanningMode;
  onPlanningModeChange: (mode: PlanningMode) => void;
  planningModeLabel: string;
  planningModeMenuOpen: boolean;
  onPlanningModeMenuOpenChange: Dispatch<SetStateAction<boolean>>;
  planningModeMenuAbove: boolean;
  planningModeTriggerRef: RefObject<HTMLButtonElement | null>;
  planningModeOptionsRef: RefObject<HTMLDivElement | null>;
  minimumPlanningDateTime: string;
  departureDateTime: string;
  onDepartureDateTimeChange: (value: string) => void;
  arrivalDateTime: string;
  onArrivalDateTimeChange: (value: string) => void;
  requestState: "idle" | "loading" | "error";
  requestError: string | null;
  navigationStarted: boolean;
  routes: RoutePlanningResponse | null;
  selectedRouteId: string | null;
  onSelectRoute: (route: RoutePlanningResponse["recommended_route"]) => void;
  onStartNavigation: () => void;
  onCloseDestination: () => void;
  onPlanningInputChange: () => void;
};

function RouteSummary({
  route,
  recommended = false,
  label,
  selected = false,
  onSelect,
}: {
  route: RoutePlanningResponse["recommended_route"];
  recommended?: boolean;
  label?: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  const distance =
    route.distance_m >= 1000
      ? `${(route.distance_m / 1000).toFixed(1)} km`
      : `${Math.round(route.distance_m)} m`;
  const durationMinutes = Math.round(route.duration_s / 60);
  const shadePercent = route.shade?.shade_coverage_percent;
  const confidence =
    route.coverage_confidence === "high"
      ? "High data coverage"
      : route.coverage_confidence === "partial"
        ? "Partial data coverage"
        : "Shade data unavailable";

  return (
    <button
      type="button"
      className={`route-summary ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className="route-summary-heading">
        <strong>{recommended ? "Recommended route" : label}</strong>
        <span>
          {distance} · {durationMinutes} min
        </span>
      </div>
      <p>
        {shadePercent === null || shadePercent === undefined
          ? "Shade estimate unavailable"
          : `Estimated shade ${Math.round(shadePercent)}%`}
        {` · ${confidence}`}
      </p>
      {route.shade && route.shade.unknown_distance_m > 0 && (
        <p className="route-summary-unknown">
          Shade unknown for {Math.round(route.shade.unknown_distance_m)} m of this route
        </p>
      )}
    </button>
  );
}

export function RoutePlannerPanel({
  destination,
  shadePreference,
  onShadePreferenceChange,
  planningMode,
  onPlanningModeChange,
  planningModeLabel,
  planningModeMenuOpen,
  onPlanningModeMenuOpenChange,
  planningModeMenuAbove,
  planningModeTriggerRef,
  planningModeOptionsRef,
  minimumPlanningDateTime,
  departureDateTime,
  onDepartureDateTimeChange,
  arrivalDateTime,
  onArrivalDateTimeChange,
  requestState,
  requestError,
  navigationStarted,
  routes,
  selectedRouteId,
  onSelectRoute,
  onStartNavigation,
  onCloseDestination,
  onPlanningInputChange,
}: RoutePlannerPanelProps) {
  return (
    <div className="route-planner">
      <div className="route-planner-header">
        <div>
          <h2>{destination.name}</h2>
          <p className="route-planner-label">{destination.label}</p>
        </div>
        <button
          className="route-planner-close"
          type="button"
          aria-label="Choose a different destination"
          onClick={onCloseDestination}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="route-planner-tabs" role="tablist" aria-label="Shade preference">
        {SHADE_PREFERENCES.map((preference) => (
          <button
            key={preference.value}
            className={shadePreference === preference.value ? "selected" : ""}
            type="button"
            role="tab"
            aria-selected={shadePreference === preference.value}
            onClick={(event) => {
              event.stopPropagation();
              onShadePreferenceChange(preference.value);
              onPlanningInputChange();
            }}
          >
            {preference.label}
          </button>
        ))}
      </div>
      <div className="planning-mode">
        <button
          ref={planningModeTriggerRef}
          className="planning-mode-trigger"
          type="button"
          aria-label={`Planning time: ${planningModeLabel}`}
          aria-haspopup="listbox"
          aria-expanded={planningModeMenuOpen}
          onClick={(event) => {
            event.stopPropagation();
            onPlanningModeMenuOpenChange((open) => !open);
          }}
        >
          {planningModeLabel}
          <span aria-hidden="true">▾</span>
        </button>
        {planningModeMenuOpen && (
          <div
            ref={planningModeOptionsRef}
            className={`planning-mode-options ${planningModeMenuAbove ? "above" : ""}`}
            role="listbox"
            aria-label="Planning time"
          >
            {PLANNING_MODES.map((mode) => (
              <button
                key={mode.value}
                className={planningMode === mode.value ? "selected" : ""}
                type="button"
                role="option"
                aria-selected={planningMode === mode.value}
                onClick={(event) => {
                  event.stopPropagation();
                  onPlanningModeChange(mode.value);
                  onPlanningInputChange();
                  onPlanningModeMenuOpenChange(false);
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}
        {planningMode === "depart_at" && (
          <label className="departure-time-field">
            <input
              aria-label="Departure date and time"
              type="datetime-local"
              required
              min={minimumPlanningDateTime}
              value={departureDateTime}
              onChange={(event) => {
                onDepartureDateTimeChange(event.target.value);
                onPlanningInputChange();
              }}
            />
          </label>
        )}
        {planningMode === "arrive_by" && (
          <label className="departure-time-field">
            <input
              aria-label="Arrival date and time"
              type="datetime-local"
              required
              min={minimumPlanningDateTime}
              value={arrivalDateTime}
              onChange={(event) => {
                onArrivalDateTimeChange(event.target.value);
                onPlanningInputChange();
              }}
            />
          </label>
        )}
      </div>
      <button
        className="start-navigation"
        type="button"
        disabled={requestState === "loading"}
        onClick={(event) => {
          event.stopPropagation();
          onStartNavigation();
        }}
      >
        {requestState === "loading"
          ? "Planning route..."
          : navigationStarted
            ? "Navigation started"
            : "Start navigation"}
      </button>
      {requestError && (
        <p className="location-error" role="alert">
          {requestError}
        </p>
      )}
      {routes && (
        <section className="planned-routes" aria-label="Available routes" aria-live="polite">
          <RouteSummary
            route={routes.recommended_route}
            recommended
            selected={selectedRouteId === routes.recommended_route.id}
            onSelect={() => onSelectRoute(routes.recommended_route)}
          />
          {routes.alternatives.map((route, index) => (
            <RouteSummary
              key={route.id}
              route={route}
              label={`Alternative ${index + 1}`}
              selected={selectedRouteId === route.id}
              onSelect={() => onSelectRoute(route)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
