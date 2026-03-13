import "@fortawesome/fontawesome-free/css/all.min.css";
import {
  agentListDtoSchema,
  goalListDtoSchema,
  mcpLogListDtoSchema,
  projectListDtoSchema,
  projectRecordSchema,
  dashboardSnapshotDtoSchema,
  dashboardStreamEventDtoSchema,
  taskDetailDtoSchema,
  taskListDtoSchema,
  type AgentRecordDto,
  type McpLogRecordDto,
  type DashboardSnapshotDto,
  type GoalRecord,
  type ProjectRecord,
  type TaskRecord
} from "@opentasks/contracts";
import "./style.css";

import { renderSidebar, renderTopbar } from "./components";
import { DEFAULT_PROJECT_ID } from "./config";
import {
  buildAgentsUrl,
  buildAnalyticsChartData,
  buildMcpLogsUrl,
  buildGoalListUrl,
  buildPickFolderUrl,
  buildProjectListUrl,
  buildDashboardApiUrl,
  buildDashboardStreamUrl,
  buildFocusMessage,
  buildMcpUrl,
  buildMetaUrl,
  buildTaskDetailUrl,
  buildTaskListUrl,
  buildValidatePathUrl,
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
  renderGoalsView,
  renderMcpView,
  renderPlaceholderView,
  renderProjectView,
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
let goals: GoalRecord[] = [];
let selectedGoalId = "";
let selectedTaskId = "";
let activeTaskFilter: TaskFilter = "all";
let dashboardSnapshot: DashboardSnapshotDto | null = null;
let taskList: TaskRecord[] = [];
let taskDetailEvents: import("@opentasks/contracts").TaskEvent[] | null = null;
let selectedAgentName = "";
let agentList: AgentRecordDto[] = [];
let agentsViewLoading = false;
let agentsViewErrorMessage = "";
let agentLogs: McpLogRecordDto[] = [];
let agentLogsLoading = false;
let agentLogsErrorMessage = "";
let connectionState: ConnectionState = "connecting";
let mcpConnected = false;
let errorMessage = "";
let tasksViewErrorMessage = "";
let goalsViewErrorMessage = "";
let isLoading = true;
let tasksViewLoading = false;
let goalsViewLoading = false;
let dashboardStream: EventSource | null = null;
let mcpErrorMessage = "";
let mcpLoading = false;
let mcpConfigJson = "";
let projectFormName = "";
let projectFormKey = "";
let projectFormDescription = "";
let projectFormWorkingDirectory = "";
let projectFormWorkingDirectoryValid: boolean | null = null;
let projectFormWorkingDirectoryError = "";
let projectFormWorkingDirectoryValidateTimeout: ReturnType<typeof setTimeout> | null = null;
let projectFormBrowseLoading = false;
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
    mcpConnected = true;

    if (
      projects.length > 0 &&
      !projects.some((project) => project.id === currentProjectId || project.key === currentProjectId)
    ) {
      currentProjectId = projects[0].id;
    }
  } catch {
    projects = [];
    mcpConnected = false;
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
    mcpConnected = true;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to load dashboard data.";
    connectionState = "disconnected";
    mcpConnected = false;
  } finally {
    isLoading = false;
    renderApp();
  }
}

async function loadGoals(): Promise<void> {
  goalsViewLoading = true;
  goalsViewErrorMessage = "";
  renderApp();

  if (!hasActiveProject()) {
    goals = [];
    taskList = [];
    selectedGoalId = "";
    goalsViewLoading = false;
    renderApp();
    return;
  }

  try {
    const [goalsResponse, tasksResponse] = await Promise.all([
      fetch(buildGoalListUrl(currentProjectId)),
      fetch(buildTaskListUrl({ projectId: currentProjectId, limit: 200 }))
    ]);

    if (!goalsResponse.ok) {
      throw new Error(`Goals request failed with status ${goalsResponse.status}.`);
    }
    if (!tasksResponse.ok) {
      throw new Error(`Task list request failed with status ${tasksResponse.status}.`);
    }

    const goalsDto = goalListDtoSchema.parse(await goalsResponse.json());
    const tasksDto = taskListDtoSchema.parse(await tasksResponse.json());
    goals = goalsDto.goals;
    taskList = tasksDto.tasks;
    selectedGoalId = goals.find((goal) => goal.id === selectedGoalId)?.id ?? goals[0]?.id ?? "";
  } catch (error) {
    goalsViewErrorMessage = error instanceof Error ? error.message : "Unable to load goals.";
    goals = [];
    taskList = [];
    selectedGoalId = "";
  } finally {
    goalsViewLoading = false;
    renderApp();
  }
}

