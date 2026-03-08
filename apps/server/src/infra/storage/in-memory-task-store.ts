import { randomUUID } from "node:crypto";
import type { Logger } from "../logging";
import type {
  ClaimedTask,
  ProjectRecord,
  TaskEvent,
  TaskEventActorType,
  TaskEventType,
  TaskRecord
} from "@opentasks/contracts";
import type {
  CreateTaskInput,
  TaskClaimOptions,
  TaskCompletion,
  TaskFailure,
  TaskQueryFilters,
  TaskRelease
} from "@opentasks/contracts";
import type { TaskStore } from "./task-store";

interface CreateInMemoryTaskStoreParams {
  logger: Logger;
  initialTasks?: TaskRecord[];
}

function currentTimestamp(): string {
  return new Date().toISOString();
}

function createLocalId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function createProject(key: string, name: string): ProjectRecord {
  const now = currentTimestamp();

  return {
    id: createLocalId("project"),
    key,
    name,
    createdAt: now,
    updatedAt: now
  };
}

const demoProject = createProject("demo-project", "Demo Project");
const otherProject = createProject("other-project", "Other Project");
const defaultProjects: ProjectRecord[] = [demoProject, otherProject];

function createTask(
  projectId: string,
  title: string,
  overrides: Partial<TaskRecord> = {}
): TaskRecord {
  const now = currentTimestamp();

  return {
    id: createLocalId("task"),
    createdAt: now,
    updatedAt: now,
    projectId,
    title,
    description: "",
    status: "available",
    priority: "P2",
    availableAt: now,
    assignedTo: null,
    assignedAt: null,
    leaseExpiresAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    blockedReason: null,
    lastError: null,
    source: "seeded",
    metadata: {},
    dependencyIds: [],
    ...overrides
  };
}

const seededPrimaryTask = createTask(demoProject.id, "Hydrate the next task with reusable context", {
  priority: "P0",
  description: "Seeded task used by the current execution path."
});

const seededDependentTask = createTask(demoProject.id, "Prepare a follow-up task for the same project", {
  priority: "P1",
  dependencyIds: [seededPrimaryTask.id]
});

const seededOtherProjectTask = createTask(otherProject.id, "Unrelated task for another project", {
  priority: "P2"
});

const defaultTasks: TaskRecord[] = [seededPrimaryTask, seededDependentTask, seededOtherProjectTask];

function cloneProject(project: ProjectRecord): ProjectRecord {
  return { ...project };
}

function cloneTask(task: TaskRecord): TaskRecord {
  return {
    ...task,
    metadata: { ...task.metadata },
    dependencyIds: [...task.dependencyIds]
  };
}

function cloneEvent(event: TaskEvent): TaskEvent {
  return {
    ...event,
    payload: { ...event.payload }
  };
}

function createEvent(
  task: TaskRecord,
  eventType: TaskEventType,
  actorType: TaskEventActorType,
  actorId: string | null,
  payload: Record<string, unknown> = {}
): TaskEvent {
  return {
    id: createLocalId("task_event"),
    taskId: task.id,
    projectId: task.projectId,
    eventType,
    actorType,
    actorId,
    payload,
    createdAt: currentTimestamp()
  };
}

function hasSatisfiedDependencies(task: TaskRecord, tasks: TaskRecord[]): boolean {
  return task.dependencyIds.every((dependencyId) => {
    const dependency = tasks.find((candidate) => candidate.id === dependencyId);
    return dependency?.status === "completed";
  });
}

function resolveProjectId(projects: ProjectRecord[], projectRef?: string): string | null {
  if (!projectRef) {
    return null;
  }

  const project = projects.find((candidate) => candidate.id === projectRef || candidate.key === projectRef);
  return project?.id ?? null;
}

