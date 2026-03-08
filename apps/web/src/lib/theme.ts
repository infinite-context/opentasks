import type { Theme } from "../types";

export function resolveInitialTheme(): Theme {
  const stored = window.localStorage.getItem("opentasks-theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function persistTheme(theme: Theme): void {
  window.localStorage.setItem("opentasks-theme", theme);
}
