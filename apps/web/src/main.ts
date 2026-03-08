import "@fortawesome/fontawesome-free/css/all.min.css";
import "./style.css";

type Theme = "light" | "dark";
type TaskStatus =
  | "available"
  | "hydrating"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "completed"
  | "indexing";
type HealthState = "healthy" | "degraded" | "warning";

interface Metric {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "neutral";
}

interface PipelineState {
  label: string;
  value: number;
  tone: TaskStatus;
}

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: "P0" | "P1" | "P2";
  agent: string;
  age: string;
  updated: string;
  contextScore: number;
  blockedBy: string | null;
  summary: string;
  timeline: string[];
}

interface ActivityItem {
  time: string;
  title: string;
  detail: string;
}

interface AgentLoad {
  name: string;
  assigned: number;
  active: number;
  efficiency: string;
}

interface HealthItem {
  name: string;
  state: HealthState;
  detail: string;
}

interface DashboardData {
  metrics: Metric[];
  pipeline: PipelineState[];
  tasks: Task[];
  activity: ActivityItem[];
  agents: AgentLoad[];
  health: HealthItem[];
}

interface NavItem {
  label: string;
  icon: string;
}

const dashboardData: DashboardData = {
  metrics: [
    { label: "Open tasks", value: "42", delta: "+6 this week", trend: "up" },
    { label: "In progress", value: "9", delta: "3 agents active", trend: "neutral" },
    { label: "Blocked", value: "4", delta: "-2 since yesterday", trend: "down" },
    { label: "Indexed today", value: "26", delta: "+18% learning rate", trend: "up" }
  ],
  pipeline: [
    { label: "Available", value: 18, tone: "available" },
    { label: "Hydrating", value: 5, tone: "hydrating" },
    { label: "Assigned", value: 7, tone: "assigned" },
    { label: "In progress", value: 9, tone: "in_progress" },
    { label: "Blocked", value: 4, tone: "blocked" },
    { label: "Indexing", value: 3, tone: "indexing" },
    { label: "Completed", value: 12, tone: "completed" }
  ],
  tasks: [
    {
      id: "TASK-214",
      title: "Hydrate task dependency graph for billing import flow",
      status: "in_progress",
      priority: "P0",
      agent: "Claude Code",
      age: "28m",
      updated: "2 minutes ago",
      contextScore: 91,
      blockedBy: null,
      summary: "High-priority orchestration task with strong context coverage and active execution.",
      timeline: [
        "Task claimed by Task List Manager",
        "Context hydrated from 6 related memories",
        "Assigned to Claude Code",
        "Execution started with dependency graph attached"
      ]
    },
    {
      id: "TASK-208",
      title: "Retry indexing for failed memory artifact batch",
      status: "blocked",
      priority: "P0",
      agent: "Internal Agent",
      age: "1h 14m",
      updated: "11 minutes ago",
      contextScore: 48,
      blockedBy: "Vector DB write timeout",
      summary: "Learning loop task is stalled and should be surfaced prominently in the dashboard.",
      timeline: [
        "Completed run received through MCP",
        "Indexer generated 4 candidate artifacts",
        "Vector write degraded after partial insert",
        "Task moved to blocked pending retry policy"
      ]
    },
    {
      id: "TASK-217",
      title: "Prepare next context packet for server bootstrap workflow",
      status: "hydrating",
      priority: "P1",
      agent: "System",
      age: "9m",
      updated: "just now",
      contextScore: 77,
      blockedBy: null,
      summary: "Hydration-in-flight task that demonstrates early pipeline visibility before assignment.",
      timeline: [
        "Task selected for project opentasks",
        "Context Hydrator requested vector search",
        "3 memory candidates returned",
        "Hydration packet being assembled"
      ]
    },
    {
      id: "TASK-203",
      title: "Persist orchestration checkpoints to PostgreSQL",
      status: "assigned",
      priority: "P1",
      agent: "GPT-5.4",
      age: "42m",
      updated: "7 minutes ago",
      contextScore: 84,
      blockedBy: null,
      summary: "Assigned engineering task waiting on execution handoff completion.",
      timeline: [
        "Task claimed for backend stream",
        "Hydration completed successfully",
        "Assigned to GPT-5.4",
        "Awaiting first run event"
      ]
    },
    {
      id: "TASK-198",
      title: "Backfill vector metadata for existing reusable memory",
      status: "completed",
      priority: "P2",
      agent: "Internal Agent",
      age: "Completed",
      updated: "24 minutes ago",
      contextScore: 96,
      blockedBy: null,
      summary: "Completed indexing-related task with high confidence context and no blockers.",
      timeline: [
        "Task hydrated with historical memory context",
        "Internal agent generated metadata update set",
        "Vector records updated",
        "Artifacts marked reusable"
      ]
    },
    {
      id: "TASK-220",
      title: "Select next available task for MCP request backlog",
      status: "available",
      priority: "P2",
      agent: "Unassigned",
      age: "5m",
      updated: "5 minutes ago",
      contextScore: 63,
      blockedBy: null,
      summary: "Queue-ready task available for assignment and useful as a baseline dashboard state.",
      timeline: [
        "Task entered queue",
        "Dependencies resolved",
        "Ready for selection",
        "Awaiting orchestrator claim"
      ]
    }
  ],
  activity: [
    {
      time: "2m ago",
      title: "Hydration completed for TASK-214",
      detail: "6 memories attached, context score improved to 91."
    },
    {
      time: "7m ago",
      title: "TASK-203 assigned to GPT-5.4",
      detail: "Execution handoff sent through MCP transport."
    },
    {
      time: "11m ago",
      title: "Vector DB write timeout",
      detail: "TASK-208 moved to blocked and flagged for retry."
    },
    {
      time: "18m ago",
      title: "12 reusable artifacts created",
      detail: "Indexer completed a high-confidence learning batch."
    }
  ],
  agents: [
    { name: "Claude Code", assigned: 4, active: 2, efficiency: "92%" },
    { name: "GPT-5.4", assigned: 3, active: 1, efficiency: "88%" },
    { name: "Internal Agent", assigned: 6, active: 3, efficiency: "95%" }
  ],
  health: [
    { name: "MCP server", state: "healthy", detail: "Request latency 120ms" },
    { name: "Task orchestrator", state: "healthy", detail: "No assignment backlog" },
    { name: "Vector DB", state: "warning", detail: "Intermittent write timeouts" },
    { name: "Model provider", state: "degraded", detail: "Increased response variance" }
  ]
};

