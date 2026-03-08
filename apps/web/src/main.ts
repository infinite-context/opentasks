import "@fortawesome/fontawesome-free/css/all.min.css";
import {
  projectListDtoSchema,
  projectRecordSchema,
  dashboardSnapshotDtoSchema,
  dashboardStreamEventDtoSchema,
  taskDetailDtoSchema,
  taskListDtoSchema,
  type DashboardSnapshotDto,
  type ProjectRecord,
  type TaskRecord
} from "@opentasks/contracts";
import "./style.css";

import { renderSidebar, renderTopbar } from "./components";
import { DEFAULT_PROJECT_ID } from "./config";
import {
  buildAnalyticsChartData,
  buildProjectListUrl,
  buildDashboardApiUrl,
  buildDashboardStreamUrl,
  buildFocusMessage,
  buildMetaUrl,
  buildTaskDetailUrl,
  buildTaskListUrl,
  createProjectRequest,
  destroyAnalyticsCharts,
  filterTasks,
  getAppRoot,
  initAnalyticsCharts,
  normalizeProjectKey,
  pickSelectedTaskId,
  taskFilterToStatusParams,
  resolveInitialTheme,
  persistTheme
} from "./lib";
import {
  renderAgentsView,
  renderAnalyticsView,
  renderDashboardView,
  renderMcpView,
  renderPlaceholderView,
  renderProjectsView,
  renderSettingsView,
  renderSystemHealthView,
  renderTasksView
} from "./views";
import type { AnalyticsTimeRange, ConnectionState, TaskFilter, ViewId } from "./types";

const appRoot = getAppRoot();

let activeTheme = resolveInitialTheme();
let analyticsTimeRange: AnalyticsTimeRange = "day";
let currentView: ViewId = "dashboard";
let currentProjectId = DEFAULT_PROJECT_ID;
let projects: ProjectRecord[] = [];
let isProjectMenuOpen = false;
let selectedTaskId = "";
let activeTaskFilter: TaskFilter = "all";
let dashboardSnapshot: DashboardSnapshotDto | null = null;
let taskList: TaskRecord[] = [];
let taskDetailEvents: import("@opentasks/contracts").TaskEvent[] | null = null;
let selectedAgentName = "";
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
let projectFormName = "";
let projectFormKey = "";
let projectFormError = "";
let projectFormSubmitting = false;

void initializeApp();

async function initializeApp(): Promise<void> {
  renderApp();
  await loadProjects();
  await loadDataForCurrentView();
  if (currentView === "dashboard") {
    connectDashboardStream();
  }
  window.addEventListener("beforeunload", () => {
    dashboardStream?.close();
  });
}

async function loadProjects(): Promise<void> {
  try {
    const response = await fetch(buildProjectListUrl(100));
    if (!response.ok) {
      throw new Error(`Project list request failed with status ${response.status}.`);
    }

    const dto = projectListDtoSchema.parse(await response.json());
    projects = dto.projects;

    if (
      projects.length > 0 &&
      !projects.some((project) => project.id === currentProjectId || project.key === currentProjectId)
    ) {
      currentProjectId = projects[0].id;
    }
  } catch {
    projects = [];
  }
}

async function loadDashboardSnapshot(): Promise<void> {
  isLoading = true;
  errorMessage = "";
  renderApp();

  try {
    const response = await fetch(buildDashboardApiUrl(currentProjectId));
    if (!response.ok) {
      throw new Error(`Dashboard request failed with status ${response.status}.`);
    }

    const snapshot = dashboardSnapshotDtoSchema.parse(await response.json());
    dashboardSnapshot = snapshot;
    currentProjectId = snapshot.project?.id ?? snapshot.project?.key ?? currentProjectId;
    selectedTaskId = pickSelectedTaskId(snapshot.tasks, selectedTaskId);
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
      projectId: currentProjectId,
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
  } catch (error) {
    tasksViewErrorMessage = error instanceof Error ? error.message : "Unable to load tasks.";
    taskList = [];
  } finally {
    tasksViewLoading = false;
    renderApp();
    if (currentView === "tasks") {
      await loadTaskDetail(selectedTaskId);
      renderApp();
    }
  }
}

async function loadTaskDetail(taskId: string): Promise<void> {
  if (!taskId) {
    taskDetailEvents = null;
    return;
  }
  try {
    const response = await fetch(buildTaskDetailUrl(taskId));
    if (!response.ok) {
      taskDetailEvents = [];
      return;
    }
    const dto = taskDetailDtoSchema.parse(await response.json());
    taskDetailEvents = dto.events ?? [];
  } catch {
    taskDetailEvents = [];
  }
}

