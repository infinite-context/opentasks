import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import type { MemoryArtifact, TaskRecord } from "@opentasks/contracts";
import type { EmbeddingProvider } from "../infra/providers/embedding-provider";
import type { Logger } from "../infra/logging";
import { applySqliteSchema } from "../infra/storage/sqlite-schema";
import { createSqliteVecDatabase } from "../infra/storage/sqlite-vec-database";
import { createContextHydrator } from "./context-hydrator";
import { createVectorSearchEngine } from "./vector-search-engine";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

test("hydration retrieves an indexed artifact for a later task in the same project", async () => {
  const db = createDatabase();
  seedTaskScope(db, {
    projectId: "project_hydrate",
    goalId: "goal_hydrate",
    taskId: "task_source"
  });
  seedAvailableTask(db, {
    projectId: "project_hydrate",
    goalId: "goal_hydrate",
    taskId: "task_later",
    title: "hydration-marker-alpha follow-up task",
    description: "Ensure retrieval surfaces prior alpha marker notes."
  });

  const embeddingProvider = createDeterministicEmbeddingProvider();
  const vectorDatabase = createSqliteVecDatabase({
    logger,
    db,
    embeddingProvider
  });

  await vectorDatabase.upsert([
    createArtifact({
      id: "artifact_alpha_marker",
      taskId: "task_source",
      kind: "run_note",
      content: "hydration-marker-alpha learned artifact body for retrieval validation",
      summary: "hydration-marker-alpha summary"
    })
  ]);

  const vectorSearchEngine = createVectorSearchEngine({ logger, vectorDatabase });
  const contextHydrator = createContextHydrator({ logger, vectorSearchEngine });

  const laterTask: TaskRecord = {
    id: "task_later",
    projectId: "project_hydrate",
    goalId: "goal_hydrate",
    title: "hydration-marker-alpha follow-up task",
    description: "Ensure retrieval surfaces prior alpha marker notes.",
    status: "available",
    priority: "P1",
    availableAt: new Date().toISOString(),
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
    dependencyIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const hydrated = await contextHydrator.hydrateTask(laterTask);

  assert.ok(
    hydrated.context.items.some(
      (item) =>
        item.summary?.includes("hydration-marker-alpha") || item.content.includes("hydration-marker-alpha")
    ),
    "Expected hydrated context to include the indexed marker artifact"
  );

  db.close();
});

function createDatabase(): SqliteDatabase {
  const db = new Database(":memory:");
  applySqliteSchema(db, logger, { embeddingDimensions: 4 });
  return db;
}

function seedTaskScope(
  db: SqliteDatabase,
  params: {
    projectId: string;
    goalId: string;
    taskId: string;
  }
): void {
  db.prepare(`
    INSERT INTO projects (id, key, name)
    VALUES (?, ?, ?)
  `).run(params.projectId, `${params.projectId}-key`, `${params.projectId} name`);

  db.prepare(`
    INSERT INTO goals (id, project_id, key, name, description, status, priority, metadata_json)
    VALUES (?, ?, ?, ?, '', 'active', 'P1', '{}')
  `).run(params.goalId, params.projectId, `${params.goalId}-key`, `${params.goalId} name`);

  db.prepare(`
    INSERT INTO tasks (id, project_id, goal_id, title, description, status, priority, available_at, source)
    VALUES (?, ?, ?, ?, '', 'completed', 'P1', datetime('now'), 'system')
  `).run(params.taskId, params.projectId, params.goalId, `${params.taskId} title`);
}

function seedAvailableTask(
  db: SqliteDatabase,
  params: {
    projectId: string;
    goalId: string;
    taskId: string;
    title: string;
    description: string;
  }
): void {
  db.prepare(`
    INSERT INTO tasks (id, project_id, goal_id, title, description, status, priority, available_at, source)
    VALUES (?, ?, ?, ?, ?, 'available', 'P1', datetime('now'), 'manual')
  `).run(params.taskId, params.projectId, params.goalId, params.title, params.description);
}

function createArtifact(overrides: Partial<MemoryArtifact> = {}): MemoryArtifact {
  return {
    id: "artifact_default",
    taskId: "task_source",
    kind: "run_note",
    content: "hydration-marker-alpha learned artifact body for retrieval validation",
    summary: "hydration-marker-alpha summary",
    source: "contextual-indexing",
    ...overrides
  };
}

function createDeterministicEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "deterministic",
    dimensions: 4,
    async embed(text: string): Promise<number[]> {
      if (text.includes("alpha")) {
        return [1, 0, 0, 0];
      }

      if (text.includes("beta")) {
        return [0, 1, 0, 0];
      }

      return [0.5, 0.5, 0, 0];
    }
  };
}
