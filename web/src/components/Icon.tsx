import type { ReactNode } from "react";

export type IconName =
  | "arrow"
  | "back"
  | "chevron"
  | "compass"
  | "crosshair"
  | "layers"
  | "moon"
  | "search"
  | "shadow"
  | "sun"
  | "sunrise"
  | "sunset";

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="m5 12 14-7-7 14-2-5-5-2Z" />,
    back: <path d="m15 18-6-6 6-6M9 12h10" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    compass: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m15.8 8.2-2.2 5.6-5.6 2.2 2.2-5.6 5.6-2.2Z" />
      </>
    ),
    crosshair: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 8 4-8 4-8-4 8-4Z" />
        <path d="m4 12 8 4 8-4M4 17l8 4 8-4" />
      </>
    ),
    moon: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4 4" />
      </>
    ),
    shadow: (
      <>
        <path d="M5 18h14M7 15h10M9 12h6M11 9h2" />
        <path d="m6 5 12 12" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    sunrise: (
      <>
        <path d="M3 18h18M6 15a6 6 0 0 1 12 0M12 3v3M5.6 7.6l2 2M18.4 7.6l-2 2" />
      </>
    ),
    sunset: (
      <>
        <path d="M3 18h18M6 15a6 6 0 0 1 12 0M12 3v3M5.6 7.6l2 2M18.4 7.6l-2 2" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none">
      {paths[name]}
    </svg>
  );
}