function connectDashboardStream(): void {
  dashboardStream?.close();
  connectionState = "connecting";
  renderApp();

  const streamUrl = buildDashboardStreamUrl(currentProjectId);
  dashboardStream = new EventSource(streamUrl);

  dashboardStream.addEventListener("dashboard.snapshot", (event) => {
    try {
      const parsed = dashboardStreamEventDtoSchema.parse(JSON.parse((event as MessageEvent).data));
      dashboardSnapshot = parsed.data;
      selectedTaskId = pickSelectedTaskId(parsed.data.tasks, selectedTaskId);
      connectionState = "connected";
      renderApp();
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
      if (!dashboardSnapshot) {
        await loadDashboardSnapshot();
      }
      if (!selectedAgentName && (dashboardSnapshot?.agents?.length ?? 0) > 0) {
        selectedAgentName = dashboardSnapshot!.agents[0].agentName;
      }
      break;
    case "analytics":
      if (!dashboardSnapshot) {
        await loadDashboardSnapshot();
      }
      break;
    case "system-health":
      if (!dashboardSnapshot) {
        await loadDashboardSnapshot();
      }
      break;
    case "mcp":
      await loadMcpMeta();
      break;
    case "projects":
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
        taskDetailEvents,
        errorMessage: tasksViewErrorMessage,
        isLoading: tasksViewLoading
      });
    }
    case "agents":
      return renderAgentsView({
        snapshot: dashboardSnapshot,
        selectedAgentName
      });
    case "analytics":
      return renderAnalyticsView({ snapshot: dashboardSnapshot, analyticsTimeRange });
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
    case "projects":
      return renderProjectsView({
        keyValue: projectFormKey,
        nameValue: projectFormName,
        errorMessage: projectFormError,
        isSubmitting: projectFormSubmitting
      });
    case "runs":
    case "memory":
      return renderPlaceholderView(getPlaceholderTitle(currentView));
    case "settings":
      return renderSettingsView({ activeTheme });
    default:
      return renderPlaceholderView("Feature");
  }
}

function getPlaceholderTitle(view: ViewId): string {
  const titles: Record<string, string> = {
    projects: "Projects",
    runs: "Runs",
    memory: "Memory",
    settings: "Settings"
  };
  return titles[view] ?? "Feature";
}

function getTopbarProps(): { title: string; subtitle: string } {
  switch (currentView) {
    case "projects":
      return { title: "Projects", subtitle: "Workspace setup" };
    case "dashboard":
      return { title: "Dashboard", subtitle: "Live dashboard" };
    case "tasks":
      return { title: "Tasks", subtitle: "Task list" };
    case "agents":
      return { title: "Agents", subtitle: "Agent utilization" };
    case "system-health":
      return { title: "System Health", subtitle: "Platform status" };
    case "analytics":
      return { title: "Analytics", subtitle: "Task metrics" };
    case "mcp":
      return { title: "MCP", subtitle: "Server setup" };
    case "runs":
    case "memory":
      return { title: getPlaceholderTitle(currentView), subtitle: "Coming soon" };
    case "settings":
      return { title: "Settings", subtitle: "Preferences" };
    default:
      return { title: "OpenTasks", subtitle: "" };
  }
}

function renderApp(): void {
  const snapshot = dashboardSnapshot;
  const projectOptions =
    projects.length > 0
      ? projects.map((project) => ({
          id: project.id,
          label: project.name
        }))
      : [
          {
            id: currentProjectId,
            label: snapshot?.project?.name ?? snapshot?.project?.key ?? currentProjectId
          }
        ];

  destroyAnalyticsCharts();

  const mainEl = appRoot.querySelector<HTMLElement>(".main");
  const scrollTop = mainEl?.scrollTop ?? 0;

  document.documentElement.dataset.theme = activeTheme;
  appRoot.innerHTML = `
    <div class="shell">
      ${renderSidebar(
        activeTheme,
        currentView,
        buildFocusMessage(snapshot),
        projectOptions,
        currentProjectId,
        isProjectMenuOpen
      )}

      <main class="main">
        ${renderTopbar(getTopbarProps())}
        ${renderMainContent()}
      </main>
    </div>
  `;

  const newMain = appRoot.querySelector<HTMLElement>(".main");
  if (newMain && scrollTop > 0) {
    newMain.scrollTop = scrollTop;
  }

  bindEvents();

  if (currentView === "analytics") {
    const chartData = buildAnalyticsChartData(dashboardSnapshot, analyticsTimeRange);
    requestAnimationFrame(() => {
      initAnalyticsCharts(chartData);
    });
  }
}

