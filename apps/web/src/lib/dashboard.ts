import type { CreateProjectInput, TaskRecord } from "@opentasks/contracts";
import type { TaskFilter } from "../types";
import { buildApiUrl } from "../utils";

export function buildFocusMessage(snapshot: { summary: { blockedTasks: number; failedTasks: number; availableTasks: number; activeAgents: number } } | null): string {
  if (!snapshot) {
    return "Loading backend task data and live coordination state.";
  }

  if (snapshot.summary.blockedTasks > 0 || snapshot.summary.failedTasks > 0) {
    return `${snapshot.summary.blockedTasks} blocked task(s) and ${snapshot.summary.failedTasks} failed task(s) need attention.`;
  }

  return `${snapshot.summary.availableTasks} task(s) are available and ${snapshot.summary.activeAgents} agent(s) are active.`;
}

export function filterTasks(tasks: TaskRecord[], filter: TaskFilter): TaskRecord[] {
  if (filter === "all") {
    return tasks;
  }

  return tasks.filter((task) => task.status === filter);
}

export function pickSelectedTaskId(tasks: TaskRecord[], currentTaskId: string): string {
  return tasks.find((task) => task.id === currentTaskId)?.id ?? tasks[0]?.id ?? "";
}

export function buildMetaUrl(): string {
  return buildApiUrl("/api/meta");
}

export function buildMcpUrl(): string {
  return buildApiUrl("/mcp");
}

export function buildValidatePathUrl(path: string): string {
  return buildApiUrl("/api/validate-path", { path });
}

export function buildFsEntriesUrl(path?: string): string {
  return buildApiUrl("/api/fs/entries", { path: path ?? "." });
}

export function buildPickFolderUrl(): string {
  return buildApiUrl("/api/fs/pick-folder");
}

export function buildProjectListUrl(limit?: number): string {
  return buildApiUrl("/api/projects", limit ? { limit: String(limit) } : undefined);
}

export function buildProjectCreateUrl(): string {
  return buildApiUrl("/api/projects");
}

export function buildGoalListUrl(projectId: string): string {
  return buildApiUrl("/api/goals", { projectId });
}

export function buildAgentsUrl(limit?: number): string {
  return buildApiUrl("/api/agents", limit ? { limit: String(limit) } : undefined);
}

export function buildMcpLogsUrl(agentDisplayName: string, limit?: number): string {
  const params: Record<string, string> = { agentDisplayName };
  if (limit) params.limit = String(limit);
  return buildApiUrl("/api/mcp-logs", params);
}

export function buildDashboardApiUrl(projectId: string): string {
  return buildApiUrl("/api/dashboard", { projectId });
}

export function buildDashboardStreamUrl(projectId: string): string {
  return buildApiUrl("/api/dashboard/stream", { projectId });
}

export function buildMemoryListUrl(projectId: string, limit?: number): string {
  return buildApiUrl("/api/memory", {
    projectId,
    ...(limit ? { limit: String(limit) } : {})
  });
}

export function buildMemorySearchUrl(projectId: string, query: string, limit?: number): string {
  return buildApiUrl("/api/memory/search", {
    projectId,
    query,
    ...(limit ? { limit: String(limit) } : {})
  });
}

export function buildTaskDetailUrl(taskId: string): string {
  return buildApiUrl(`/api/tasks/${encodeURIComponent(taskId)}`);
}

export interface TaskListQuery {
  projectId?: string;
  status?: string[];
  assignedTo?: string;
  limit?: number;
}

export function buildTaskListUrl(query: TaskListQuery): string {
  const params: Record<string, string> = {};
  if (query.projectId) params.projectId = query.projectId;
  if (query.assignedTo) params.assignedTo = query.assignedTo;
  if (query.limit) params.limit = String(query.limit);
  if (query.status && query.status.length > 0) {
    params.status = query.status.join(",");
  }
  return buildApiUrl("/api/tasks", params);
}

/** Maps TaskFilter to API status params. */
export function taskFilterToStatusParams(filter: TaskFilter): string[] | undefined {
  if (filter === "all") return undefined;
  if (filter === "blocked") return ["blocked"];
  if (filter === "in_progress") return ["assigned", "in_progress"];
  return undefined;
}

export function normalizeProjectKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createProjectRequest(input: CreateProjectInput): Promise<Response> {
  return fetch(buildProjectCreateUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}
