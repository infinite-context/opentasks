import type { Logger } from "../logging";
import type {
  ClaimedTask,
  CreateGoalInput,
  CreateProjectInput,
  GoalRecord,
  ProjectRecord,
  TaskEvent,
  TaskEventActorType,
  TaskEventType,
  TaskPriority,
  TaskRecord,
  TaskSource,
  TaskStatus
} from "@opentasks/contracts";
import type {
  CreateTaskInput,
  TaskClaimOptions,
  TaskCompletion,
  TaskFailure,
  TaskQueryFilters,
  TaskRelease,
  UpdateGoalInput
} from "@opentasks/contracts";
import type { CoordinationStore } from "./task-store";
import type { Database } from "better-sqlite3";
import { generateId } from "./sqlite-schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, or, and, lte, asc, desc, inArray, sql } from "drizzle-orm";
import * as schema from "./schema";

interface CreateSqliteTaskDatabaseParams {
  logger: Logger;
  db: Database;
}

export function createSqliteTaskDatabase({
  logger,
  db: sqliteDb
}: CreateSqliteTaskDatabaseParams): CoordinationStore {
  const db = drizzle(sqliteDb, { schema });

  return {
    async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
      const existing = getProjectByIdOrKeyFromDb(db, input.key);
      if (existing) {
        return existing;
      }

      const projectId = generateId("project");
      db.insert(schema.projects).values({
        id: projectId,
        key: input.key,
        name: input.name,
        description: input.description,
        workingDirectory: input.workingDirectory
      }).run();

      return getProjectByIdOrKeyFromDb(db, projectId)!;
    },
    async getProject(projectId: string): Promise<ProjectRecord | null> {
      return getProjectByIdOrKeyFromDb(db, projectId);
    },
    async listProjects(limit = 100): Promise<ProjectRecord[]> {
      return db.select()
        .from(schema.projects)
        .orderBy(asc(schema.projects.createdAt))
        .limit(limit)
        .all()
        .map(mapProjectRow);
    },
    async createGoal(input: CreateGoalInput): Promise<GoalRecord | null> {
      return sqliteDb.transaction(() => {
        const project = getProjectByIdOrKeyFromDb(db, input.projectId);
        if (!project) {
          return null;
        }

        const existing = getGoalByProjectAndKeyFromDb(db, project.id, input.key);
        if (existing) {
          return existing;
        }

        const goalId = generateId("goal");
        db.insert(schema.goals).values({
          id: goalId,
          projectId: project.id,
          key: input.key,
          name: input.name,
          description: input.description ?? "",
          status: "active",
          priority: input.priority ?? "P2",
          metadataJson: JSON.stringify(input.metadata ?? {})
        }).run();

        return getGoalByIdFromDb(db, goalId);
      })();
    },
    async updateGoal(input: UpdateGoalInput): Promise<GoalRecord | null> {
      return sqliteDb.transaction(() => {
        const goal = getGoalByIdFromDb(db, input.goalId);
        if (!goal) {
          return null;
        }

        if (input.projectId) {
          const projectId = resolveProjectIdFromDb(db, input.projectId);
          if (!projectId || projectId !== goal.projectId) {
            return null;
          }
        }

        const values: Partial<typeof schema.goals.$inferInsert> = {
          updatedAt: sql`datetime('now')` as unknown as string
        };

        if (input.name !== undefined) {
          values.name = input.name;
        }
        if (input.description !== undefined) {
          values.description = input.description;
        }
        if (input.status !== undefined) {
          values.status = input.status;
        }
        if (input.priority !== undefined) {
          values.priority = input.priority;
        }
        if (input.metadata !== undefined) {
          values.metadataJson = JSON.stringify(input.metadata);
        }

        db.update(schema.goals)
          .set(values)
          .where(eq(schema.goals.id, input.goalId))
          .run();

        return getGoalByIdFromDb(db, input.goalId);
      })();
    },
    async getGoal(goalId: string): Promise<GoalRecord | null> {
      return getGoalByIdFromDb(db, goalId);
    },
    async listGoals(projectId: string): Promise<GoalRecord[]> {
      const resolvedProjectId = resolveProjectIdFromDb(db, projectId);
      if (!resolvedProjectId) {
        return [];
      }

      return db.select()
        .from(schema.goals)
        .where(eq(schema.goals.projectId, resolvedProjectId))
        .orderBy(ascGoalPrioritySql(schema.goals.priority), asc(schema.goals.createdAt))
        .all()
        .map(mapGoalRow);
    },
    async createTask(input: CreateTaskInput): Promise<TaskRecord | null> {
      return sqliteDb.transaction(() => {
        const project = getProjectByIdOrKeyFromDb(db, input.projectId);
        if (!project) {
          logger.step(
            "storage:sqlite-task-db",
            `Cannot create task: project "${input.projectId}" not found.`
          );
          return null;
        }

        const goal = getGoalByIdFromDb(db, input.goalId);
        if (!goal || goal.projectId !== project.id) {
          logger.step(
            "storage:sqlite-task-db",
            `Cannot create task: goal "${input.goalId}" not found in project "${project.id}".`
          );
          return null;
        }

        const taskId = generateId("task");

        db.insert(schema.tasks).values({
          id: taskId,
          projectId: project.id,
          goalId: goal.id,
          title: input.title,
          description: input.description ?? "",
          status: 'available',
          priority: input.priority ?? "P2",
          availableAt: sql`datetime('now')`,
          source: 'manual',
        }).run();

        const dependencyIds = input.dependencyIds ?? [];
        if (dependencyIds.length > 0) {
          const depValues = dependencyIds.map(depId => ({
            taskId,
            dependsOnTaskId: depId
          }));
          db.insert(schema.taskDependencies).values(depValues).onConflictDoNothing().run();
        }

        insertTaskEvent(db, {
          taskId,
          projectId: project.id,
          eventType: "task_created",
          actorType: "system",
          actorId: null,
          payload: {}
        });
        insertTaskEvent(db, {
          taskId,
          projectId: project.id,
          eventType: "task_available",
          actorType: "system",
          actorId: null,
          payload: {}
        });

        logger.step(
          "storage:sqlite-task-db",
          `Created task "${taskId}" in goal "${goal.id}".`
        );

        return getTaskByIdFromDb(db, taskId);
      })();
    },
    async claimNextTask(
      projectId: string,
      goalId: string,
      agentName: string,
      options: TaskClaimOptions
    ): Promise<ClaimedTask | null> {
      logger.step(
        "storage:sqlite-task-db",
        `SQLite task store looks for the next available task in goal "${goalId}".`
      );

      return sqliteDb.transaction(() => {
        const resolvedProjectId = resolveProjectIdFromDb(db, projectId);
        if (!resolvedProjectId) {
          return null;
        }

        const goal = getGoalByIdFromDb(db, goalId);
        if (!goal || goal.projectId !== resolvedProjectId || goal.status !== "active") {
          return null;
        }

        requeueExpiredTasksInTransaction(db, resolvedProjectId, goal.id);

        const candidateRaw = sqliteDb.prepare(`
          SELECT t.id
          FROM tasks t
          WHERE t.project_id = ?
            AND t.goal_id = ?
            AND t.status = 'available'
            AND (t.available_at IS NULL OR t.available_at <= datetime('now'))
            AND NOT EXISTS (
              SELECT 1
              FROM task_dependencies td
              JOIN tasks dep ON dep.id = td.depends_on_task_id
              WHERE td.task_id = t.id
                AND dep.status <> 'completed'
            )
          ORDER BY
            CASE t.priority
              WHEN 'P0' THEN 0
              WHEN 'P1' THEN 1
              WHEN 'P2' THEN 2
              ELSE 3
            END,
            t.available_at ASC,
            t.created_at ASC
          LIMIT 1
        `).get(resolvedProjectId, goal.id) as { id: string } | undefined;

        if (!candidateRaw) {
          return null;
        }

        db.update(schema.tasks)
          .set({
            status: 'assigned',
            assignedTo: agentName,
            assignedAt: sql`datetime('now')`,
            leaseExpiresAt: sql`datetime('now', '+' || ${options.leaseDurationSeconds} || ' seconds')`,
            updatedAt: sql`datetime('now')`,
            blockedReason: null,
            lastError: null
          })
          .where(eq(schema.tasks.id, candidateRaw.id))
          .run();

        insertTaskEvent(db, {
          taskId: candidateRaw.id,
          projectId: resolvedProjectId,
          eventType: "task_claimed",
          actorType: "agent",
          actorId: agentName,
          payload: {
            taskHint: options.taskHint ?? null,
            capabilities: options.capabilities ?? [],
            leaseDurationSeconds: options.leaseDurationSeconds
          }
        });

        return getTaskByIdFromDb(db, candidateRaw.id) as ClaimedTask | null;
      })();
    },
    async claimTaskById(
      taskId: string,
      agentName: string,
      options: TaskClaimOptions
    ): Promise<ClaimedTask | null> {
      logger.step(
        "storage:sqlite-task-db",
        `SQLite task store attempts to claim explicit task "${taskId}".`
      );

      return sqliteDb.transaction(() => {
        const task = getTaskByIdFromDb(db, taskId);
        if (!task) {
          return null;
        }

        const goal = getGoalByIdFromDb(db, task.goalId);
        if (!goal || goal.projectId !== task.projectId || goal.status !== "active") {
          return null;
        }

        requeueExpiredTasksInTransaction(db, task.projectId, goal.id);

        const candidateRaw = sqliteDb.prepare(`
          SELECT t.id
          FROM tasks t
          WHERE t.id = ?
            AND t.project_id = ?
            AND t.goal_id = ?
            AND t.status = 'available'
            AND (t.available_at IS NULL OR t.available_at <= datetime('now'))
            AND NOT EXISTS (
              SELECT 1
              FROM task_dependencies td
              JOIN tasks dep ON dep.id = td.depends_on_task_id
              WHERE td.task_id = t.id
                AND dep.status <> 'completed'
            )
          LIMIT 1
        `).get(taskId, task.projectId, goal.id) as { id: string } | undefined;

        if (!candidateRaw) {
          return null;
        }

        db.update(schema.tasks)
          .set({
            status: 'assigned',
            assignedTo: agentName,
            assignedAt: sql`datetime('now')`,
            leaseExpiresAt: sql`datetime('now', '+' || ${options.leaseDurationSeconds} || ' seconds')`,
            updatedAt: sql`datetime('now')`,
            blockedReason: null,
            lastError: null
          })
          .where(eq(schema.tasks.id, candidateRaw.id))
          .run();

        insertTaskEvent(db, {
          taskId: candidateRaw.id,
          projectId: task.projectId,
          eventType: "task_claimed",
          actorType: "agent",
          actorId: agentName,
          payload: {
            taskHint: options.taskHint ?? null,
            capabilities: options.capabilities ?? [],
            leaseDurationSeconds: options.leaseDurationSeconds
          }
        });

        return getTaskByIdFromDb(db, candidateRaw.id) as ClaimedTask | null;
      })();
    },
    async getTaskById(taskId: string): Promise<TaskRecord | null> {
      return getTaskByIdFromDb(db, taskId);
    },
    async listTasks(filters?: TaskQueryFilters): Promise<TaskRecord[]> {
      const conditions = [];
      const projectId = filters?.projectId ? resolveProjectIdFromDb(db, filters.projectId) : null;

      if (filters?.projectId) {
        if (!projectId) return [];
        conditions.push(eq(schema.tasks.projectId, projectId));
      }

      if (filters?.goalId) {
        conditions.push(eq(schema.tasks.goalId, filters.goalId));
      }

      if (filters?.assignedTo) {
        conditions.push(eq(schema.tasks.assignedTo, filters.assignedTo));
      }

      if (filters?.status && filters.status.length > 0) {
        conditions.push(inArray(schema.tasks.status, filters.status));
      }

      let query = db.select({
        task: schema.tasks,
        dependencyIds: sql<string>`COALESCE((SELECT json_group_array(td.depends_on_task_id) FROM task_dependencies td WHERE td.task_id = tasks.id), '[]')`
      })
      .from(schema.tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.tasks.updatedAt))
      .$dynamic();

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const rows = query.all();
      return rows.map(row => mapTaskRow(row.task, row.dependencyIds));
    },
    async markTaskInProgress(taskId: string, agentName: string): Promise<TaskRecord | null> {
      return sqliteDb.transaction(() => {
        const result = db.update(schema.tasks)
          .set({
            status: 'in_progress',
            startedAt: sql`COALESCE(started_at, datetime('now'))`,
            updatedAt: sql`datetime('now')`
          })
          .where(and(
            eq(schema.tasks.id, taskId),
            eq(schema.tasks.assignedTo, agentName),
            inArray(schema.tasks.status, ['assigned', 'in_progress'])
          ))
          .returning({ id: schema.tasks.id, projectId: schema.tasks.projectId })
          .get();

        if (!result) return null;

        insertTaskEvent(db, {
          taskId,
          projectId: result.projectId,
          eventType: "task_started",
          actorType: "agent",
          actorId: agentName,
          payload: {}
        });

        return getTaskByIdFromDb(db, taskId);
      })();
    },
    async completeTask(
      taskId: string,
      agentName: string,
      completion: TaskCompletion
    ): Promise<TaskRecord | null> {
      return sqliteDb.transaction(() => {
        const payload = JSON.stringify({
          completionSummary: completion.summary,
          completionMetadata: completion.metadata ?? {}
        });

        const result = db.update(schema.tasks)
          .set({
            status: 'completed',
            completedAt: sql`datetime('now')`,
            updatedAt: sql`datetime('now')`,
            leaseExpiresAt: null,
            blockedReason: null,
            lastError: null,
            metadataJson: sql`json_patch(metadata_json, ${payload})`
          })
          .where(and(
            eq(schema.tasks.id, taskId),
            eq(schema.tasks.assignedTo, agentName),
            inArray(schema.tasks.status, ['assigned', 'in_progress'])
          ))
          .returning({ id: schema.tasks.id, projectId: schema.tasks.projectId })
          .get();

        if (!result) return null;

        insertTaskEvent(db, {
          taskId,
          projectId: result.projectId,
          eventType: "task_completed",
          actorType: "agent",
          actorId: agentName,
          payload: {
            summary: completion.summary,
            metadata: completion.metadata ?? {}
          }
        });

        return getTaskByIdFromDb(db, taskId);
      })();
    },
    async failTask(taskId: string, agentName: string, failure: TaskFailure): Promise<TaskRecord | null> {
      return sqliteDb.transaction(() => {
        const payload = JSON.stringify({
          failureMetadata: failure.metadata ?? {}
        });

        const result = db.update(schema.tasks)
          .set({
            status: 'failed',
            failedAt: sql`datetime('now')`,
            updatedAt: sql`datetime('now')`,
            leaseExpiresAt: null,
            lastError: failure.error,
            metadataJson: sql`json_patch(metadata_json, ${payload})`
          })
          .where(and(
            eq(schema.tasks.id, taskId),
            eq(schema.tasks.assignedTo, agentName),
            inArray(schema.tasks.status, ['assigned', 'in_progress'])
          ))
          .returning({ id: schema.tasks.id, projectId: schema.tasks.projectId })
          .get();

        if (!result) return null;

        insertTaskEvent(db, {
          taskId,
          projectId: result.projectId,
          eventType: "task_failed",
          actorType: "agent",
          actorId: agentName,
          payload: {
            error: failure.error,
            metadata: failure.metadata ?? {}
          }
        });

        return getTaskByIdFromDb(db, taskId);
      })();
    },
    async releaseTask(taskId: string, agentName: string, release: TaskRelease): Promise<TaskRecord | null> {
      return sqliteDb.transaction(() => {
        const result = db.update(schema.tasks)
          .set({
            status: 'available',
            assignedTo: null,
            assignedAt: null,
            leaseExpiresAt: null,
            startedAt: null,
            updatedAt: sql`datetime('now')`,
            availableAt: sql`datetime('now')`,
            lastError: release.reason
          })
          .where(and(
            eq(schema.tasks.id, taskId),
            eq(schema.tasks.assignedTo, agentName),
            inArray(schema.tasks.status, ['assigned', 'in_progress'])
          ))
          .returning({ id: schema.tasks.id, projectId: schema.tasks.projectId })
          .get();

        if (!result) return null;

        insertTaskEvent(db, {
          taskId,
          projectId: result.projectId,
          eventType: "task_released",
          actorType: "agent",
          actorId: agentName,
          payload: {
            reason: release.reason,
            metadata: release.metadata ?? {}
          }
        });

        return getTaskByIdFromDb(db, taskId);
      })();
    },
    async renewTaskLease(
      taskId: string,
      agentName: string,
      leaseDurationSeconds: number
    ): Promise<TaskRecord | null> {
      return sqliteDb.transaction(() => {
        const result = db.update(schema.tasks)
          .set({
            leaseExpiresAt: sql`datetime('now', '+' || ${leaseDurationSeconds} || ' seconds')`,
            updatedAt: sql`datetime('now')`
          })
          .where(and(
            eq(schema.tasks.id, taskId),
            eq(schema.tasks.assignedTo, agentName),
            inArray(schema.tasks.status, ['assigned', 'in_progress'])
          ))
          .returning({ id: schema.tasks.id, projectId: schema.tasks.projectId })
          .get();

        if (!result) return null;

        insertTaskEvent(db, {
          taskId,
          projectId: result.projectId,
          eventType: "task_heartbeat",
          actorType: "agent",
          actorId: agentName,
          payload: {
            leaseDurationSeconds
          }
        });

        return getTaskByIdFromDb(db, taskId);
      })();
    },
    async requeueExpiredTasks(projectId?: string, goalId?: string): Promise<number> {
      return sqliteDb.transaction(() => {
        const resolvedProjectId = projectId ? resolveProjectIdFromDb(db, projectId) : undefined;
        return requeueExpiredTasksInTransaction(db, resolvedProjectId ?? undefined, goalId);
      })();
    },
    async listTaskEvents(taskId: string): Promise<TaskEvent[]> {
      const rows = db.select()
        .from(schema.taskEvents)
        .where(eq(schema.taskEvents.taskId, taskId))
        .orderBy(asc(schema.taskEvents.createdAt))
        .all();

      return rows.map(row => ({
        id: row.id,
        taskId: row.taskId,
        projectId: row.projectId,
        eventType: row.eventType as TaskEventType,
        actorType: row.actorType as TaskEventActorType,
        actorId: row.actorId,
        payload: JSON.parse(row.payloadJson),
        createdAt: row.createdAt
      }));
    },
    async listProjectTaskEvents(projectId: string, limit = 20): Promise<TaskEvent[]> {
      const resolvedProjectId = resolveProjectIdFromDb(db, projectId);
      if (!resolvedProjectId) return [];

      const rows = db.select()
        .from(schema.taskEvents)
        .where(eq(schema.taskEvents.projectId, resolvedProjectId))
        .orderBy(desc(schema.taskEvents.createdAt))
        .limit(limit)
        .all();

      return rows.map(row => ({
        id: row.id,
        taskId: row.taskId,
        projectId: row.projectId,
        eventType: row.eventType as TaskEventType,
        actorType: row.actorType as TaskEventActorType,
        actorId: row.actorId,
        payload: JSON.parse(row.payloadJson),
        createdAt: row.createdAt
      }));
    }
  };
}

