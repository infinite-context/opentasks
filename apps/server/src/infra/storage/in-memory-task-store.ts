import { randomUUID } from "node:crypto";
import type { Logger } from "../logging";
import { pathsEqual } from "../path-utils";
import { resolveProjectFromRef } from "./project-ref-resolver";
import type {
  ClaimedTask,
  CreateGoalInput,
  CreateProjectInput,
  CreateTaskInput,
  GoalRecord,
  ProjectRecord,
  TaskClaimOptions,
  TaskCompletion,
  TaskEvent,
  TaskEventActorType,
  TaskEventType,
  TaskFailure,
  TaskQueryFilters,
  TaskRecord,
  TaskRelease,
  UpdateGoalInput,
  UpdateProjectInput
} from "@opentasks/contracts";
import type { CoordinationStore } from "./task-store";

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

function cloneProject(project: ProjectRecord): ProjectRecord {
  return { ...project };
}

function cloneGoal(goal: GoalRecord): GoalRecord {
  return {
    ...goal,
    metadata: { ...goal.metadata }
  };
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

  const project = resolveProjectFromRef(projects, projectRef);
  return project?.id ?? null;
}

function compareTaskPriority(left: TaskRecord, right: TaskRecord): number {
  const ordering = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return ordering[left.priority] - ordering[right.priority];
}

