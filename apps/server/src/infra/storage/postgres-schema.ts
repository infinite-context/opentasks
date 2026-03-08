import type { Logger } from "../logging";
import type { Pool } from "pg";

export async function applyPostgresSchema(pool: Pool, logger: Logger): Promise<void> {
  logger.step("storage:postgres-schema", "Applying PostgreSQL schema for phase one task coordination.");

  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE OR REPLACE FUNCTION opentasks_generate_id(prefix TEXT)
    RETURNS TEXT
    LANGUAGE sql
    AS $$
      SELECT prefix || '_' || replace(gen_random_uuid()::text, '-', '');
    $$;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY DEFAULT opentasks_generate_id('project'),
      CHECK (id LIKE 'project_%'),
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY DEFAULT opentasks_generate_id('task'),
      CHECK (id LIKE 'task_%'),
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN (
        'pending',
        'available',
        'assigned',
        'in_progress',
        'blocked',
        'completed',
        'failed',
        'cancelled'
      )),
      priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
      available_at TIMESTAMPTZ,
      assigned_to TEXT,
      assigned_at TIMESTAMPTZ,
      lease_expires_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      blocked_reason TEXT,
      last_error TEXT,
      source TEXT NOT NULL CHECK (source IN ('seeded', 'manual', 'system')),
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, depends_on_task_id),
      CHECK (task_id <> depends_on_task_id)
    );

    CREATE TABLE IF NOT EXISTS task_events (
      id TEXT PRIMARY KEY DEFAULT opentasks_generate_id('task_event'),
      CHECK (id LIKE 'task_event_%'),
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project_status_available
      ON tasks(project_id, status, available_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status
      ON tasks(assigned_to, status);

    CREATE INDEX IF NOT EXISTS idx_tasks_lease_expires
      ON tasks(lease_expires_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at
      ON tasks(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_task_dependencies_dependency
      ON task_dependencies(depends_on_task_id);

    CREATE INDEX IF NOT EXISTS idx_task_events_task_created_at
      ON task_events(task_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_task_events_project_created_at
      ON task_events(project_id, created_at DESC);

    ALTER TABLE projects
      ALTER COLUMN id SET DEFAULT opentasks_generate_id('project');

    ALTER TABLE tasks
      ALTER COLUMN id SET DEFAULT opentasks_generate_id('task');

    ALTER TABLE task_events
      ALTER COLUMN id SET DEFAULT opentasks_generate_id('task_event');
  `);
}

export async function seedPostgresDemoData(pool: Pool, logger: Logger): Promise<void> {
  logger.step("storage:postgres-schema", "Seeding PostgreSQL demo data when the task table is empty.");

  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM tasks");

  if (countResult.rows[0]?.count !== "0") {
    return;
  }

  const projectResult = await pool.query<{ id: string }>(
    `
      INSERT INTO projects (key, name)
      VALUES ('demo-project', 'Demo Project')
      ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING id
    `
  );
  const projectId = projectResult.rows[0].id;

  const firstTaskResult = await pool.query<{ id: string }>(
    `
      INSERT INTO tasks (
        project_id,
        title,
        description,
        status,
        priority,
        available_at,
        source
      )
      VALUES ($1, $2, $3, 'available', 'P0', NOW(), 'seeded')
      RETURNING id
    `,
    [projectId, "Hydrate the next task with reusable context", "Seeded task that verifies the first execution path through the real backend."]
  );
  const firstTaskId = firstTaskResult.rows[0].id;

  const secondTaskResult = await pool.query<{ id: string }>(
    `
      INSERT INTO tasks (
        project_id,
        title,
        description,
        status,
        priority,
        available_at,
        source
      )
      VALUES ($1, $2, $3, 'available', 'P1', NOW(), 'seeded')
      RETURNING id
    `,
    [projectId, "Prepare a follow-up task for the same project", "Second seeded task that depends on the primary task to verify dependency-aware claiming."]
  );
  const secondTaskId = secondTaskResult.rows[0].id;

  const thirdTaskResult = await pool.query<{ id: string }>(
    `
      INSERT INTO tasks (
        project_id,
        title,
        description,
        status,
        priority,
        available_at,
        source
      )
      VALUES ($1, $2, $3, 'available', 'P2', NOW(), 'seeded')
      RETURNING id
    `,
    [projectId, "Document execution path observability requirements", "Third seeded task for broader queue visibility."]
  );
  const thirdTaskId = thirdTaskResult.rows[0].id;

  await pool.query(
    `
      INSERT INTO task_dependencies (task_id, depends_on_task_id)
      VALUES ($1, $2)
    `,
    [secondTaskId, firstTaskId]
  );

  await pool.query(
    `
      INSERT INTO task_events (task_id, project_id, event_type, actor_type, payload_json)
      VALUES
        ($1, $4, 'task_created', 'system', '{}'::jsonb),
        ($1, $4, 'task_available', 'system', '{}'::jsonb),
        ($2, $4, 'task_created', 'system', '{}'::jsonb),
        ($2, $4, 'task_available', 'system', '{}'::jsonb),
        ($3, $4, 'task_created', 'system', '{}'::jsonb),
        ($3, $4, 'task_available', 'system', '{}'::jsonb)
    `,
    [firstTaskId, secondTaskId, thirdTaskId, projectId]
  );
}
