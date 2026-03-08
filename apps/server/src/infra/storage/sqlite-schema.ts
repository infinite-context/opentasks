import { randomUUID } from "node:crypto";
import type { Logger } from "../logging";
import type { Database } from "better-sqlite3";

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function applySqliteSchema(db: Database, logger: Logger): void {
  logger.step("storage:sqlite-schema", "Applying SQLite schema for goal-driven task coordination.");

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
      priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, key)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
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
      available_at TEXT,
      assigned_to TEXT,
      assigned_at TEXT,
      lease_expires_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      failed_at TEXT,
      blocked_reason TEXT,
      last_error TEXT,
      source TEXT NOT NULL CHECK (source IN ('seeded', 'manual', 'system')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, depends_on_task_id),
      CHECK (task_id <> depends_on_task_id)
    );

    CREATE TABLE IF NOT EXISTS task_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  ensureTasksGoalColumn(db);
  ensureSqliteIndexes(db);
  backfillProjectGoals(db, logger);
}

export function seedSqliteDemoData(db: Database, logger: Logger): void {
  logger.step("storage:sqlite-schema", "Seeding SQLite demo data when the task table is empty.");

  const countRow = db.prepare("SELECT COUNT(*) AS count FROM tasks").get() as { count: number };

  if (countRow.count !== 0) {
    return;
  }

  const insertProject = db.prepare(`
    INSERT INTO projects (id, key, name)
    VALUES (?, 'demo-project', 'Demo Project')
    ON CONFLICT (key) DO UPDATE SET
      name = excluded.name,
      updated_at = datetime('now')
    RETURNING id
  `);
  
  const projectId = generateId("project");
  insertProject.run(projectId);

  const goalId = generateId("goal");
  db.prepare(`
    INSERT INTO goals (id, project_id, key, name, description, status, priority, metadata_json)
    VALUES (?, ?, 'initial-goal', 'Initial Goal', 'Default seeded goal for the demo project.', 'active', 'P0', '{}')
    ON CONFLICT (project_id, key) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      status = excluded.status,
      priority = excluded.priority,
      updated_at = datetime('now')
  `).run(goalId, projectId);

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id,
      project_id,
      goal_id,
      title,
      description,
      status,
      priority,
      available_at,
      source
    )
    VALUES (?, ?, ?, ?, ?, 'available', ?, datetime('now'), 'seeded')
  `);

  const firstTaskId = generateId("task");
  insertTask.run(
    firstTaskId,
    projectId,
    goalId,
    "Hydrate the next task with reusable context",
    "Seeded task that verifies the first execution path through the real backend.",
    "P0"
  );

  const secondTaskId = generateId("task");
  insertTask.run(
    secondTaskId,
    projectId,
    goalId,
    "Prepare a follow-up task for the same project",
    "Second seeded task that depends on the primary task to verify dependency-aware claiming.",
    "P1"
  );

  const thirdTaskId = generateId("task");
  insertTask.run(
    thirdTaskId,
    projectId,
    goalId,
    "Document execution path observability requirements",
    "Third seeded task for broader queue visibility.",
    "P2"
  );

  db.prepare(`
    INSERT INTO task_dependencies (task_id, depends_on_task_id)
    VALUES (?, ?)
  `).run(secondTaskId, firstTaskId);

  const insertEvent = db.prepare(`
    INSERT INTO task_events (id, task_id, project_id, event_type, actor_type, payload_json)
    VALUES (?, ?, ?, ?, 'system', '{}')
  `);

  const events = [
    { taskId: firstTaskId, type: "task_created" },
    { taskId: firstTaskId, type: "task_available" },
    { taskId: secondTaskId, type: "task_created" },
    { taskId: secondTaskId, type: "task_available" },
    { taskId: thirdTaskId, type: "task_created" },
    { taskId: thirdTaskId, type: "task_available" }
  ];

  for (const event of events) {
    insertEvent.run(generateId("task_event"), event.taskId, projectId, event.type);
  }
}

function ensureTasksGoalColumn(db: Database): void {
  const columns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  const hasGoalId = columns.some((column) => column.name === "goal_id");

  if (!hasGoalId) {
    db.exec("ALTER TABLE tasks ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE;");
  }
}

function ensureSqliteIndexes(db: Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_project_status_available
      ON tasks(project_id, status, available_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_goal_status_available
      ON tasks(goal_id, status, available_at);

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

    CREATE INDEX IF NOT EXISTS idx_goals_project_key
      ON goals(project_id, key);

    CREATE INDEX IF NOT EXISTS idx_goals_project_status_priority
      ON goals(project_id, status, priority);
  `);
}

function backfillProjectGoals(db: Database, logger: Logger): void {
  const projectRows = db.prepare("SELECT id, key, name FROM projects").all() as Array<{
    id: string;
    key: string;
    name: string;
  }>;

  const findGoalForProject = db.prepare(`
    SELECT id
    FROM goals
    WHERE project_id = ?
    ORDER BY
      CASE priority
        WHEN 'P0' THEN 0
        WHEN 'P1' THEN 1
        WHEN 'P2' THEN 2
        ELSE 3
      END,
      created_at ASC
    LIMIT 1
  `);
  const insertGoal = db.prepare(`
    INSERT INTO goals (id, project_id, key, name, description, status, priority, metadata_json)
    VALUES (?, ?, ?, ?, ?, 'active', 'P2', '{}')
  `);
  const attachTasksToGoal = db.prepare(`
    UPDATE tasks
    SET goal_id = ?
    WHERE project_id = ?
      AND goal_id IS NULL
  `);

  for (const project of projectRows) {
    const existingGoal = findGoalForProject.get(project.id) as { id: string } | undefined;
    const goalId = existingGoal?.id ?? generateId("goal");

    if (!existingGoal) {
      insertGoal.run(
        goalId,
        project.id,
        `${project.key}-default`,
        `${project.name} Default Goal`,
        "Backfilled default goal for existing project tasks."
      );
      logger.step("storage:sqlite-schema", `Created default goal "${goalId}" for project "${project.id}".`);
    }

    attachTasksToGoal.run(goalId, project.id);
  }
}
