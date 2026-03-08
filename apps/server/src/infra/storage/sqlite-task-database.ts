import type { Logger } from "../logging";
import type {
  ClaimedTask,
  ProjectRecord,
  TaskEvent,
  TaskEventActorType,
  TaskEventType,
  TaskPriority,
  TaskRecord,
  TaskSource,
  TaskStatus
} from "../../shared/types";
import type {
  CreateTaskInput,
  TaskClaimOptions,
  TaskCompletion,
  TaskFailure,
  TaskQueryFilters,
  TaskRelease
} from "../../shared/dtos";
import type { TaskStore } from "./task-store";
import type { Database } from "better-sqlite3";
import { generateId } from "./sqlite-schema";

interface CreateSqliteTaskDatabaseParams {
  logger: Logger;
  db: Database;
}

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  available_at: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  blocked_reason: string | null;
  last_error: string | null;
  source: TaskSource;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  dependency_ids: string | null;
}

interface ProjectRow {
  id: string;
  key: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface TaskEventRow {
  id: string;
  task_id: string;
  project_id: string;
  event_type: TaskEventType;
  actor_type: TaskEventActorType;
  actor_id: string | null;
  payload_json: string;
  created_at: string;
}

const SELECT_TASK_COLUMNS = `
  SELECT
    t.id,
    t.project_id,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.available_at,
    t.assigned_to,
    t.assigned_at,
    t.lease_expires_at,
    t.started_at,
    t.completed_at,
    t.failed_at,
    t.blocked_reason,
    t.last_error,
    t.source,
    t.metadata_json,
    t.created_at,
    t.updated_at,
    COALESCE(
      (
        SELECT json_group_array(td.depends_on_task_id)
        FROM task_dependencies td
        WHERE td.task_id = t.id
      ),
      '[]'
    ) AS dependency_ids
  FROM tasks t
`;

export function createSqliteTaskDatabase({
  logger,
  db
}: CreateSqliteTaskDatabaseParams): TaskStore {
  return {
    async createTask(input: CreateTaskInput): Promise<TaskRecord | null> {
      return db.transaction(() => {
        const project = getProjectByIdOrKeyFromDb(db, input.projectId);
        if (!project) {
          logger.step(
            "storage:sqlite-task-db",
            `Cannot create task: project "${input.projectId}" not found.`
          );
          return null;
        }

        const taskId = generateId("task");

        db.prepare(`
          INSERT INTO tasks (
            id,
            project_id,
            title,
            description,
            status,
            priority,
            available_at,
            source
          )
          VALUES (?, ?, ?, ?, 'available', ?, datetime('now'), 'manual')
        `).run(
          taskId,
          project.id,
          input.title,
          input.description ?? "",
          input.priority ?? "P2"
        );

        const dependencyIds = input.dependencyIds ?? [];
        const insertDep = db.prepare(`
          INSERT INTO task_dependencies (task_id, depends_on_task_id)
          VALUES (?, ?)
          ON CONFLICT DO NOTHING
        `);
        for (const depId of dependencyIds) {
          insertDep.run(taskId, depId);
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
          `Created task "${taskId}" in project "${input.projectId}".`
        );

        return getTaskByIdFromDb(db, taskId);
      })();
    },
    async claimNextTask(
      projectId: string,
      agentName: string,
      options: TaskClaimOptions
    ): Promise<ClaimedTask | null> {
      logger.step(
        "storage:sqlite-task-db",
        `SQLite task store looks for the next available task in project "${projectId}".`
      );

      return db.transaction(() => {
        const resolvedProjectId = resolveProjectIdFromDb(db, projectId);
        if (!resolvedProjectId) {
          return null;
        }

        requeueExpiredTasksInTransaction(db, resolvedProjectId);

        const candidate = db.prepare(`
          SELECT t.id
          FROM tasks t
          WHERE t.project_id = ?
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
        `).get(resolvedProjectId) as { id: string } | undefined;

        if (!candidate) {
          return null;
        }

        db.prepare(`
          UPDATE tasks
          SET
            status = 'assigned',
            assigned_to = ?,
            assigned_at = datetime('now'),
            lease_expires_at = datetime('now', '+' || ? || ' seconds'),
            updated_at = datetime('now'),
            blocked_reason = NULL,
            last_error = NULL
          WHERE id = ?
        `).run(agentName, options.leaseDurationSeconds, candidate.id);

        insertTaskEvent(db, {
          taskId: candidate.id,
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

        return getTaskByIdFromDb(db, candidate.id) as ClaimedTask | null;
      })();
    },
    async getProject(projectId: string): Promise<ProjectRecord | null> {
      return getProjectByIdOrKeyFromDb(db, projectId);
    },
    async getTaskById(taskId: string): Promise<TaskRecord | null> {
      return getTaskByIdFromDb(db, taskId);
    },
    async listTasks(filters?: TaskQueryFilters): Promise<TaskRecord[]> {
      const clauses: string[] = [];
      const values: unknown[] = [];
      const projectId = filters?.projectId ? resolveProjectIdFromDb(db, filters.projectId) : null;

      if (filters?.projectId) {
        if (!projectId) {
          return [];
        }

        values.push(projectId);
        clauses.push(`t.project_id = ?`);
      }

      if (filters?.assignedTo) {
        values.push(filters.assignedTo);
        clauses.push(`t.assigned_to = ?`);
      }

      if (filters?.status && filters.status.length > 0) {
        const placeholders = filters.status.map(() => "?").join(",");
        values.push(...filters.status);
        clauses.push(`t.status IN (${placeholders})`);
      }

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const limitClause = filters?.limit ? `LIMIT ${filters.limit}` : "";

      const rows = db.prepare(`
        ${SELECT_TASK_COLUMNS}
        ${whereClause}
        ORDER BY t.updated_at DESC
        ${limitClause}
      `).all(...values) as TaskRow[];

      return rows.map(mapTaskRow);
    },
    async markTaskInProgress(taskId: string, agentName: string): Promise<TaskRecord | null> {
      return db.transaction(() => {
        const result = db.prepare(`
          UPDATE tasks
          SET
            status = 'in_progress',
            started_at = COALESCE(started_at, datetime('now')),
            updated_at = datetime('now')
          WHERE id = ?
            AND assigned_to = ?
            AND status IN ('assigned', 'in_progress')
          RETURNING id, project_id
        `).get(taskId, agentName) as { id: string; project_id: string } | undefined;

        if (!result) {
          return null;
        }

        insertTaskEvent(db, {
          taskId,
          projectId: result.project_id,
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
      return db.transaction(() => {
        const payload = JSON.stringify({
          completionSummary: completion.summary,
          completionMetadata: completion.metadata ?? {}
        });

        const result = db.prepare(`
          UPDATE tasks
          SET
            status = 'completed',
            completed_at = datetime('now'),
            updated_at = datetime('now'),
            lease_expires_at = NULL,
            blocked_reason = NULL,
            last_error = NULL,
            metadata_json = json_patch(metadata_json, ?)
          WHERE id = ?
            AND assigned_to = ?
            AND status IN ('assigned', 'in_progress')
          RETURNING id, project_id
        `).get(payload, taskId, agentName) as { id: string; project_id: string } | undefined;

        if (!result) {
          return null;
        }

        insertTaskEvent(db, {
          taskId,
          projectId: result.project_id,
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
      return db.transaction(() => {
        const payload = JSON.stringify({
          failureMetadata: failure.metadata ?? {}
        });

        const result = db.prepare(`
          UPDATE tasks
          SET
            status = 'failed',
            failed_at = datetime('now'),
            updated_at = datetime('now'),
            lease_expires_at = NULL,
            last_error = ?,
            metadata_json = json_patch(metadata_json, ?)
          WHERE id = ?
            AND assigned_to = ?
            AND status IN ('assigned', 'in_progress')
          RETURNING id, project_id
        `).get(failure.error, payload, taskId, agentName) as { id: string; project_id: string } | undefined;

        if (!result) {
          return null;
        }

        insertTaskEvent(db, {
          taskId,
          projectId: result.project_id,
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
      return db.transaction(() => {
        const result = db.prepare(`
          UPDATE tasks
          SET
            status = 'available',
            assigned_to = NULL,
            assigned_at = NULL,
            lease_expires_at = NULL,
            started_at = NULL,
            updated_at = datetime('now'),
            available_at = datetime('now'),
            last_error = ?
          WHERE id = ?
            AND assigned_to = ?
            AND status IN ('assigned', 'in_progress')
          RETURNING id, project_id
        `).get(release.reason, taskId, agentName) as { id: string; project_id: string } | undefined;

        if (!result) {
          return null;
        }

        insertTaskEvent(db, {
          taskId,
          projectId: result.project_id,
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
      return db.transaction(() => {
        const result = db.prepare(`
          UPDATE tasks
          SET
            lease_expires_at = datetime('now', '+' || ? || ' seconds'),
            updated_at = datetime('now')
          WHERE id = ?
            AND assigned_to = ?
            AND status IN ('assigned', 'in_progress')
          RETURNING id, project_id
        `).get(leaseDurationSeconds, taskId, agentName) as { id: string; project_id: string } | undefined;

        if (!result) {
          return null;
        }

        insertTaskEvent(db, {
          taskId,
          projectId: result.project_id,
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
    async requeueExpiredTasks(projectId?: string): Promise<number> {
      return db.transaction(() => {
        const resolvedProjectId = projectId ? resolveProjectIdFromDb(db, projectId) : undefined;
        return requeueExpiredTasksInTransaction(db, resolvedProjectId ?? undefined);
      })();
    },
    async listTaskEvents(taskId: string): Promise<TaskEvent[]> {
      const rows = db.prepare(`
        SELECT
          id,
          task_id,
          project_id,
          event_type,
          actor_type,
          actor_id,
          payload_json,
          created_at
        FROM task_events
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all(taskId) as TaskEventRow[];

      return rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        projectId: row.project_id,
        eventType: row.event_type,
        actorType: row.actor_type,
        actorId: row.actor_id,
        payload: JSON.parse(row.payload_json),
        createdAt: row.created_at
      }));
    },
    async listProjectTaskEvents(projectId: string, limit = 20): Promise<TaskEvent[]> {
      const resolvedProjectId = resolveProjectIdFromDb(db, projectId);
      if (!resolvedProjectId) {
        return [];
      }

      const rows = db.prepare(`
        SELECT
          id,
          task_id,
          project_id,
          event_type,
          actor_type,
          actor_id,
          payload_json,
          created_at
        FROM task_events
        WHERE project_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(resolvedProjectId, limit) as TaskEventRow[];

      return rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        projectId: row.project_id,
        eventType: row.event_type,
        actorType: row.actor_type,
        actorId: row.actor_id,
        payload: JSON.parse(row.payload_json),
        createdAt: row.created_at
      }));
    }
  };
}

function getTaskByIdFromDb(db: Database, taskId: string): TaskRecord | null {
  const row = db.prepare(`
    ${SELECT_TASK_COLUMNS}
    WHERE t.id = ?
  `).get(taskId) as TaskRow | undefined;

  return row ? mapTaskRow(row) : null;
}

function resolveProjectIdFromDb(db: Database, projectRef: string): string | null {
  const project = getProjectByIdOrKeyFromDb(db, projectRef);
  return project?.id ?? null;
}

function getProjectByIdOrKeyFromDb(db: Database, projectRef: string): ProjectRecord | null {
  const row = db.prepare(`
    SELECT id, key, name, created_at, updated_at
    FROM projects
    WHERE id = ? OR key = ?
    LIMIT 1
  `).get(projectRef, projectRef) as ProjectRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTaskRow(row: TaskRow): TaskRecord {
  const deps = row.dependency_ids ? JSON.parse(row.dependency_ids) : [];
  
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    availableAt: row.available_at ?? null,
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at ?? null,
    leaseExpiresAt: row.lease_expires_at ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    failedAt: row.failed_at ?? null,
    blockedReason: row.blocked_reason,
    lastError: row.last_error,
    source: row.source,
    metadata: JSON.parse(row.metadata_json),
    dependencyIds: Array.isArray(deps) ? deps : []
  };
}

function requeueExpiredTasksInTransaction(db: Database, projectId?: string): number {
  const values: unknown[] = [];
  const projectFilter = projectId ? `AND project_id = ?` : "";

  if (projectId) {
    values.push(projectId);
  }

  const rows = db.prepare(`
    UPDATE tasks
    SET
      status = 'available',
      assigned_to = NULL,
      assigned_at = NULL,
      lease_expires_at = NULL,
      started_at = NULL,
      available_at = datetime('now'),
      updated_at = datetime('now')
    WHERE status IN ('assigned', 'in_progress')
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= datetime('now')
      ${projectFilter}
    RETURNING id, project_id
  `).all(...values) as { id: string; project_id: string }[];

  for (const row of rows) {
    insertTaskEvent(db, {
      taskId: row.id,
      projectId: row.project_id,
      eventType: "task_requeued",
      actorType: "system",
      actorId: null,
      payload: {}
    });
  }

  return rows.length;
}

function insertTaskEvent(
  db: Database,
  event: {
    taskId: string;
    projectId: string;
    eventType: TaskEventType;
    actorType: TaskEventActorType;
    actorId: string | null;
    payload: Record<string, unknown>;
  }
): void {
  db.prepare(`
    INSERT INTO task_events (
      id,
      task_id,
      project_id,
      event_type,
      actor_type,
      actor_id,
      payload_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId("task_event"),
    event.taskId,
    event.projectId,
    event.eventType,
    event.actorType,
    event.actorId,
    JSON.stringify(event.payload)
  );
}
