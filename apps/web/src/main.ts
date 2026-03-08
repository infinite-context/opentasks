import "@fortawesome/fontawesome-free/css/all.min.css";
import {
  dashboardSnapshotDtoSchema,
  dashboardStreamEventDtoSchema,
  taskDetailDtoSchema,
  type DashboardHealthItemDto,
  type DashboardSnapshotDto,
  type TaskDetailDto,
  type TaskEvent,
  type TaskRecord,
  type TaskStatus
} from "@opentasks/contracts";
import "./style.css";

type Theme = "light" | "dark";
type TaskFilter = "all" | "blocked" | "in_progress";
type ConnectionState = "connecting" | "connected" | "disconnected";

interface NavItem {
  label: string;
  icon: string;
}

const API_BASE_URL = (import.meta.env.VITE_OPENTASKS_API_BASE_URL as string | undefined) ?? "http://localhost:3001";
const DEFAULT_PROJECT_ID =
  (import.meta.env.VITE_OPENTASKS_PROJECT_ID as string | undefined) ?? "demo-project";

const appRoot = getAppRoot();

let activeTheme = resolveInitialTheme();
let selectedTaskId = "";
let activeTaskFilter: TaskFilter = "all";
let dashboardSnapshot: DashboardSnapshotDto | null = null;
let selectedTaskDetail: TaskDetailDto | null = null;
let connectionState: ConnectionState = "connecting";
let errorMessage = "";
let isLoading = true;
let dashboardStream: EventSource | null = null;

void initializeApp();

