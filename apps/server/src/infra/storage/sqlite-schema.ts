import { randomUUID } from "node:crypto";
import type { Logger } from "../logging";
import type { Database } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const loadedSqliteVecDatabases = new WeakSet<Database>();

export interface ApplySqliteSchemaOptions {
  embeddingDimensions?: number;
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function applySqliteSchema(
  db: Database,
  logger: Logger,
  options: ApplySqliteSchemaOptions = {}
): void {
  const embeddingDimensions = resolveEmbeddingDimensions(options.embeddingDimensions);
  loadSqliteVecExtension(db);

  logger.step("storage:sqlite-schema", "Applying SQLite schema for goal-driven task coordination.");

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      working_directory TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL UNIQUE,
      client_name TEXT,
      client_version TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_logs (
      id TEXT PRIMARY KEY,
      agent_display_name TEXT,
      tool_name TEXT NOT NULL,
      args_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      result_status TEXT NOT NULL CHECK (result_status IN ('ok', 'error')),
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'run_note',
      content TEXT NOT NULL,
      summary TEXT,
      source TEXT NOT NULL DEFAULT 'contextual-indexing',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_artifacts_vec
    USING vec0(embedding float[${embeddingDimensions}]);
  `);

  ensureTasksGoalColumn(db);
  ensureProjectDescriptionAndWorkingDir(db, logger);
  ensureMcpLogsResultJsonColumn(db, logger);
  ensureSqliteIndexes(db);
  backfillProjectGoals(db, logger);
}

function ensureAgentsTable(db: Database, logger: Logger): void {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
  ).get();
  if (!tables) {
    db.exec(`
      CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL UNIQUE,
        client_name TEXT,
        client_version TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX idx_agents_display_name ON agents(display_name);
    `);
    logger.step("storage:sqlite-schema", "Created agents table.");
  }
}

function ensureTasksGoalColumn(db: Database): void {
  const columns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  const hasGoalId = columns.some((column) => column.name === "goal_id");

  if (!hasGoalId) {
    db.exec("ALTER TABLE tasks ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE;");
  }
}

function ensureProjectDescriptionAndWorkingDir(db: Database, logger: Logger): void {
  const columns = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
  const hasDescription = columns.some((c) => c.name === "description");
  const hasWorkingDir = columns.some((c) => c.name === "working_directory");

  if (!hasDescription) {
    db.exec("ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT '';");
    logger.step("storage:sqlite-schema", "Added description column to projects.");
  }
  if (!hasWorkingDir) {
    db.exec("ALTER TABLE projects ADD COLUMN working_directory TEXT NOT NULL DEFAULT '';");
    logger.step("storage:sqlite-schema", "Added working_directory column to projects.");
  }
}

function ensureMcpLogsResultJsonColumn(db: Database, logger: Logger): void {
  const columns = db.prepare("PRAGMA table_info(mcp_logs)").all() as Array<{ name: string }>;
  const hasResultJson = columns.some((c) => c.name === "result_json");

  if (!hasResultJson) {
    db.exec("ALTER TABLE mcp_logs ADD COLUMN result_json TEXT;");
    logger.step("storage:sqlite-schema", "Added result_json column to mcp_logs.");
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

    CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_display_name
      ON agents(display_name);

    CREATE INDEX IF NOT EXISTS idx_mcp_logs_agent_created_at
      ON mcp_logs(agent_display_name, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_artifacts_external_id
      ON memory_artifacts(external_id);

    CREATE INDEX IF NOT EXISTS idx_memory_artifacts_project_id
      ON memory_artifacts(project_id);

    CREATE INDEX IF NOT EXISTS idx_memory_artifacts_goal_id
      ON memory_artifacts(goal_id);

    CREATE INDEX IF NOT EXISTS idx_memory_artifacts_task_id
      ON memory_artifacts(task_id);
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

function loadSqliteVecExtension(db: Database): void {
  if (loadedSqliteVecDatabases.has(db)) {
    return;
  }

  sqliteVec.load(db);
  loadedSqliteVecDatabases.add(db);
}

function resolveEmbeddingDimensions(value: number | undefined): number {
  if (Number.isInteger(value) && typeof value === "number" && value > 0) {
    return value;
  }

  return 256;
}