export function createInMemoryTaskStore({
  logger,
  initialTasks = []
}: CreateInMemoryTaskStoreParams): CoordinationStore {
  const projects: ProjectRecord[] = [];
  const goals: GoalRecord[] = [];
  const tasks = initialTasks.map(cloneTask);
  const events: TaskEvent[] = tasks.flatMap((task) => [
    createEvent(task, "task_created", "system", null),
    createEvent(task, "task_available", "system", null)
  ]);

  return {
    async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
      const existing = projects.find((project) => project.key === input.key);
      if (existing) {
        return cloneProject(existing);
      }

      const now = currentTimestamp();
      const project: ProjectRecord = {
        id: createLocalId("project"),
        key: input.key,
        name: input.name,
        description: input.description,
        workingDirectory: input.workingDirectory,
        createdAt: now,
        updatedAt: now
      };

      projects.push(project);
      return cloneProject(project);
    },
    async getProject(projectRef: string): Promise<ProjectRecord | null> {
      const project = resolveProjectFromRef(projects, projectRef);
      return project ? cloneProject(project) : null;
    },
    async updateProject(input: UpdateProjectInput): Promise<ProjectRecord | null> {
      const project = resolveProjectFromRef(projects, input.projectId);
      if (!project) return null;
      project.description = input.description;
      project.updatedAt = currentTimestamp();
      return cloneProject(project);
    },
    async getProjectByWorkingDirectory(workingDirectory: string): Promise<ProjectRecord | null> {
      const project = projects.find(
        (candidate) => candidate.workingDirectory && pathsEqual(candidate.workingDirectory, workingDirectory)
      );
      return project ? cloneProject(project) : null;
    },
    async listProjects(limit?: number): Promise<ProjectRecord[]> {
      return projects.slice(0, limit ?? projects.length).map(cloneProject);
    },
    async createGoal(input: CreateGoalInput): Promise<GoalRecord | null> {
      const projectId = resolveProjectId(projects, input.projectId);
      if (!projectId) {
        return null;
      }

      const existing = goals.find((goal) => goal.projectId === projectId && goal.key === input.key);
      if (existing) {
        return cloneGoal(existing);
      }

      const now = currentTimestamp();
      const goal: GoalRecord = {
        id: createLocalId("goal"),
        projectId,
        key: input.key,
        name: input.name,
        description: input.description ?? "",
        status: "active",
        priority: input.priority ?? "P2",
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now
      };

      goals.push(goal);
      return cloneGoal(goal);
    },
    async updateGoal(input: UpdateGoalInput): Promise<GoalRecord | null> {
      const goal = goals.find((candidate) => candidate.id === input.goalId);
      if (!goal) {
        return null;
      }

      if (input.projectId) {
        const projectId = resolveProjectId(projects, input.projectId);
        if (!projectId || projectId !== goal.projectId) {
          return null;
        }
      }

      if (input.name !== undefined) {
        goal.name = input.name;
      }
      if (input.description !== undefined) {
        goal.description = input.description;
      }
      if (input.status !== undefined) {
        goal.status = input.status;
      }
      if (input.priority !== undefined) {
        goal.priority = input.priority;
      }
      if (input.metadata !== undefined) {
        goal.metadata = { ...input.metadata };
      }

      goal.updatedAt = currentTimestamp();
      return cloneGoal(goal);
    },
    async getGoal(goalId: string): Promise<GoalRecord | null> {
      const goal = goals.find((candidate) => candidate.id === goalId);
      return goal ? cloneGoal(goal) : null;
    },
    async listGoals(projectRef: string): Promise<GoalRecord[]> {
      const projectId = resolveProjectId(projects, projectRef);
      if (!projectId) {
        return [];
      }

      return goals
        .filter((goal) => goal.projectId === projectId)
        .sort((left, right) => {
          const priorityDiff = compareTaskPriority(
            { priority: left.priority } as TaskRecord,
            { priority: right.priority } as TaskRecord
          );
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          return left.createdAt.localeCompare(right.createdAt);
        })
        .map(cloneGoal);
    },
    async createTask(input: CreateTaskInput): Promise<TaskRecord | null> {
      const projectId = resolveProjectId(projects, input.projectId);
      if (!projectId) {
        logger.step(
          "storage:in-memory-task-store",
          `Cannot create task: project "${input.projectId}" not found.`
        );
        return null;
      }

      const goal = goals.find((candidate) => candidate.id === input.goalId && candidate.projectId === projectId);
      if (!goal) {
        logger.step(
          "storage:in-memory-task-store",
          `Cannot create task: goal "${input.goalId}" not found in project "${projectId}".`
        );
        return null;
      }

      const now = currentTimestamp();
      const task: TaskRecord = {
        id: createLocalId("task"),
        createdAt: now,
        updatedAt: now,
        projectId,
        goalId: goal.id,
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

      logger.step("storage:in-memory-task-store", `Created task "${task.id}" in goal "${goal.id}".`);
      return cloneTask(task);
    },
    async claimNextTask(projectRef, goalId, agentName, options): Promise<ClaimedTask | null> {
      logger.step(
        "storage:in-memory-task-store",
        `In-memory task store looks for the next available task in goal "${goalId}".`
      );

      const projectId = resolveProjectId(projects, projectRef);
      if (!projectId) {
        return null;
      }

      const goal = goals.find((candidate) => candidate.id === goalId && candidate.projectId === projectId);
      if (!goal || goal.status !== "active") {
        return null;
      }

      await this.requeueExpiredTasks(projectId, goalId);

      const task = tasks
        .filter((candidate) => {
          const availableAt = candidate.availableAt ? new Date(candidate.availableAt).getTime() : 0;
          return (
            candidate.projectId === projectId &&
            candidate.goalId === goalId &&
            candidate.status === "available" &&
            availableAt <= Date.now() &&
            hasSatisfiedDependencies(candidate, tasks)
          );
        })
        .sort((left, right) => {
          const priorityDiff = compareTaskPriority(left, right);
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          const availableAtDiff = (left.availableAt ?? "").localeCompare(right.availableAt ?? "");
          if (availableAtDiff !== 0) {
            return availableAtDiff;
          }
          return left.createdAt.localeCompare(right.createdAt);
        })[0];

      if (!task) {
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
    async claimTaskById(taskId, agentName, options): Promise<ClaimedTask | null> {
      logger.step(
        "storage:in-memory-task-store",
        `In-memory task store attempts to claim explicit task "${taskId}".`
      );

      const existing = tasks.find((candidate) => candidate.id === taskId);
      if (!existing) {
        return null;
      }

      const goal = goals.find(
        (candidate) => candidate.id === existing.goalId && candidate.projectId === existing.projectId
      );
      if (!goal || goal.status !== "active") {
        return null;
      }

      await this.requeueExpiredTasks(existing.projectId, goal.id);

      const task = tasks.find((candidate) => {
        const availableAt = candidate.availableAt ? new Date(candidate.availableAt).getTime() : 0;
        return (
          candidate.id === taskId &&
          candidate.projectId === existing.projectId &&
          candidate.goalId === goal.id &&
          candidate.status === "available" &&
          availableAt <= Date.now() &&
          hasSatisfiedDependencies(candidate, tasks)
        );
      });

      if (!task) {
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
    async getTaskById(taskId: string): Promise<TaskRecord | null> {
      const task = tasks.find((candidate) => candidate.id === taskId);
      return task ? cloneTask(task) : null;
    },
    async listTasks(filters?: TaskQueryFilters): Promise<TaskRecord[]> {
      const projectId = resolveProjectId(projects, filters?.projectId);

      return tasks
        .filter((task) => {
          if (filters?.projectId && !projectId) {
            return false;
          }
          if (projectId && task.projectId !== projectId) {
            return false;
          }
          if (filters?.goalId && task.goalId !== filters.goalId) {
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
    async requeueExpiredTasks(projectRef?: string, goalId?: string): Promise<number> {
      const projectId = resolveProjectId(projects, projectRef) ?? projectRef ?? null;
      let updatedCount = 0;

      for (const task of tasks) {
        const leaseExpired =
          task.leaseExpiresAt !== null && new Date(task.leaseExpiresAt).getTime() <= Date.now();
        const projectMatches = projectId ? task.projectId === projectId : true;
        const goalMatches = goalId ? task.goalId === goalId : true;

        if (projectMatches && goalMatches && leaseExpired && (task.status === "assigned" || task.status === "in_progress")) {
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