function resolveInitialTheme(): Theme {
  const stored = window.localStorage.getItem("opentasks-theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>("#app");

  if (!root) {
    throw new Error("App root element not found.");
  }

  return root;
}

async function initializeApp(): Promise<void> {
  renderApp();
  await loadDashboardSnapshot();
  connectDashboardStream();
  window.addEventListener("beforeunload", () => {
    dashboardStream?.close();
  });
}

async function loadDashboardSnapshot(): Promise<void> {
  isLoading = true;
  errorMessage = "";
  renderApp();

  try {
    const response = await fetch(buildApiUrl("/api/dashboard", { projectId: DEFAULT_PROJECT_ID }));
    if (!response.ok) {
      throw new Error(`Dashboard request failed with status ${response.status}.`);
    }

    const snapshot = dashboardSnapshotDtoSchema.parse(await response.json());
    dashboardSnapshot = snapshot;
    selectedTaskId = pickSelectedTaskId(snapshot.tasks, selectedTaskId);
    await loadSelectedTaskDetail();
    connectionState = "connected";
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to load dashboard data.";
    connectionState = "disconnected";
  } finally {
    isLoading = false;
    renderApp();
  }
}

async function loadSelectedTaskDetail(): Promise<void> {
  if (!selectedTaskId) {
    selectedTaskDetail = null;
    return;
  }

  try {
    const response = await fetch(buildApiUrl(`/api/tasks/${encodeURIComponent(selectedTaskId)}`));
    if (!response.ok) {
      selectedTaskDetail = null;
      return;
    }

    selectedTaskDetail = taskDetailDtoSchema.parse(await response.json());
  } catch {
    selectedTaskDetail = null;
  }
}

function connectDashboardStream(): void {
  dashboardStream?.close();
  connectionState = "connecting";
  renderApp();

  const streamUrl = buildApiUrl("/api/dashboard/stream", { projectId: DEFAULT_PROJECT_ID });
  dashboardStream = new EventSource(streamUrl);

  dashboardStream.addEventListener("dashboard.snapshot", (event) => {
    try {
      const parsed = dashboardStreamEventDtoSchema.parse(JSON.parse((event as MessageEvent).data));
      dashboardSnapshot = parsed.data;
      selectedTaskId = pickSelectedTaskId(parsed.data.tasks, selectedTaskId);
      connectionState = "connected";
      renderApp();
      void loadSelectedTaskDetail().then(renderApp);
    } catch {
      connectionState = "disconnected";
      renderApp();
    }
  });

  dashboardStream.onopen = () => {
    connectionState = "connected";
    renderApp();
  };

  dashboardStream.onerror = () => {
    connectionState = "disconnected";
    renderApp();
  };
}

function renderApp(): void {
  const snapshot = dashboardSnapshot;
  const allTasks = snapshot?.tasks ?? [];
  const filteredTasks = filterTasks(allTasks, activeTaskFilter);
  const selectedTask =
    filteredTasks.find((task) => task.id === selectedTaskId) ??
    allTasks.find((task) => task.id === selectedTaskId) ??
    filteredTasks[0] ??
    allTasks[0] ??
    null;
  const selectedEvents =
    selectedTaskDetail && selectedTask && selectedTaskDetail.task?.id === selectedTask.id
      ? selectedTaskDetail.events
      : [];

  document.documentElement.dataset.theme = activeTheme;
  appRoot.innerHTML = `
    <div class="shell">
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
            { label: "Dashboard", icon: "fa-solid fa-table-columns" },
            { label: "Tasks", icon: "fa-solid fa-list-check" },
            { label: "Agents", icon: "fa-solid fa-robot" },
            { label: "Runs", icon: "fa-solid fa-play-circle" }
          ])}
          ${renderNavSection("Intelligence", [
            { label: "Memory", icon: "fa-solid fa-database" },
            { label: "System Health", icon: "fa-solid fa-heart-pulse" },
            { label: "Settings", icon: "fa-solid fa-gear" }
          ])}
        </nav>

        <section class="sidebar__panel">
          <div class="eyebrow">Focus</div>
          <h3>Needs attention</h3>
          <p>${escapeHtml(buildFocusMessage(snapshot))}</p>
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

      <main class="main">
        <header class="topbar">
          <div>
            <div class="eyebrow">Live dashboard</div>
            <h1>Dashboard</h1>
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

        <section class="metric-grid">
          ${renderMetricCard("Total tasks", snapshot ? String(snapshot.summary.totalTasks) : "--", snapshot ? `${snapshot.summary.availableTasks} available now` : "Loading", "neutral")}
          ${renderMetricCard("In progress", snapshot ? String(snapshot.summary.inProgressTasks) : "--", snapshot ? `${snapshot.summary.assignedTasks} assigned next` : "Loading", "up")}
          ${renderMetricCard("Blocked", snapshot ? String(snapshot.summary.blockedTasks) : "--", snapshot ? `${snapshot.summary.failedTasks} failed` : "Loading", snapshot && snapshot.summary.blockedTasks > 0 ? "down" : "neutral")}
          ${renderMetricCard("Active agents", snapshot ? String(snapshot.summary.activeAgents) : "--", snapshot ? `${snapshot.agents.length} reporting` : "Loading", "up")}
        </section>

        <section class="content-grid">
          <div class="stack">
            <section class="card card--large">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Pipeline</div>
                  <h2>Task state overview</h2>
                </div>
                <span class="status-pill status-pill--health-${connectionState === "connected" ? "healthy" : connectionState === "connecting" ? "degraded" : "warning"}">
                  ${escapeHtml(connectionState)}
                </span>
              </div>

              <div class="pipeline">
                ${(snapshot?.pipeline ?? []).map(renderPipelineState).join("")}
              </div>
            </section>

            <section class="card card--large">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Priority queue</div>
                  <h2>Tasks</h2>
                </div>
                <div class="task-filters">
                  ${renderFilterChip("all", "All")}
                  ${renderFilterChip("blocked", "Blocked")}
                  ${renderFilterChip("in_progress", "In progress")}
                </div>
              </div>

              ${
                errorMessage
                  ? `<div class="detail-callout"><div class="detail-value">${escapeHtml(errorMessage)}</div></div>`
                  : ""
              }

              <div class="task-list" role="list">
                ${
                  filteredTasks.length > 0
                    ? filteredTasks.map((task) => renderTaskRow(task, task.id === selectedTask?.id)).join("")
                    : `<div class="detail-callout"><div class="detail-value">${isLoading ? "Loading tasks..." : "No tasks match the current filter."}</div></div>`
                }
              </div>
            </section>
          </div>

          <div class="stack">
            <section class="card">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Selected task</div>
                  <h2>${escapeHtml(selectedTask?.title ?? "No task selected")}</h2>
                </div>
                ${
                  selectedTask
                    ? `<span class="status-pill status-pill--${selectedTask.status}">${escapeHtml(formatStatus(selectedTask.status))}</span>`
                    : ""
                }
              </div>

              ${
                selectedTask
                  ? `
                    <div class="detail-grid">
                      <div>
                        <div class="detail-label">Task ID</div>
                        <div class="detail-value">${escapeHtml(selectedTask.id)}</div>
                      </div>
                      <div>
                        <div class="detail-label">Priority</div>
                        <div class="detail-value">${escapeHtml(selectedTask.priority)}</div>
                      </div>
                      <div>
                        <div class="detail-label">Assigned</div>
                        <div class="detail-value">${escapeHtml(selectedTask.assignedTo ?? "Unassigned")}</div>
                      </div>
                      <div>
                        <div class="detail-label">Source</div>
                        <div class="detail-value">${escapeHtml(selectedTask.source)}</div>
                      </div>
                    </div>

                    <p class="detail-summary">${escapeHtml(selectedTask.description || "No description provided for this task.")}</p>

                    <div class="detail-callout">
                      <div class="detail-label">Blocker</div>
                      <div class="detail-value">${escapeHtml(selectedTask.blockedReason ?? selectedTask.lastError ?? "No active blocker")}</div>
                    </div>

                    <div class="timeline">
                      ${
                        selectedEvents.length > 0
                          ? selectedEvents
                              .map(
                                (event, index) => `
                                  <div class="timeline__item">
                                    <div class="timeline__marker">${index + 1}</div>
                                    <div>
                                      <div class="mini-table__title">${escapeHtml(formatTaskEvent(event))}</div>
                                      <div class="activity-item__detail">${escapeHtml(formatTaskEventDetail(event))}</div>
                                    </div>
                                  </div>
                                `
                              )
                              .join("")
                          : `<div class="detail-summary">No lifecycle events have been recorded for this task yet.</div>`
                      }
                    </div>
                  `
                  : `<div class="detail-summary">Select a task to inspect its current backend state.</div>`
              }
            </section>

            <section class="card">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Live signal</div>
                  <h2>Recent activity</h2>
                </div>
              </div>

              <div class="activity-list">
                ${(snapshot?.activity ?? []).map(renderActivityItem).join("")}
              </div>
            </section>

            <section class="card">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Workload</div>
                  <h2>Agent utilization</h2>
                </div>
              </div>

              <div class="mini-table">
                ${(snapshot?.agents ?? []).map(renderAgentLoad).join("")}
              </div>
            </section>

            <section class="card">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Platform</div>
                  <h2>System health</h2>
                </div>
              </div>

              <div class="health-list">
                ${(snapshot?.health ?? []).map(renderHealthItem).join("")}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function bindEvents(): void {
  const themeToggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  themeToggle?.addEventListener("click", () => {
    activeTheme = activeTheme === "light" ? "dark" : "light";
    window.localStorage.setItem("opentasks-theme", activeTheme);
    renderApp();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTaskId = button.dataset.taskId ?? selectedTaskId;
      renderApp();
      void loadSelectedTaskDetail().then(renderApp);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTaskFilter = (button.dataset.filter as TaskFilter | undefined) ?? activeTaskFilter;
      renderApp();
    });
  });
}

function renderNavSection(title: string, items: NavItem[]): string {
  return `
    <div class="nav__section">
      <div class="eyebrow">${escapeHtml(title)}</div>
      ${items
        .map(
          (item, index) => `
            <button class="nav__item ${title === "Overview" && index === 0 ? "nav__item--active" : ""}" type="button">
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

function renderMetricCard(
  label: string,
  value: string,
  delta: string,
  trend: "up" | "down" | "neutral"
): string {
  return `
    <section class="card metric-card">
      <div class="eyebrow">${escapeHtml(label)}</div>
      <div class="metric-card__value">${escapeHtml(value)}</div>
      <div class="metric-card__delta metric-card__delta--${trend}">${escapeHtml(delta)}</div>
    </section>
  `;
}

function renderPipelineState(state: { status: TaskStatus; count: number }): string {
  return `
    <div class="pipeline__state">
      <div class="pipeline__bar pipeline__bar--${state.status}"></div>
      <div class="pipeline__meta">
        <span>${escapeHtml(formatStatus(state.status))}</span>
        <strong>${escapeHtml(String(state.count))}</strong>
      </div>
    </div>
  `;
}

function renderFilterChip(filter: TaskFilter, label: string): string {
  return `
    <button class="chip ${activeTaskFilter === filter ? "chip--active" : ""}" data-filter="${filter}" type="button">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderTaskRow(task: TaskRecord, isSelected: boolean): string {
  return `
    <button class="task-row ${isSelected ? "task-row--selected" : ""}" data-task-id="${escapeHtml(task.id)}" type="button" role="listitem">
      <div class="task-row__main">
        <div class="task-row__title">${escapeHtml(task.title)}</div>
        <div class="task-row__meta">
          ${escapeHtml(task.id)} | ${escapeHtml(task.assignedTo ?? "Unassigned")} | Updated ${escapeHtml(formatRelativeTime(task.updatedAt))}
        </div>
      </div>
      <div class="task-row__stats">
        <span class="status-pill status-pill--${task.status}">${escapeHtml(formatStatus(task.status))}</span>
        <span class="task-row__score">${escapeHtml(task.priority)}</span>
        <span class="task-row__age">${escapeHtml(formatRelativeTime(task.createdAt))}</span>
      </div>
    </button>
  `;
}

function renderActivityItem(item: DashboardSnapshotDto["activity"][number]): string {
  return `
    <div class="activity-item">
      <div class="activity-item__time">${escapeHtml(formatRelativeTime(item.event.createdAt))}</div>
      <div>
        <div class="activity-item__title">${escapeHtml(formatTaskEvent(item.event))}</div>
        <div class="activity-item__detail">${escapeHtml(item.taskTitle ?? item.taskId)}</div>
      </div>
    </div>
  `;
}

function renderAgentLoad(agent: DashboardSnapshotDto["agents"][number]): string {
  return `
    <div class="mini-table__row">
      <div>
        <div class="mini-table__title">${escapeHtml(agent.agentName)}</div>
        <div class="mini-table__subtitle">
          ${escapeHtml(`${agent.assignedTasks} assigned | ${agent.inProgressTasks} active | ${agent.completedTasks} completed`)}
        </div>
      </div>
      <div class="mini-table__metric">${escapeHtml(String(agent.failedTasks))} failed</div>
    </div>
  `;
}

function renderHealthItem(item: DashboardHealthItemDto): string {
  return `
    <div class="health-item">
      <div>
        <div class="mini-table__title">${escapeHtml(item.name)}</div>
        <div class="mini-table__subtitle">${escapeHtml(item.detail)}</div>
      </div>
      <span class="status-pill status-pill--health-${item.state}">${escapeHtml(formatHealthState(item.state))}</span>
    </div>
  `;
}

function filterTasks(tasks: TaskRecord[], filter: TaskFilter): TaskRecord[] {
  if (filter === "all") {
    return tasks;
  }

  return tasks.filter((task) => task.status === filter);
}

function pickSelectedTaskId(tasks: TaskRecord[], currentTaskId: string): string {
  return tasks.find((task) => task.id === currentTaskId)?.id ?? tasks[0]?.id ?? "";
}

function buildFocusMessage(snapshot: DashboardSnapshotDto | null): string {
  if (!snapshot) {
    return "Loading backend task data and live coordination state.";
  }

  if (snapshot.summary.blockedTasks > 0 || snapshot.summary.failedTasks > 0) {
    return `${snapshot.summary.blockedTasks} blocked task(s) and ${snapshot.summary.failedTasks} failed task(s) need attention.`;
  }

  return `${snapshot.summary.availableTasks} task(s) are available and ${snapshot.summary.activeAgents} agent(s) are active.`;
}

function buildApiUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(path, API_BASE_URL);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function formatStatus(status: TaskStatus): string {
  return status.replaceAll("_", " ");
}

function formatHealthState(state: DashboardHealthItemDto["state"]): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) {
    return "Unknown";
  }

  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatTaskEvent(event: TaskEvent): string {
  const action = event.eventType.replace("task_", "").replaceAll("_", " ");
  return `${action.charAt(0).toUpperCase()}${action.slice(1)}`;
}

function formatTaskEventDetail(event: TaskEvent): string {
  if (event.actorId) {
    return `${event.actorType} ${event.actorId} at ${formatRelativeTime(event.createdAt)}`;
  }

  return `${event.actorType} event at ${formatRelativeTime(event.createdAt)}`;
}

function renderIcon(iconClassName: string): string {
  return `<i class="${iconClassName} fa-fw" aria-hidden="true"></i>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
