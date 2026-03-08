import { escapeHtml, renderIcon } from "../utils";

export interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function renderTopbar(props: TopbarProps): string {
  const { title, subtitle = "Live dashboard" } = props;
  return `
    <header class="topbar">
      <div>
        <div class="eyebrow">${escapeHtml(subtitle)}</div>
        <h1>${escapeHtml(title)}</h1>
      </div>

      <div class="topbar__actions">
        <label class="search">
          <span class="search__icon">${renderIcon("fa-solid fa-magnifying-glass")}</span>
          <input disabled type="search" placeholder="Backend-backed view only" />
        </label>
        <button class="button button--primary" disabled title="Observe-only dashboard" type="button">
          <span class="button__content">
            ${renderIcon("fa-solid fa-plus")}
            <span>Create task</span>
          </span>
        </button>
      </div>
    </header>
  `;
}