export function createInMemoryTaskStore({
  logger,
  initialTasks = defaultTasks
}: CreateInMemoryTaskStoreParams): TaskStore {
  const projects = defaultProjects.map(cloneProject);
  const tasks = initialTasks.map(cloneTask);
  const events: TaskEvent[] = [
    createEvent(tasks[0], "task_created", "system", null),
    createEvent(tasks[0], "task_available", "system", null),
    createEvent(tasks[1], "task_created", "system", null),
    createEvent(tasks[1], "task_available", "system", null),
    createEvent(tasks[2], "task_created", "system", null),
    createEvent(tasks[2], "task_available", "system", null)
  ];

  return {
    async createTask(input: CreateTaskInput): Promise<TaskRecord | null> {
      const projectId = resolveProjectId(projects, input.projectId);
      if (!projectId) {
        logger.step(
          "storage:in-memory-task-store",
          `Cannot create task: project "${input.projectId}" not found.`
        );
        return null;
      }

      const now = currentTimestamp();
      const task: TaskRecord = {
        id: createLocalId("task"),
        createdAt: now,
        updatedAt: now,
        projectId,
        title: input.title,
        description: input.description ?? "",
        status: "available",
        priority: input.priority ?? "P2",
        availableAt: now,
        assignedTo: null,
        assignedAt: null,
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        blockedReason: null,
        lastError: null,
        source: "manual",
        metadata: {},
        dependencyIds: input.dependencyIds ?? []
      };

      tasks.push(task);
      events.push(createEvent(task, "task_created", "system", null));
      events.push(createEvent(task, "task_available", "system", null));

      logger.step("storage:in-memory-task-store", `Created task "${task.id}" in project "${input.projectId}".`);
      return cloneTask(task);
    },
    async claimNextTask(projectRef, agentName, options): Promise<ClaimedTask | null> {
      logger.step(
        "storage:in-memory-task-store",
        `In-memory task store looks for the next available task in project "${projectRef}".`
      );

      const projectId = resolveProjectId(projects, projectRef);
      if (!projectId) {
        return null;
      }

      await this.requeueExpiredTasks(projectId);

      const task = tasks.find(
        (candidate) =>
          candidate.projectId === projectId &&
          candidate.status === "available" &&
          hasSatisfiedDependencies(candidate, tasks)
      );

      if (!task) {
        logger.step(
          "storage:in-memory-task-store",
          `In-memory task store found no available task for project "${projectRef}".`
        );
        return null;
      }

      const updatedAt = currentTimestamp();
      task.status = "assigned";
      task.assignedTo = agentName;
      task.assignedAt = updatedAt;
      task.leaseExpiresAt = new Date(Date.now() + options.leaseDurationSeconds * 1000).toISOString();
      task.updatedAt = updatedAt;
      task.blockedReason = null;
      task.lastError = null;

      events.push(
        createEvent(task, "task_claimed", "agent", agentName, {
          taskHint: options.taskHint ?? null,
          capabilities: options.capabilities ?? [],
          leaseDurationSeconds: options.leaseDurationSeconds
        })
      );

      return cloneTask(task) as ClaimedTask;
    },
    async getProject(projectRef: string): Promise<ProjectRecord | null> {
      const project = projects.find((candidate) => candidate.id === projectRef || candidate.key === projectRef);
      return project ? cloneProject(project) : null;
    },
    async getTaskById(taskId: string): Promise<TaskRecord | null> {
      const task = tasks.find((candidate) => candidate.id === taskId);
      return task ? cloneTask(task) : null;
    },
    async listTasks(filters?: TaskQueryFilters): Promise<TaskRecord[]> {
      const projectId = resolveProjectId(projects, filters?.projectId);

      return tasks
        .filter((task) => {
          if (filters?.projectId && projectId && task.projectId !== projectId) {
            return false;
          }

          if (filters?.projectId && !projectId) {
            return false;
          }

          if (filters?.assignedTo && task.assignedTo !== filters.assignedTo) {
            return false;
          }

          if (filters?.status && !filters.status.includes(task.status)) {
            return false;
          }

          return true;
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, filters?.limit ?? tasks.length)
        .map(cloneTask);
    },
    async markTaskInProgress(taskId: string, agentName: string): Promise<TaskRecord | null> {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.assignedTo !== agentName || (task.status !== "assigned" && task.status !== "in_progress")) {
        return null;
      }

      task.status = "in_progress";
      task.startedAt ??= currentTimestamp();
      task.updatedAt = currentTimestamp();
      events.push(createEvent(task, "task_started", "agent", agentName));
      return cloneTask(task);
    },
    async completeTask(taskId: string, agentName: string, completion: TaskCompletion): Promise<TaskRecord | null> {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.assignedTo !== agentName) {
        return null;
      }

      task.status = "completed";
      task.completedAt = currentTimestamp();
      task.updatedAt = task.completedAt;
      task.leaseExpiresAt = null;
      task.blockedReason = null;
      task.lastError = null;
      task.metadata = {
        ...task.metadata,
        completionSummary: completion.summary,
        completionMetadata: completion.metadata ?? {}
      };

      events.push(
        createEvent(task, "task_completed", "agent", agentName, {
          summary: completion.summary,
          metadata: completion.metadata ?? {}
        })
      );

      return cloneTask(task);
    },
    async failTask(taskId: string, agentName: string, failure: TaskFailure): Promise<TaskRecord | null> {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.assignedTo !== agentName) {
        return null;
      }

      task.status = "failed";
      task.failedAt = currentTimestamp();
      task.updatedAt = task.failedAt;
      task.leaseExpiresAt = null;
      task.lastError = failure.error;
      task.metadata = {
        ...task.metadata,
        failureMetadata: failure.metadata ?? {}
      };

      events.push(
        createEvent(task, "task_failed", "agent", agentName, {
          error: failure.error,
          metadata: failure.metadata ?? {}
        })
      );

      return cloneTask(task);
    },
    async releaseTask(taskId: string, agentName: string, release: TaskRelease): Promise<TaskRecord | null> {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.assignedTo !== agentName) {
        return null;
      }

      task.status = "available";
      task.assignedTo = null;
      task.assignedAt = null;
      task.leaseExpiresAt = null;
      task.startedAt = null;
      task.updatedAt = currentTimestamp();
      task.availableAt = task.updatedAt;
      task.lastError = release.reason;

      events.push(
        createEvent(task, "task_released", "agent", agentName, {
          reason: release.reason,
          metadata: release.metadata ?? {}
        })
      );

      return cloneTask(task);
    },
    async renewTaskLease(taskId: string, agentName: string, leaseDurationSeconds: number): Promise<TaskRecord | null> {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.assignedTo !== agentName || !task.leaseExpiresAt) {
        return null;
      }

      task.leaseExpiresAt = new Date(Date.now() + leaseDurationSeconds * 1000).toISOString();
      task.updatedAt = currentTimestamp();
      events.push(
        createEvent(task, "task_heartbeat", "agent", agentName, {
          leaseDurationSeconds
        })
      );

      return cloneTask(task);
    },
    async requeueExpiredTasks(projectRef?: string): Promise<number> {
      const projectId = resolveProjectId(projects, projectRef) ?? projectRef ?? null;
      let updatedCount = 0;

      for (const task of tasks) {
        const leaseExpired =
          task.leaseExpiresAt !== null && new Date(task.leaseExpiresAt).getTime() <= Date.now();
        const projectMatches = projectId ? task.projectId === projectId : true;

        if (projectMatches && leaseExpired && (task.status === "assigned" || task.status === "in_progress")) {
          task.status = "available";
          task.assignedTo = null;
          task.assignedAt = null;
          task.leaseExpiresAt = null;
          task.startedAt = null;
          task.updatedAt = currentTimestamp();
          task.availableAt = task.updatedAt;
          events.push(createEvent(task, "task_requeued", "system", null));
          updatedCount += 1;
        }
      }

      return updatedCount;
    },
    async listTaskEvents(taskId: string): Promise<TaskEvent[]> {
      return events.filter((event) => event.taskId === taskId).map(cloneEvent);
    },
    async listProjectTaskEvents(projectRef: string, limit = 20): Promise<TaskEvent[]> {
      const projectId = resolveProjectId(projects, projectRef);
      if (!projectId) {
        return [];
      }

      return events
        .filter((event) => event.projectId === projectId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit)
        .map(cloneEvent);
    }
  };
}
