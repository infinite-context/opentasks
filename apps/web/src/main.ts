import "@fortawesome/fontawesome-free/css/all.min.css";
import {
  dashboardSnapshotDtoSchema,
  dashboardStreamEventDtoSchema,
  taskDetailDtoSchema,
  taskListDtoSchema,
  type DashboardSnapshotDto,
  type TaskDetailDto,
  type TaskRecord
} from "@opentasks/contracts";
import "./style.css";

import { renderSidebar, renderTopbar } from "./components";
import { DEFAULT_PROJECT_ID } from "./config";
import {
  buildDashboardApiUrl,
  buildDashboardStreamUrl,
  buildFocusMessage,
  buildMetaUrl,
  buildTaskDetailUrl,
  buildTaskListUrl,
  filterTasks,
  getAppRoot,
  pickSelectedTaskId,
  taskFilterToStatusParams,
  resolveInitialTheme,
  persistTheme
} from "./lib";
import {
  renderAgentsView,
  renderDashboardView,
  renderMcpView,
  renderPlaceholderView,
  renderSystemHealthView,
  renderTasksView
} from "./views";
import type { ConnectionState, TaskFilter, ViewId } from "./types";

const appRoot = getAppRoot();

let activeTheme = resolveInitialTheme();
let currentView: ViewId = "dashboard";
let selectedTaskId = "";
let activeTaskFilter: TaskFilter = "all";
let dashboardSnapshot: DashboardSnapshotDto | null = null;
let taskList: TaskRecord[] = [];
let selectedTaskDetail: TaskDetailDto | null = null;
let connectionState: ConnectionState = "connecting";
let errorMessage = "";
let tasksViewErrorMessage = "";
let isLoading = true;
let tasksViewLoading = false;
let dashboardStream: EventSource | null = null;
let mcpProjectPath: string | null = null;
let mcpErrorMessage = "";
let mcpLoading = false;
let mcpConfigJson = "";

void initializeApp();

async function initializeApp(): Promise<void> {
  renderApp();
  await loadDataForCurrentView();
  if (currentView === "dashboard") {
    connectDashboardStream();
  }
  window.addEventListener("beforeunload", () => {
    dashboardStream?.close();
  });
}

