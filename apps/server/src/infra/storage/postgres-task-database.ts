import type { Logger } from "../logging";
import type {
  ClaimedTask,
  TaskEvent,
  TaskEventActorType,
  TaskEventType,
  TaskPriority,
  TaskRecord,
  TaskSource,
  TaskStatus
} from "../../shared/types";
import type {
  TaskClaimOptions,
  TaskCompletion,
  TaskFailure,
  TaskQueryFilters,
  TaskRelease
} from "../../shared/dtos";
import type { TaskStore } from "./task-store";
import type { Pool, PoolClient } from "pg";

interface CreatePostgresTaskDatabaseParams {
  logger: Logger;
  pool: Pool;
}

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  available_at: Date | null;
  assigned_to: string | null;
  assigned_at: Date | null;
  lease_expires_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  blocked_reason: string | null;
  last_error: string | null;
  source: TaskSource;
  metadata_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  dependency_ids: string[] | null;
}

interface TaskEventRow {
  id: string;
  task_id: string;
  project_id: string;
  event_type: TaskEventType;
  actor_type: TaskEventActorType;
  actor_id: string | null;
  payload_json: Record<string, unknown>;
  created_at: Date;
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
        SELECT array_agg(td.depends_on_task_id ORDER BY td.depends_on_task_id)
        FROM task_dependencies td
        WHERE td.task_id = t.id
      ),
      ARRAY[]::text[]
    ) AS dependency_ids
  FROM tasks t