const appRoot = getAppRoot();

let selectedTaskId = dashboardData.tasks[0]?.id ?? "";
let activeTheme = resolveInitialTheme();

renderApp();

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

function renderApp(): void {
  const selectedTask = dashboardData.tasks.find((task) => task.id === selectedTaskId) ?? dashboardData.tasks[0];

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
          <p>4 blocked tasks, 1 degraded provider, and 1 indexing retry waiting for intervention.</p>
        </section>

        <div class="sidebar__footer">
          <button class="button button--ghost sidebar__theme-toggle" data-theme-toggle type="button">
            <span class="button__content">
              ${renderIcon(activeTheme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon")}
              <span>${activeTheme === "dark" ? "Light mode" : "Dark mode"}</span>
            </span>
          </button>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <div>
            <div class="eyebrow">Today</div>
            <h1>Task orchestration dashboard</h1>
          </div>

          <div class="topbar__actions">
            <label class="search">
              <span class="search__icon">${renderIcon("fa-solid fa-magnifying-glass")}</span>
              <input type="search" placeholder="Search tasks, agents, runs" />
            </label>
            <button class="button button--primary" type="button">
              <span class="button__content">
                ${renderIcon("fa-solid fa-plus")}
                <span>Create task</span>
              </span>
            </button>
          </div>
        </header>

        <section class="metric-grid">
          ${dashboardData.metrics.map(renderMetricCard).join("")}
        </section>

        <section class="content-grid">
          <div class="stack">
            <section class="card card--large">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Pipeline</div>
                  <h2>Task state overview</h2>
                </div>
                <button class="button button--ghost" type="button">View all tasks</button>
              </div>

              <div class="pipeline">
                ${dashboardData.pipeline.map(renderPipelineState).join("")}
              </div>
            </section>

            <section class="card card--large">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Priority queue</div>
                  <h2>Tasks</h2>
                </div>
                <div class="task-filters">
                  <button class="chip chip--active" type="button">All</button>
                  <button class="chip" type="button">Blocked</button>
                  <button class="chip" type="button">In progress</button>
                </div>
              </div>

              <div class="task-list" role="list">
                ${dashboardData.tasks.map((task) => renderTaskRow(task, task.id === selectedTask?.id)).join("")}
              </div>
            </section>
          </div>

          <div class="stack">
            <section class="card">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Selected task</div>
                  <h2>${selectedTask.title}</h2>
                </div>
                <span class="status-pill status-pill--${selectedTask.status}">${formatStatus(selectedTask.status)}</span>
              </div>

              <div class="detail-grid">
                <div>
                  <div class="detail-label">Task ID</div>
                  <div class="detail-value">${selectedTask.id}</div>
                </div>
                <div>
                  <div class="detail-label">Priority</div>
                  <div class="detail-value">${selectedTask.priority}</div>
                </div>
                <div>
                  <div class="detail-label">Assigned</div>
                  <div class="detail-value">${selectedTask.agent}</div>
                </div>
                <div>
                  <div class="detail-label">Context score</div>
                  <div class="detail-value">${selectedTask.contextScore}%</div>
                </div>
              </div>

              <p class="detail-summary">${selectedTask.summary}</p>

              <div class="detail-callout">
                <div class="detail-label">Blocker</div>
                <div class="detail-value">${selectedTask.blockedBy ?? "No active blocker"}</div>
              </div>

              <div class="timeline">
                ${selectedTask.timeline
                  .map(
                    (step, index) => `
                      <div class="timeline__item">
                        <div class="timeline__marker">${index + 1}</div>
                        <div>${step}</div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </section>

            <section class="card">
              <div class="card__header">
                <div>
                  <div class="eyebrow">Live signal</div>
                  <h2>Recent activity</h2>
                </div>
              </div>

              <div class="activity-list">
                ${dashboardData.activity.map(renderActivityItem).join("")}
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
                ${dashboardData.agents.map(renderAgentLoad).join("")}
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
                ${dashboardData.health.map(renderHealthItem).join("")}
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
    });
  });
}

function renderNavSection(title: string, items: NavItem[]): string {
  return `
    <div class="nav__section">
      <div class="eyebrow">${title}</div>
      ${items
        .map(
          (item, index) => `
            <button class="nav__item ${title === "Overview" && index === 0 ? "nav__item--active" : ""}" type="button">
              <span class="nav__item-content">
                <span class="nav__item-icon">${renderIcon(item.icon)}</span>
                <span>${item.label}</span>
              </span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderMetricCard(metric: Metric): string {
  return `
    <section class="card metric-card">
      <div class="eyebrow">${metric.label}</div>
      <div class="metric-card__value">${metric.value}</div>
      <div class="metric-card__delta metric-card__delta--${metric.trend}">${metric.delta}</div>
    </section>
  `;
}

function renderPipelineState(state: PipelineState): string {
  return `
    <div class="pipeline__state">
      <div class="pipeline__bar pipeline__bar--${state.tone}"></div>
      <div class="pipeline__meta">
        <span>${state.label}</span>
        <strong>${state.value}</strong>
      </div>
    </div>
  `;
}

function renderTaskRow(task: Task, isSelected: boolean): string {
  return `
    <button class="task-row ${isSelected ? "task-row--selected" : ""}" data-task-id="${task.id}" type="button" role="listitem">
      <div class="task-row__main">
        <div class="task-row__title">${task.title}</div>
        <div class="task-row__meta">${task.id} | ${task.agent} | Updated ${task.updated}</div>
      </div>
      <div class="task-row__stats">
        <span class="status-pill status-pill--${task.status}">${formatStatus(task.status)}</span>
        <span class="task-row__score">${task.contextScore}%</span>
        <span class="task-row__age">${task.age}</span>
      </div>
    </button>
  `;
}

function renderActivityItem(item: ActivityItem): string {
  return `
    <div class="activity-item">
      <div class="activity-item__time">${item.time}</div>
      <div>
        <div class="activity-item__title">${item.title}</div>
        <div class="activity-item__detail">${item.detail}</div>
      </div>
    </div>
  `;
}

function renderAgentLoad(agent: AgentLoad): string {
  return `
    <div class="mini-table__row">
      <div>
        <div class="mini-table__title">${agent.name}</div>
        <div class="mini-table__subtitle">${agent.assigned} assigned | ${agent.active} active</div>
      </div>
      <div class="mini-table__metric">${agent.efficiency}</div>
    </div>
  `;
}

function renderHealthItem(item: HealthItem): string {
  return `
    <div class="health-item">
      <div>
        <div class="mini-table__title">${item.name}</div>
        <div class="mini-table__subtitle">${item.detail}</div>
      </div>
      <span class="status-pill status-pill--health-${item.state}">${formatHealthState(item.state)}</span>
    </div>
  `;
}

function formatStatus(status: TaskStatus): string {
  return status.replace("_", " ");
}

function formatHealthState(state: HealthState): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function renderIcon(iconClassName: string): string {
  return `<i class="${iconClassName} fa-fw" aria-hidden="true"></i>`;
}