async function loadDashboardSnapshot(): Promise<void> {
  isLoading = true;
  errorMessage = "";
  renderApp();

  try {
    const response = await fetch(buildDashboardApiUrl(DEFAULT_PROJECT_ID));
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

async function loadTaskList(): Promise<void> {
  tasksViewLoading = true;
  tasksViewErrorMessage = "";
  renderApp();

  try {
    const statusParams = taskFilterToStatusParams(activeTaskFilter);
    const url = buildTaskListUrl({
      projectId: DEFAULT_PROJECT_ID,
      status: statusParams,
      limit: 100
    });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Task list request failed with status ${response.status}.`);
    }

    const dto = taskListDtoSchema.parse(await response.json());
    taskList = dto.tasks;
    selectedTaskId = pickSelectedTaskId(dto.tasks, selectedTaskId);
    await loadSelectedTaskDetail();
  } catch (error) {
    tasksViewErrorMessage = error instanceof Error ? error.message : "Unable to load tasks.";
    taskList = [];
  } finally {
    tasksViewLoading = false;
    renderApp();
  }
}

async function loadSelectedTaskDetail(): Promise<void> {
  if (!selectedTaskId) {
    selectedTaskDetail = null;
    return;
  }

  try {
    const response = await fetch(buildTaskDetailUrl(selectedTaskId));
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

  const streamUrl = buildDashboardStreamUrl(DEFAULT_PROJECT_ID);
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

async function loadMcpMeta(): Promise<void> {
  mcpLoading = true;
  mcpErrorMessage = "";
  mcpProjectPath = null;
  renderApp();

  try {
    const response = await fetch(buildMetaUrl());
    if (!response.ok) {
      throw new Error(`Meta request failed with status ${response.status}.`);
    }
    const meta = (await response.json()) as { projectPath?: string };
    mcpProjectPath = meta.projectPath ?? null;
  } catch (error) {
    mcpErrorMessage = error instanceof Error ? error.message : "Unable to load MCP config.";
  } finally {
    mcpLoading = false;
    renderApp();
  }
}

async function loadDataForCurrentView(): Promise<void> {
  switch (currentView) {
    case "dashboard":
      await loadDashboardSnapshot();
      break;
    case "tasks":
      await loadTaskList();
      break;
    case "agents":
    case "system-health":
      if (!dashboardSnapshot) {
        await loadDashboardSnapshot();
      }
      break;
    case "mcp":
      await loadMcpMeta();
      break;
    case "runs":
    case "memory":
    case "settings":
      break;
  }
}

function renderMainContent(): string {
  switch (currentView) {
    case "dashboard": {
      const snapshot = dashboardSnapshot;
      const allTasks = snapshot?.tasks ?? [];
      const filteredTasks = filterTasks(allTasks, activeTaskFilter);
      const selectedTask =
        filteredTasks.find((t) => t.id === selectedTaskId) ??
        allTasks.find((t) => t.id === selectedTaskId) ??
        filteredTasks[0] ??
        allTasks[0] ??
        null;
      return renderDashboardView({
        snapshot,
        filteredTasks,
        activeTaskFilter,
        selectedTask,
        selectedTaskDetail,
        connectionState,
        errorMessage,
        isLoading
      });
    }
    case "tasks": {
      const selectedTask = taskList.find((t) => t.id === selectedTaskId) ?? null;
      return renderTasksView({
        tasks: taskList,
        activeFilter: activeTaskFilter,
        selectedTaskId: selectedTask?.id ?? selectedTaskId,
        selectedTaskDetail,
        errorMessage: tasksViewErrorMessage,
        isLoading: tasksViewLoading
      });
    }
    case "agents":
      return renderAgentsView(dashboardSnapshot);
    case "system-health":
      return renderSystemHealthView(dashboardSnapshot);
    case "mcp": {
      const pathForConfig = mcpProjectPath ?? "<path-to-project>";
      const config = {
        mcpServers: {
          opentasks: {
            command: "npm",
            args: ["--prefix", pathForConfig, "run", "start:mcp"]
          }
        }
      };
      mcpConfigJson = JSON.stringify(config, null, 2);
      return renderMcpView({
        projectPath: mcpProjectPath,
        isLoading: mcpLoading,
        errorMessage: mcpErrorMessage
      });
    }
    case "runs":
    case "memory":
    case "settings":
      return renderPlaceholderView(getPlaceholderTitle(currentView));
    default:
      return renderPlaceholderView("Feature");
  }
}

function getPlaceholderTitle(view: ViewId): string {
  const titles: Record<string, string> = {
    runs: "Runs",
    memory: "Memory",
    settings: "Settings"
  };
  return titles[view] ?? "Feature";
}

function getTopbarProps(): { title: string; subtitle: string } {
  switch (currentView) {
    case "dashboard":
      return { title: "Dashboard", subtitle: "Live dashboard" };
    case "tasks":
      return { title: "Tasks", subtitle: "Task list" };
    case "agents":
      return { title: "Agents", subtitle: "Agent utilization" };
    case "system-health":
      return { title: "System Health", subtitle: "Platform status" };
    case "mcp":
      return { title: "MCP", subtitle: "Server setup" };
    case "runs":
    case "memory":
    case "settings":
      return { title: getPlaceholderTitle(currentView), subtitle: "Coming soon" };
    default:
      return { title: "OpenTasks", subtitle: "" };
  }
}

function renderApp(): void {
  const snapshot = dashboardSnapshot;

  document.documentElement.dataset.theme = activeTheme;
  appRoot.innerHTML = `
    <div class="shell">
      ${renderSidebar(activeTheme, currentView, buildFocusMessage(snapshot))}

      <main class="main">
        ${renderTopbar(getTopbarProps())}
        ${renderMainContent()}
      </main>
    </div>
  `;

  bindEvents();
}

function bindEvents(): void {
  const themeToggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  themeToggle?.addEventListener("click", () => {
    activeTheme = activeTheme === "light" ? "dark" : "light";
    persistTheme(activeTheme);
    renderApp();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view as ViewId | undefined;
      if (!view) return;
      currentView = view;

      if (view === "dashboard" && !dashboardStream) {
        connectDashboardStream();
      } else if (view !== "dashboard" && dashboardStream) {
        dashboardStream.close();
        dashboardStream = null;
      }

      void loadDataForCurrentView().then(renderApp);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTaskId = button.dataset.taskId ?? selectedTaskId;
      renderApp();
      void loadSelectedTaskDetail().then(renderApp);
    });
  });

  document.querySelector<HTMLButtonElement>("[data-copy-mcp]")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(mcpConfigJson);
      const btn = document.querySelector("[data-copy-mcp]");
      if (btn) {
        const content = btn.querySelector(".button__content");
        const originalHtml = content?.innerHTML ?? "";
        if (content) {
          content.innerHTML = '<i class="fa-solid fa-check fa-fw" aria-hidden="true"></i><span>Copied!</span>';
          setTimeout(() => {
            content.innerHTML = originalHtml;
          }, 1500);
        }
      }
    } catch {
      /* clipboard not available */
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTaskFilter = (button.dataset.filter as TaskFilter | undefined) ?? activeTaskFilter;
      if (currentView === "tasks") {
        void loadTaskList();
      } else {
        renderApp();
      }
    });
  });
}