`;

export function createPostgresTaskDatabase({
  logger,
  pool
}: CreatePostgresTaskDatabaseParams): TaskStore {
  return {
    async claimNextTask(
      projectId: string,
      agentName: string,
      options: TaskClaimOptions
    ): Promise<ClaimedTask | null> {
      logger.step(
        "storage:postgres-task-db",
        `PostgreSQL task store looks for the next available task in project "${projectId}".`
      );

      return withTransaction(pool, async (client) => {
        await requeueExpiredTasksInTransaction(client, projectId);

        const claimResult = await client.query<{ id: string; project_id: string }>(
          `
            WITH candidate AS (
              SELECT t.id
              FROM tasks t
              WHERE t.project_id = $1
                AND t.status = 'available'
                AND (t.available_at IS NULL OR t.available_at <= NOW())
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
                t.available_at NULLS FIRST,
                t.created_at
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            )
            UPDATE tasks t
            SET
              status = 'assigned',
              assigned_to = $2,
              assigned_at = NOW(),
              lease_expires_at = NOW() + make_interval(secs => $3),
              updated_at = NOW(),
              blocked_reason = NULL,
              last_error = NULL
            FROM candidate
            WHERE t.id = candidate.id
            RETURNING t.id, t.project_id
          `,
          [projectId, agentName, options.leaseDurationSeconds]
        );

        const claimed = claimResult.rows[0];
        if (!claimed) {
          return null;
        }

        await insertTaskEvent(client, {
          taskId: claimed.id,
          projectId: claimed.project_id,
          eventType: "task_claimed",
          actorType: "agent",
          actorId: agentName,
          payload: {
            taskHint: options.taskHint ?? null,
            capabilities: options.capabilities ?? [],
            leaseDurationSeconds: options.leaseDurationSeconds
          }
        });

        const task = await getTaskByIdFromClient(client, claimed.id);
        return task as ClaimedTask | null;
      });
    },
    async getTaskById(taskId: string): Promise<TaskRecord | null> {
      return getTaskByIdFromClient(pool, taskId);
    },
    async listTasks(filters?: TaskQueryFilters): Promise<TaskRecord[]> {
      const clauses: string[] = [];
      const values: unknown[] = [];

      if (filters?.projectId) {
        values.push(filters.projectId);
        clauses.push(`t.project_id = $${values.length}`);
      }

      if (filters?.assignedTo) {
        values.push(filters.assignedTo);
        clauses.push(`t.assigned_to = $${values.length}`);
      }

      if (filters?.status && filters.status.length > 0) {
        values.push(filters.status);
        clauses.push(`t.status = ANY($${values.length}::text[])`);
      }

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const limitClause = filters?.limit ? `LIMIT ${filters.limit}` : "";

      const result = await pool.query<TaskRow>(
        `
          ${SELECT_TASK_COLUMNS}
          ${whereClause}
          ORDER BY t.updated_at DESC
          ${limitClause}
        `,
        values
      );

      return result.rows.map(mapTaskRow);
    },
    async markTaskInProgress(taskId: string, agentName: string): Promise<TaskRecord | null> {
      return withTransaction(pool, async (client) => {
        const result = await client.query<{ id: string; project_id: string }>(
          `
            UPDATE tasks
            SET
              status = 'in_progress',
              started_at = COALESCE(started_at, NOW()),
              updated_at = NOW()
            WHERE id = $1
              AND assigned_to = $2
              AND status IN ('assigned', 'in_progress')
            RETURNING id, project_id
          `,
          [taskId, agentName]
        );

        const updated = result.rows[0];
        if (!updated) {
          return null;
        }

        await insertTaskEvent(client, {
          taskId,
          projectId: updated.project_id,
          eventType: "task_started",
          actorType: "agent",
          actorId: agentName,
          payload: {}
        });

        return getTaskByIdFromClient(client, taskId);
      });
    },
    async completeTask(
      taskId: string,
      agentName: string,
      completion: TaskCompletion
    ): Promise<TaskRecord | null> {
      return withTransaction(pool, async (client) => {
        const result = await client.query<{ id: string; project_id: string }>(
          `
            UPDATE tasks
            SET
              status = 'completed',
              completed_at = NOW(),
              updated_at = NOW(),
              lease_expires_at = NULL,
              blocked_reason = NULL,
              last_error = NULL,
              metadata_json = metadata_json || $3::jsonb
            WHERE id = $1
              AND assigned_to = $2
              AND status IN ('assigned', 'in_progress')
            RETURNING id, project_id
          `,
          [
            taskId,
            agentName,
            JSON.stringify({
              completionSummary: completion.summary,
              completionMetadata: completion.metadata ?? {}
            })
          ]
        );

        const updated = result.rows[0];
        if (!updated) {
          return null;
        }

        await insertTaskEvent(client, {
          taskId,
          projectId: updated.project_id,
          eventType: "task_completed",
          actorType: "agent",
          actorId: agentName,
          payload: {
            summary: completion.summary,
            metadata: completion.metadata ?? {}
          }
        });

        return getTaskByIdFromClient(client, taskId);
      });
    },
    async failTask(taskId: string, agentName: string, failure: TaskFailure): Promise<TaskRecord | null> {
      return withTransaction(pool, async (client) => {
        const result = await client.query<{ id: string; project_id: string }>(
          `
            UPDATE tasks
            SET
              status = 'failed',
              failed_at = NOW(),
              updated_at = NOW(),
              lease_expires_at = NULL,
              last_error = $3,
              metadata_json = metadata_json || $4::jsonb
            WHERE id = $1
              AND assigned_to = $2
              AND status IN ('assigned', 'in_progress')
            RETURNING id, project_id
          `,
          [
            taskId,
            agentName,
            failure.error,
            JSON.stringify({
              failureMetadata: failure.metadata ?? {}
            })
          ]
        );

        const updated = result.rows[0];
        if (!updated) {
          return null;
        }

        await insertTaskEvent(client, {
          taskId,
          projectId: updated.project_id,
          eventType: "task_failed",
          actorType: "agent",
          actorId: agentName,
          payload: {
            error: failure.error,
            metadata: failure.metadata ?? {}
          }
        });

        return getTaskByIdFromClient(client, taskId);
      });
    },
    async releaseTask(taskId: string, agentName: string, release: TaskRelease): Promise<TaskRecord | null> {
      return withTransaction(pool, async (client) => {
        const result = await client.query<{ id: string; project_id: string }>(
          `
            UPDATE tasks
            SET
              status = 'available',
              assigned_to = NULL,
              assigned_at = NULL,
              lease_expires_at = NULL,
              started_at = NULL,
              updated_at = NOW(),
              available_at = NOW(),
              last_error = $3
            WHERE id = $1
              AND assigned_to = $2
              AND status IN ('assigned', 'in_progress')
            RETURNING id, project_id
          `,
          [taskId, agentName, release.reason]
        );

        const updated = result.rows[0];
        if (!updated) {
          return null;
        }

        await insertTaskEvent(client, {
          taskId,
          projectId: updated.project_id,
          eventType: "task_released",
          actorType: "agent",
          actorId: agentName,
          payload: {
            reason: release.reason,
            metadata: release.metadata ?? {}
          }
        });

        return getTaskByIdFromClient(client, taskId);
      });
    },
    async renewTaskLease(
      taskId: string,
      agentName: string,
      leaseDurationSeconds: number
    ): Promise<TaskRecord | null> {
      return withTransaction(pool, async (client) => {
        const result = await client.query<{ id: string; project_id: string }>(
          `
            UPDATE tasks
            SET
              lease_expires_at = NOW() + make_interval(secs => $3),
              updated_at = NOW()
            WHERE id = $1
              AND assigned_to = $2
              AND status IN ('assigned', 'in_progress')
            RETURNING id, project_id
          `,
          [taskId, agentName, leaseDurationSeconds]
        );

        const updated = result.rows[0];
        if (!updated) {
          return null;
        }

        await insertTaskEvent(client, {
          taskId,
          projectId: updated.project_id,
          eventType: "task_heartbeat",
          actorType: "agent",
          actorId: agentName,
          payload: {
            leaseDurationSeconds
          }
        });

        return getTaskByIdFromClient(client, taskId);
      });
    },
    async requeueExpiredTasks(projectId?: string): Promise<number> {
      return withTransaction(pool, async (client) => requeueExpiredTasksInTransaction(client, projectId));
    },
    async listTaskEvents(taskId: string): Promise<TaskEvent[]> {
      const result = await pool.query<TaskEventRow>(
        `
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
          WHERE task_id = $1
          ORDER BY created_at ASC
        `,
        [taskId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        projectId: row.project_id,
        eventType: row.event_type,
        actorType: row.actor_type,
        actorId: row.actor_id,
        payload: row.payload_json ?? {},
        createdAt: row.created_at.toISOString()
      }));
    }
  };
}

async function withTransaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getTaskByIdFromClient(
  client: Pool | PoolClient,
  taskId: string
): Promise<TaskRecord | null> {
  const result = await client.query<TaskRow>(
    `
      ${SELECT_TASK_COLUMNS}
      WHERE t.id = $1
    `,
    [taskId]
  );

  const row = result.rows[0];
  return row ? mapTaskRow(row) : null;
}

function mapTaskRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    availableAt: row.available_at?.toISOString() ?? null,
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at?.toISOString() ?? null,
    leaseExpiresAt: row.lease_expires_at?.toISOString() ?? null,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    failedAt: row.failed_at?.toISOString() ?? null,
    blockedReason: row.blocked_reason,
    lastError: row.last_error,
    source: row.source,
    metadata: row.metadata_json ?? {},
    dependencyIds: row.dependency_ids ?? []
  };
}

async function requeueExpiredTasksInTransaction(
  client: PoolClient,
  projectId?: string
): Promise<number> {
  const values: unknown[] = [];
  const projectFilter = projectId ? `AND project_id = $1` : "";

  if (projectId) {
    values.push(projectId);
  }

  const result = await client.query<{ id: string; project_id: string }>(
    `
      UPDATE tasks
      SET
        status = 'available',
        assigned_to = NULL,
        assigned_at = NULL,
        lease_expires_at = NULL,
        started_at = NULL,
        available_at = NOW(),
        updated_at = NOW()
      WHERE status IN ('assigned', 'in_progress')
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= NOW()
        ${projectFilter}
      RETURNING id, project_id
    `,
    values
  );

  for (const row of result.rows) {
    await insertTaskEvent(client, {
      taskId: row.id,
      projectId: row.project_id,
      eventType: "task_requeued",
      actorType: "system",
      actorId: null,
      payload: {}
    });
  }

  return result.rowCount ?? 0;
}

async function insertTaskEvent(
  client: PoolClient,
  event: {
    taskId: string;
    projectId: string;
    eventType: TaskEventType;
    actorType: TaskEventActorType;
    actorId: string | null;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO task_events (
        task_id,
        project_id,
        event_type,
        actor_type,
        actor_id,
        payload_json
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      event.taskId,
      event.projectId,
      event.eventType,
      event.actorType,
      event.actorId,
      JSON.stringify(event.payload)
    ]
  );
}
