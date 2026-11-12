import type { MapOptions, StyleSpecification } from "maplibre-gl";

export const BASE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const INITIAL_MAP_VIEW: MapOptions["center"] = [-73.97, 40.78];
export const INITIAL_MAP_ZOOM = 12;

export const MAP_STYLES = {
  default: BASE_MAP_STYLE,
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "© Esri",
      },
    },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }],
  },
  terrain: {
    version: 8,
    sources: {
      terrain: {
        type: "raster",
        tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenTopoMap contributors",
      },
    },
    layers: [{ id: "terrain", type: "raster", source: "terrain" }],
  },
} satisfies Record<string, StyleSpecification | string>;

export type MapStyleName = keyof typeof MAP_STYLES;
