import { API_BASE_URL } from "../config";

export function buildApiUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(path, API_BASE_URL);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