function getTaskByIdFromDb(db: any, taskId: string): TaskRecord | null {
  const row = db.select({
    task: schema.tasks,
    dependencyIds: sql<string>`COALESCE((SELECT json_group_array(td.depends_on_task_id) FROM task_dependencies td WHERE td.task_id = tasks.id), '[]')`
  })
  .from(schema.tasks)
  .where(eq(schema.tasks.id, taskId))
  .get();

  return row ? mapTaskRow(row.task, row.dependencyIds) : null;
}

function getGoalByIdFromDb(db: any, goalId: string): GoalRecord | null {
  const row = db.select()
    .from(schema.goals)
    .where(eq(schema.goals.id, goalId))
    .limit(1)
    .get();

  return row ? mapGoalRow(row) : null;
}

function getGoalByProjectAndKeyFromDb(db: any, projectId: string, goalKey: string): GoalRecord | null {
  const row = db.select()
    .from(schema.goals)
    .where(and(eq(schema.goals.projectId, projectId), eq(schema.goals.key, goalKey)))
    .limit(1)
    .get();

  return row ? mapGoalRow(row) : null;
}

function resolveProjectIdFromDb(db: any, projectRef: string): string | null {
  const project = getProjectByIdOrKeyFromDb(db, projectRef);
  return project?.id ?? null;
}

