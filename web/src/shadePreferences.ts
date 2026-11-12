export const SHADE_PREFERENCES = [
  { value: "full", label: "Full" },
  { value: "more", label: "More" },
  { value: "medium", label: "Medium" },
  { value: "less", label: "Less" },
  { value: "no_shadow", label: "No Shadow" },
] as const;

export type ShadePreference = (typeof SHADE_PREFERENCES)[number]["value"];