function bindEvents(): void {
  const themeToggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  themeToggle?.addEventListener("click", () => {
    activeTheme = activeTheme === "light" ? "dark" : "light";
    persistTheme(activeTheme);
    renderApp();
  });

  document.querySelector<HTMLSelectElement>("[data-analytics-time-range]")?.addEventListener("change", (e) => {
    analyticsTimeRange = (e.target as HTMLSelectElement).value as AnalyticsTimeRange;
    renderApp();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const choice = btn.dataset.themeChoice as "light" | "dark" | undefined;
      if (choice === "light" || choice === "dark") {
        activeTheme = choice;
        persistTheme(activeTheme);
        renderApp();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view as ViewId | undefined;
      if (!view) return;
      isProjectMenuOpen = false;
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

  document.querySelector<HTMLButtonElement>("[data-project-menu-toggle]")?.addEventListener("click", () => {
    isProjectMenuOpen = !isProjectMenuOpen;
    renderApp();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-project-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextProjectId = button.dataset.projectOption;
      if (!nextProjectId) {
        return;
      }

      isProjectMenuOpen = false;

      if (nextProjectId === currentProjectId) {
        renderApp();
        return;
      }

      currentProjectId = nextProjectId;
      selectedTaskId = "";
      selectedAgentName = "";
      dashboardSnapshot = null;
      taskList = [];
      taskDetailEvents = null;

      if (currentView === "dashboard") {
        connectDashboardStream();
      } else if (dashboardStream) {
        dashboardStream.close();
        dashboardStream = null;
      }

      void loadDataForCurrentView().then(renderApp);
    });
  });

  document.querySelector<HTMLButtonElement>("[data-project-new]")?.addEventListener("click", () => {
    isProjectMenuOpen = false;
    currentView = "projects";
    projectFormError = "";
    if (dashboardStream) {
      dashboardStream.close();
      dashboardStream = null;
    }
    renderApp();
  });

  document.querySelector<HTMLInputElement>("[data-project-name-input]")?.addEventListener("input", (event) => {
    projectFormName = (event.target as HTMLInputElement).value;
    if (!projectFormKey.trim()) {
      projectFormKey = normalizeProjectKey(projectFormName);
      renderApp();
    }
  });

  document.querySelector<HTMLInputElement>("[data-project-key-input]")?.addEventListener("input", (event) => {
    projectFormKey = (event.target as HTMLInputElement).value;
  });

  document.querySelector<HTMLFormElement>("[data-project-create-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitProjectForm();
  });

  document.querySelectorAll<HTMLElement>("[data-task-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-agent-link]")) {
        return;
      }
      selectedTaskId = row.dataset.taskId ?? selectedTaskId;
      if (currentView === "tasks") {
        void loadTaskDetail(selectedTaskId).then(renderApp);
      } else {
        renderApp();
      }
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if ((e.target as HTMLElement).closest("[data-agent-link]")) {
          return;
        }
        selectedTaskId = row.dataset.taskId ?? selectedTaskId;
        if (currentView === "tasks") {
          void loadTaskDetail(selectedTaskId).then(renderApp);
        } else {
          renderApp();
        }
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-agent-link]").forEach((el) => {
    if (!el.dataset.agentName) return;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      selectedAgentName = el.dataset.agentName ?? "";
      currentView = "agents";
      if (dashboardStream) {
        dashboardStream.close();
        dashboardStream = null;
      }
      void loadDataForCurrentView().then(renderApp);
    });
    el.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && el.dataset.agentName) {
        e.preventDefault();
        e.stopPropagation();
        selectedAgentName = el.dataset.agentName ?? "";
        currentView = "agents";
        if (dashboardStream) {
          dashboardStream.close();
          dashboardStream = null;
        }
        void loadDataForCurrentView().then(renderApp);
      }
    });
  });

  document.querySelectorAll<HTMLElement>(".agent-row").forEach((row) => {
    row.addEventListener("click", () => {
      selectedAgentName = row.dataset.agentName ?? selectedAgentName;
      renderApp();
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectedAgentName = row.dataset.agentName ?? selectedAgentName;
        renderApp();
      }
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

async function submitProjectForm(): Promise<void> {
  const name = projectFormName.trim();
  const key = normalizeProjectKey(projectFormKey || projectFormName);

  if (!name || !key) {
    projectFormError = "Project name and key are required.";
    renderApp();
    return;
  }

  projectFormSubmitting = true;
  projectFormError = "";
  renderApp();

  try {
    const response = await createProjectRequest({ key, name });
    if (!response.ok) {
      throw new Error(`Project create request failed with status ${response.status}.`);
    }

    const project = projectRecordSchema.parse(await response.json());
    projectFormSubmitting = false;
    projectFormName = "";
    projectFormKey = "";
    currentProjectId = project.id;
    currentView = "dashboard";
    selectedAgentName = "";
    dashboardSnapshot = null;
    taskList = [];
    taskDetailEvents = null;
    await loadProjects();
    await loadDashboardSnapshot();
    connectDashboardStream();
  } catch (error) {
    projectFormSubmitting = false;
    projectFormError = error instanceof Error ? error.message : "Unable to create project.";
    renderApp();
  }
}
