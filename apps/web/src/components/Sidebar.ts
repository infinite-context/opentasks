import type { NavItem, Theme, ViewId } from "../types";
import { escapeHtml, renderIcon } from "../utils";

export function renderSidebar(
  activeTheme: Theme,
  currentView: ViewId,
  focusMessage: string
): string {
  return `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__logo">${renderIcon("fa-solid fa-brain")}</div>
        <div>
          <div class="eyebrow">Workspace</div>
          <div class="sidebar__title">OpenTasks</div>
        </div>
      </div>

      <nav class="nav">
        ${renderNavSection("Overview", [
          { id: "dashboard", label: "Dashboard", icon: "fa-solid fa-table-columns" },
          { id: "tasks", label: "Tasks", icon: "fa-solid fa-list-check" },
          { id: "agents", label: "Agents", icon: "fa-solid fa-robot" },
          { id: "runs", label: "Runs", icon: "fa-solid fa-play-circle" }
        ], currentView)}
        ${renderNavSection("Intelligence", [
          { id: "memory", label: "Memory", icon: "fa-solid fa-database" },
          { id: "system-health", label: "System Health", icon: "fa-solid fa-heart-pulse" }
        ], currentView)}
        ${renderNavSection("Configuration", [
          { id: "mcp", label: "MCP", icon: "fa-solid fa-server" },
          { id: "settings", label: "Settings", icon: "fa-solid fa-gear" }
        ], currentView)}
      </nav>

      <section class="sidebar__panel">
        <div class="eyebrow">Focus</div>
        <h3>Needs attention</h3>
        <p>${escapeHtml(focusMessage)}</p>
      </section>

      <div class="sidebar__footer">
        <button
          aria-label="${activeTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}"
          class="button button--ghost sidebar__theme-toggle"
          data-theme-toggle
          type="button"
        >
          <span class="button__content">${renderIcon(activeTheme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon")}</span>
        </button>
      </div>
    </aside>
  `;
}

function renderNavSection(title: string, items: NavItem[], currentView: ViewId): string {
  return `
    <div class="nav__section">
      <div class="eyebrow">${escapeHtml(title)}</div>
      ${items
        .map(
          (item) => `
            <button class="nav__item ${currentView === item.id ? "nav__item--active" : ""}" data-view="${item.id}" type="button">
              <span class="nav__item-content">
                <span class="nav__item-icon">${renderIcon(item.icon)}</span>
                <span>${escapeHtml(item.label)}</span>
              </span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}
