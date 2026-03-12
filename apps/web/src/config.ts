export const API_BASE_URL =
  (import.meta.env.VITE_OPENTASKS_API_BASE_URL as string | undefined) ?? "http://localhost:3005";

export const DEFAULT_PROJECT_ID =
  (import.meta.env.VITE_OPENTASKS_PROJECT_ID as string | undefined) ?? "";