function getProjectByIdOrKeyFromDb(db: any, projectRef: string): ProjectRecord | null {
  const row = db.select()
    .from(schema.projects)
    .where(or(eq(schema.projects.id, projectRef), eq(schema.projects.key, projectRef)))
    .limit(1)
    .get();

  if (!row) return null;

  return mapProjectRow(row);
}

function mapProjectRow(row: any): ProjectRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description ?? "",
    workingDirectory: row.workingDirectory ?? "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapGoalRow(row: any): GoalRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    metadata: JSON.parse(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapTaskRow(row: any, dependencyIdsJson: string): TaskRecord {
  const deps = dependencyIdsJson ? JSON.parse(dependencyIdsJson) : [];
  
  return {
    id: row.id,
    projectId: row.projectId,
    goalId: row.goalId,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    availableAt: row.availableAt ?? null,
    assignedTo: row.assignedTo,
    assignedAt: row.assignedAt ?? null,
    leaseExpiresAt: row.leaseExpiresAt ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    failedAt: row.failedAt ?? null,
    blockedReason: row.blockedReason,
    lastError: row.lastError,
    source: row.source as TaskSource,
    metadata: JSON.parse(row.metadataJson),
    dependencyIds: Array.isArray(deps) ? deps : []
  };
}

function requeueExpiredTasksInTransaction(db: any, projectId?: string, goalId?: string): number {
  const conditions = [
    inArray(schema.tasks.status, ['assigned', 'in_progress']),
    sql`${schema.tasks.leaseExpiresAt} IS NOT NULL`,
    lte(schema.tasks.leaseExpiresAt, sql`datetime('now')`)
  ];

  if (projectId) {
    conditions.push(eq(schema.tasks.projectId, projectId));
  }

  if (goalId) {
    conditions.push(eq(schema.tasks.goalId, goalId));
  }

  const rows = db.update(schema.tasks)
    .set({
      status: 'available',
      assignedTo: null,
      assignedAt: null,
      leaseExpiresAt: null,
      startedAt: null,
      availableAt: sql`datetime('now')`,
      updatedAt: sql`datetime('now')`
    })
    .where(and(...conditions))
    .returning({ id: schema.tasks.id, projectId: schema.tasks.projectId })
    .all();

  for (const row of rows) {
    insertTaskEvent(db, {
      taskId: row.id,
      projectId: row.projectId,
      eventType: "task_requeued",
      actorType: "system",
      actorId: null,
      payload: {}
    });
  }

  return rows.length;
}

function ascGoalPrioritySql(priorityColumn: typeof schema.goals.priority) {
  return sql`CASE ${priorityColumn}
    WHEN 'P0' THEN 0
    WHEN 'P1' THEN 1
    WHEN 'P2' THEN 2
    ELSE 3
  END`;
}

function insertTaskEvent(
  db: any,
  event: {
    taskId: string;
    projectId: string;
    eventType: TaskEventType;
    actorType: TaskEventActorType;
    actorId: string | null;
    payload: Record<string, unknown>;
  }
): void {
  db.insert(schema.taskEvents).values({
    id: generateId("task_event"),
    taskId: event.taskId,
    projectId: event.projectId,
    eventType: event.eventType,
    actorType: event.actorType,
    actorId: event.actorId,
    payloadJson: JSON.stringify(event.payload)
  }).run();
}
