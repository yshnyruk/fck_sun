const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const shadeMapApiKey = import.meta.env.VITE_SHADEMAP_API_KEY ?? "";

export const config = {
  apiBaseUrl,
  shadeMapApiKey,
} as const;
