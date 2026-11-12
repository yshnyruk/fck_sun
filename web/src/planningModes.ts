export const PLANNING_MODES = [
  { value: "leave_now", label: "Leave now" },
  { value: "depart_at", label: "Depart at" },
  { value: "arrive_by", label: "Arrive by" },
] as const;

export type PlanningMode = (typeof PLANNING_MODES)[number]["value"];