async function loadAgents(): Promise<void> {
  agentsViewLoading = true;
  agentsViewErrorMessage = "";
  renderApp();

  try {
    const response = await fetch(buildAgentsUrl(200));
    if (!response.ok) {
      throw new Error(`Agents request failed with status ${response.status}.`);
    }
    const dto = agentListDtoSchema.parse(await response.json());
    agentList = dto.agents;
  } catch (error) {
    agentsViewErrorMessage = error instanceof Error ? error.message : "Unable to load agents.";
    agentList = [];
  } finally {
    agentsViewLoading = false;
    renderApp();
  }
}

async function loadAgentLogs(agentDisplayName: string): Promise<void> {
  agentLogsLoading = true;
  agentLogsErrorMessage = "";
  renderApp();

  try {
    const response = await fetch(buildMcpLogsUrl(agentDisplayName, 100));
    if (!response.ok) {
      throw new Error(`MCP logs request failed with status ${response.status}.`);
    }
    const dto = mcpLogListDtoSchema.parse(await response.json());
    agentLogs = dto.logs;
  } catch (error) {
    agentLogsErrorMessage = error instanceof Error ? error.message : "Unable to load MCP logs.";
    agentLogs = [];
  } finally {
    agentLogsLoading = false;
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

function hasActiveProject(): boolean {
  if (projects.length > 0) {
    return true;
  }

  const snapshotProjectId = dashboardSnapshot?.project?.id ?? dashboardSnapshot?.project?.key ?? "";
  return Boolean(currentProjectId.trim() || snapshotProjectId.trim());
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
    mcpConnected = true;
      renderApp();
    } catch {
      connectionState = "disconnected";
    mcpConnected = false;
      renderApp();
    }
  });

  dashboardStream.onopen = () => {
    connectionState = "connected";
    mcpConnected = true;
    renderApp();
  };

  dashboardStream.onerror = () => {
    connectionState = "disconnected";
    mcpConnected = false;
    renderApp();
  };
}

async function loadMcpMeta(): Promise<void> {
  mcpLoading = true;
  mcpErrorMessage = "";
  renderApp();

  try {
    const response = await fetch(buildMetaUrl());
    if (!response.ok) {
      throw new Error(`Meta request failed with status ${response.status}.`);
    }
  } catch (error) {
    mcpErrorMessage = error instanceof Error ? error.message : "Unable to load MCP config.";
  } finally {
    mcpLoading = false;
    renderApp();
  }
}

