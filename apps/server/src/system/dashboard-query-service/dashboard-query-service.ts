import type { Logger } from "../../infra/logging";
import type { TaskStore } from "../../infra/storage/task-store";
import type {
  DashboardActivityItemDto,
  DashboardAgentStatusDto,
  DashboardHealthItemDto,
  DashboardPipelineItemDto,
  DashboardQuery,
  DashboardSnapshotDto
} from "../../shared/dtos";
import type { TaskEvent, TaskRecord, TaskStatus } from "../../shared/types";
import type { DashboardQueryService } from "./types";

interface CreateDashboardQueryServiceParams {
  logger: Logger;
  taskStore: TaskStore;
}

const PIPELINE_STATUSES: TaskStatus[] = [
  "pending",
  "available",
  "assigned",
  "in_progress",
  "blocked",
  "completed",
  "failed",
  "cancelled"
];

export function createDashboardQueryService({
  logger,
  taskStore
}: CreateDashboardQueryServiceParams): DashboardQueryService {
  return {
    async getSnapshot(query?: DashboardQuery): Promise<DashboardSnapshotDto> {
      logger.step("dashboard-query-service", "Building dashboard snapshot.");

      const [project, tasks] = await Promise.all([
        query?.projectId ? taskStore.getProject(query.projectId) : Promise.resolve(null),
        taskStore.listTasks(query?.projectId ? { projectId: query.projectId } : undefined)
      ]);

      const projectRef = project?.id ?? query?.projectId ?? tasks[0]?.projectId ?? null;
      const recentEvents = projectRef ? await taskStore.listProjectTaskEvents(projectRef, 12) : [];

      return {
        generatedAt: new Date().toISOString(),
        project,
        summary: buildSummary(tasks),
        pipeline: buildPipeline(tasks),
        tasks,
        activity: buildActivity(tasks, recentEvents),
        agents: buildAgents(tasks),
        health: buildHealth(tasks, recentEvents)
      };
    }
  };
}

function buildSummary(tasks: TaskRecord[]) {
  const assignedTasks = tasks.filter((task) => task.status === "assigned").length;
  const inProgressTasks = tasks.filter((task) => task.status === "in_progress").length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const failedTasks = tasks.filter((task) => task.status === "failed").length;

  return {
    totalTasks: tasks.length,
    availableTasks: tasks.filter((task) => task.status === "available").length,
    assignedTasks,
    inProgressTasks,
    blockedTasks,
    completedTasks,
    failedTasks,
    activeAgents: new Set(
      tasks
        .filter((task) => task.status === "assigned" || task.status === "in_progress")
        .map((task) => task.assignedTo)
        .filter((agentName): agentName is string => Boolean(agentName))
    ).size
  };
}

function buildPipeline(tasks: TaskRecord[]): DashboardPipelineItemDto[] {
  return PIPELINE_STATUSES.map((status) => ({
    status,
    count: tasks.filter((task) => task.status === status).length
  })).filter((item) => item.count > 0 || item.status === "available" || item.status === "in_progress");
}

function buildActivity(tasks: TaskRecord[], events: TaskEvent[]): DashboardActivityItemDto[] {
  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));

  return events.map((event) => ({
    taskId: event.taskId,
    taskTitle: taskTitles.get(event.taskId) ?? null,
    event
  }));
}

function buildAgents(tasks: TaskRecord[]): DashboardAgentStatusDto[] {
  const agentMap = new Map<string, DashboardAgentStatusDto>();

  for (const task of tasks) {
    if (!task.assignedTo) {
      continue;
    }

    const current = agentMap.get(task.assignedTo) ?? {
      agentName: task.assignedTo,
      assignedTasks: 0,
      inProgressTasks: 0,
      completedTasks: 0,
      failedTasks: 0
    };

    if (task.status === "assigned") {
      current.assignedTasks += 1;
    }

    if (task.status === "in_progress") {
      current.inProgressTasks += 1;
    }

    if (task.status === "completed") {
      current.completedTasks += 1;
    }

    if (task.status === "failed") {
      current.failedTasks += 1;
    }

    agentMap.set(task.assignedTo, current);
  }

  return [...agentMap.values()].sort((left, right) => left.agentName.localeCompare(right.agentName));
}

function buildHealth(tasks: TaskRecord[], events: TaskEvent[]): DashboardHealthItemDto[] {
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const failedTasks = tasks.filter((task) => task.status === "failed").length;
  const recentHeartbeat = events.some((event) => event.eventType === "task_heartbeat");

  return [
    {
      name: "MCP server",
      state: "healthy",
      detail: "Task lifecycle transport is running."
    },
    {
      name: "Task coordination",
      state: blockedTasks > 0 ? "warning" : "healthy",
      detail:
        blockedTasks > 0
          ? `${blockedTasks} blocked task(s) need attention.`
          : "No blocked tasks in the current project view."
    },
    {
      name: "Agent leases",
      state: recentHeartbeat ? "healthy" : "degraded",
      detail: recentHeartbeat
        ? "Recent task heartbeats observed."
        : "No recent lease heartbeats observed."
    },
    {
      name: "Task failures",
      state: failedTasks > 0 ? "warning" : "healthy",
      detail:
        failedTasks > 0
          ? `${failedTasks} task(s) are currently marked failed.`
          : "No failed tasks in the current project view."
    }
  ];
}
