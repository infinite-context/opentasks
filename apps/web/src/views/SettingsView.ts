import type { Theme } from "../types";
import { renderIcon } from "../utils";

export interface SettingsViewProps {
  activeTheme: Theme;
}

export function renderSettingsView(props: SettingsViewProps): string {
  const { activeTheme } = props;

  return `
    <section class="card card--large">
      <div class="card__header">
        <div>
          <div class="eyebrow">Preferences</div>
          <h2>Settings</h2>
        </div>
      </div>

      <div class="settings-section">
        <div class="eyebrow">Appearance</div>
        <h3 class="settings-section__title">Theme</h3>
        <p class="detail-summary">Choose light or dark mode for the interface.</p>
        <div class="settings-theme-options" role="group" aria-label="Theme selection">
          <button
            class="settings-theme-option ${activeTheme === "light" ? "settings-theme-option--active" : ""}"
            data-theme-choice="light"
            type="button"
          >
            <span class="settings-theme-option__icon">${renderIcon("fa-solid fa-sun")}</span>
            <span>Light</span>
          </button>
          <button
            class="settings-theme-option ${activeTheme === "dark" ? "settings-theme-option--active" : ""}"
            data-theme-choice="dark"
            type="button"
          >
            <span class="settings-theme-option__icon">${renderIcon("fa-solid fa-moon")}</span>
            <span>Dark</span>
          </button>
        </div>
      </div>
    </section>
  `;
}