async function loadDataForCurrentView(): Promise<void> {
  switch (currentView) {
    case "project":
    case "goals":
      await loadGoals();
      break;
    case "dashboard":
      await loadDashboardSnapshot();
      break;
    case "tasks":
      await loadTaskList();
      break;
    case "agents":
      await loadAgents();
      if (!dashboardSnapshot) {
        await loadDashboardSnapshot();
      }
      if (!selectedAgentName && agentList.length > 0) {
        selectedAgentName = agentList[0].displayName;
      }
      if (selectedAgentName) {
        await loadAgentLogs(selectedAgentName);
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

function resolveCurrentProject(): ProjectRecord | null {
  if (!hasActiveProject()) {
    return null;
  }

  const byId = projects.find(
    (p) => p.id === currentProjectId || p.key === currentProjectId
  );
  if (byId) return byId;
  const fromSnapshot = dashboardSnapshot?.project;
  if (fromSnapshot) {
    return {
      id: fromSnapshot.id ?? fromSnapshot.key ?? currentProjectId,
      key: fromSnapshot.key ?? currentProjectId,
      name: fromSnapshot.name ?? fromSnapshot.key ?? currentProjectId,
      description: fromSnapshot.description ?? "",
      workingDirectory: fromSnapshot.workingDirectory ?? "",
      createdAt: fromSnapshot.createdAt ?? "",
      updatedAt: fromSnapshot.updatedAt ?? ""
    };
  }
  return {
    id: currentProjectId,
    key: currentProjectId,
    name: currentProjectId,
    description: "",
    workingDirectory: "",
    createdAt: "",
    updatedAt: ""
  };
}

function renderMainContent(): string {
  switch (currentView) {
    case "project":
      return renderProjectView({
        project: resolveCurrentProject(),
        hasProject: hasActiveProject(),
        goals,
        tasks: taskList,
        selectedTaskId,
        errorMessage: goalsViewErrorMessage,
        isLoading: goalsViewLoading
      });
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
    case "goals":
      return renderGoalsView({
        hasProject: hasActiveProject(),
        goals,
        tasks: taskList,
        selectedGoalId,
        selectedTaskId,
        errorMessage: goalsViewErrorMessage,
        isLoading: goalsViewLoading
      });
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
        agents: agentList,
        tasks: dashboardSnapshot?.tasks ?? [],
        selectedAgentName,
        agentLogs,
        isLoading: agentsViewLoading,
        errorMessage: agentsViewErrorMessage,
        agentLogsLoading,
        agentLogsErrorMessage
      });
    case "analytics":
      return renderAnalyticsView({ snapshot: dashboardSnapshot, analyticsTimeRange });
    case "system-health":
      return renderSystemHealthView(dashboardSnapshot);
    case "mcp": {
      mcpConfigJson = JSON.stringify(
        { mcpServers: { opentasks: { url: buildMcpUrl() } } },
        null,
        2
      );
      return renderMcpView({
        isLoading: mcpLoading,
        errorMessage: mcpErrorMessage,
        mcpUrl: buildMcpUrl()
      });
    }
    case "projects":
      return renderProjectsView({
        keyValue: projectFormKey,
        nameValue: projectFormName,
        descriptionValue: projectFormDescription,
        workingDirectoryValue: projectFormWorkingDirectory,
        workingDirectoryValid: projectFormWorkingDirectoryValid,
        workingDirectoryError: projectFormWorkingDirectoryError,
        browseLoading: projectFormBrowseLoading,
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
    case "project":
      return {
        title: resolveCurrentProject()?.name ?? "Project",
        subtitle: "Goals and tasks"
      };
    case "projects":
      return { title: "Projects", subtitle: "Workspace setup" };
    case "dashboard":
      return { title: "Dashboard", subtitle: "Live dashboard" };
    case "goals":
      return { title: "Goals", subtitle: "Project goals" };
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
      : snapshot?.project
        ? [{ id: snapshot.project.id, label: snapshot.project.name ?? snapshot.project.key }]
        : [];

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
        ${renderTopbar({ ...getTopbarProps(), mcpConnected })}
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
      goals = [];
      selectedGoalId = "";
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
    projectFormDescription = "";
    projectFormWorkingDirectory = "";
    projectFormWorkingDirectoryValid = null;
    projectFormWorkingDirectoryError = "";
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

  document.querySelector<HTMLInputElement>("[data-project-description-input]")?.addEventListener("input", (event) => {
    projectFormDescription = (event.target as HTMLInputElement).value;
  });

  document.querySelector<HTMLInputElement>("[data-project-working-directory-input]")?.addEventListener("input", (event) => {
    projectFormWorkingDirectory = (event.target as HTMLInputElement).value;
    projectFormWorkingDirectoryValid = null;
    projectFormWorkingDirectoryError = "";
    if (projectFormWorkingDirectoryValidateTimeout) {
      clearTimeout(projectFormWorkingDirectoryValidateTimeout);
    }
    projectFormWorkingDirectoryValidateTimeout = setTimeout(() => {
      void validateWorkingDirectory(projectFormWorkingDirectory);
    }, 400);
    renderApp();
  });

  document.querySelector<HTMLButtonElement>("[data-project-browse]")?.addEventListener("click", async () => {
    projectFormBrowseLoading = true;
    renderApp();
    try {
      const response = await fetch(buildPickFolderUrl());
      const data = (await response.json()) as { path: string | null };
      if (data.path) {
        projectFormWorkingDirectory = data.path;
        projectFormWorkingDirectoryValid = true;
        projectFormWorkingDirectoryError = "";
        void validateWorkingDirectory(data.path);
      }
    } catch (e) {
      console.error("Failed to pick folder", e);
    } finally {
      projectFormBrowseLoading = false;
      renderApp();
    }
  });

  document.querySelector<HTMLFormElement>("[data-project-create-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitProjectForm();
  });

  document.querySelectorAll<HTMLElement>("[data-task-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-agent-link], [data-goal-link]")) {
        return;
      }
      selectedTaskId = row.dataset.taskId ?? selectedTaskId;
      if (currentView === "tasks") {
        void loadTaskDetail(selectedTaskId).then(renderApp);
      } else if (currentView === "goals" || currentView === "project") {
        currentView = "tasks";
        void loadDataForCurrentView().then(() => {
          void loadTaskDetail(selectedTaskId).then(renderApp);
        });
      } else {
        renderApp();
      }
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if ((e.target as HTMLElement).closest("[data-agent-link], [data-goal-link]")) {
          return;
        }
        selectedTaskId = row.dataset.taskId ?? selectedTaskId;
        if (currentView === "tasks") {
          void loadTaskDetail(selectedTaskId).then(renderApp);
        } else if (currentView === "goals" || currentView === "project") {
          currentView = "tasks";
          void loadDataForCurrentView().then(() => {
            void loadTaskDetail(selectedTaskId).then(renderApp);
          });
        } else {
          renderApp();
        }
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-goal-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-project-link]")) {
        return;
      }
      selectedGoalId = row.dataset.goalId ?? selectedGoalId;
      renderApp();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if ((event.target as HTMLElement).closest("[data-project-link]")) {
          return;
        }
        selectedGoalId = row.dataset.goalId ?? selectedGoalId;
        renderApp();
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-goal-link]").forEach((el) => {
    if (!el.dataset.goalId) return;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      selectedGoalId = el.dataset.goalId ?? "";
      currentView = "goals";
      if (dashboardStream) {
        dashboardStream.close();
        dashboardStream = null;
      }
      void loadDataForCurrentView().then(renderApp);
    });
    el.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && el.dataset.goalId) {
        e.preventDefault();
        e.stopPropagation();
        selectedGoalId = el.dataset.goalId ?? "";
        currentView = "goals";
        if (dashboardStream) {
          dashboardStream.close();
          dashboardStream = null;
        }
        void loadDataForCurrentView().then(renderApp);
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-project-link]").forEach((el) => {
    if (!el.dataset.projectId) return;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const projectId = el.dataset.projectId ?? "";
      if (projectId && projectId !== currentProjectId) {
        currentProjectId = projectId;
        goals = [];
        selectedGoalId = "";
        selectedTaskId = "";
        selectedAgentName = "";
        dashboardSnapshot = null;
        taskList = [];
        taskDetailEvents = null;
        if (dashboardStream) {
          dashboardStream.close();
          dashboardStream = null;
        }
        void loadDataForCurrentView().then(renderApp);
      }
    });
    el.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && el.dataset.projectId) {
        e.preventDefault();
        e.stopPropagation();
        const projectId = el.dataset.projectId ?? "";
        if (projectId && projectId !== currentProjectId) {
          currentProjectId = projectId;
          goals = [];
          selectedGoalId = "";
          selectedTaskId = "";
          selectedAgentName = "";
          dashboardSnapshot = null;
          taskList = [];
          taskDetailEvents = null;
          if (dashboardStream) {
            dashboardStream.close();
            dashboardStream = null;
          }
          void loadDataForCurrentView().then(renderApp);
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
      const name = row.dataset.agentName ?? selectedAgentName;
      selectedAgentName = name;
      renderApp();
      if (currentView === "agents" && name) {
        void loadAgentLogs(name);
      }
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const name = row.dataset.agentName ?? selectedAgentName;
        selectedAgentName = name;
        renderApp();
        if (currentView === "agents" && name) {
          void loadAgentLogs(name);
        }
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

async function validateWorkingDirectory(path: string): Promise<void> {
  const trimmed = path.trim();
  if (!trimmed) {
    projectFormWorkingDirectoryValid = null;
    projectFormWorkingDirectoryError = "";
    return;
  }
  try {
    const response = await fetch(buildValidatePathUrl(trimmed));
    const data = (await response.json()) as { valid: boolean; resolved?: string; error?: string };
    if (projectFormWorkingDirectory.trim() === trimmed) {
      projectFormWorkingDirectoryValid = data.valid;
      projectFormWorkingDirectoryError = data.error ?? "";
      if (data.valid && data.resolved) {
        projectFormWorkingDirectory = data.resolved;
      }
    }
  } catch {
    if (projectFormWorkingDirectory.trim() === trimmed) {
      projectFormWorkingDirectoryValid = false;
      projectFormWorkingDirectoryError = "Could not validate path.";
    }
  }
}

async function submitProjectForm(): Promise<void> {
  const name = projectFormName.trim();
  const key = normalizeProjectKey(projectFormKey || projectFormName);
  const description = projectFormDescription.trim();
  const workingDirectory = projectFormWorkingDirectory.trim();

  if (!name || !key) {
    projectFormError = "Project name and key are required.";
    renderApp();
    return;
  }
  if (!description) {
    projectFormError = "Project description is required.";
    renderApp();
    return;
  }
  if (!workingDirectory) {
    projectFormError = "Project working directory is required.";
    renderApp();
    return;
  }

  projectFormSubmitting = true;
  projectFormError = "";
  renderApp();

  try {
    const response = await createProjectRequest({ key, name, description, workingDirectory });
    const body = await response.json();

    if (!response.ok) {
      const err = body as { message?: string };
      throw new Error(err?.message ?? `Project create request failed with status ${response.status}.`);
    }

    const project = projectRecordSchema.parse(body);
    projectFormSubmitting = false;
    projectFormName = "";
    projectFormKey = "";
    projectFormDescription = "";
    projectFormWorkingDirectory = "";
    projectFormWorkingDirectoryValid = null;
    projectFormWorkingDirectoryError = "";
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
