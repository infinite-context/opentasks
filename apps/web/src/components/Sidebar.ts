import type { NavItem, Theme, ViewId } from "../types";
import { escapeHtml, renderIcon } from "../utils";

interface SidebarProjectOption {
  id: string;
  label: string;
}

export function renderSidebar(
  activeTheme: Theme,
  currentView: ViewId,
  focusMessage: string,
  projectOptions: SidebarProjectOption[],
  selectedProjectId: string,
  isProjectMenuOpen: boolean
): string {
  const selectedProject =
    projectOptions.find((project) => project.id === selectedProjectId) ?? projectOptions[0] ?? null;

  return `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__project-picker">
          <span class="eyebrow">Project</span>
          <div class="sidebar__project-menu">
            <button
              aria-expanded="${isProjectMenuOpen ? "true" : "false"}"
              class="sidebar__project-trigger"
              data-project-menu-toggle
              type="button"
            >
              <span class="sidebar__project-trigger-label">${escapeHtml(selectedProject?.label ?? "Select project")}</span>
              <span class="sidebar__project-trigger-icon">${renderIcon("fa-solid fa-chevron-down")}</span>
            </button>
            <div class="sidebar__project-dropdown ${isProjectMenuOpen ? "sidebar__project-dropdown--open" : ""}">
              <div class="sidebar__project-list">
                ${projectOptions
                  .map(
                    (project) => `
                      <button
                        class="sidebar__project-option ${project.id === selectedProjectId ? "sidebar__project-option--active" : ""}"
                        data-project-option="${escapeHtml(project.id)}"
                        type="button"
                      >
                        ${escapeHtml(project.label)}
                      </button>
                    `
                  )
                  .join("")}
              </div>
              <div class="sidebar__project-dropdown-footer">
                <button class="sidebar__project-new" data-project-new type="button">
                  <span class="button__content">
                    ${renderIcon("fa-solid fa-plus")}
                    <span>New project</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav class="nav">
        ${renderNavSection("Overview", [
          { id: "dashboard", label: "Dashboard", icon: "fa-solid fa-table-columns" },
          { id: "project", label: "Project", icon: "fa-solid fa-folder-tree" },
          { id: "goals", label: "Goals", icon: "fa-solid fa-bullseye" },
          { id: "tasks", label: "Tasks", icon: "fa-solid fa-list-check" },
          { id: "agents", label: "Agents", icon: "fa-solid fa-wrench" },
          { id: "analytics", label: "Analytics", icon: "fa-solid fa-chart-line" },
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
