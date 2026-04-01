import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import type { MemoryArtifact } from "@opentasks/contracts";
import type { EmbeddingProvider } from "../providers/embedding-provider";
import type { Logger } from "../logging";
import { applySqliteSchema } from "./sqlite-schema";
import { createSqliteVecDatabase } from "./sqlite-vec-database";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

test("sqlite schema bootstraps memory artifact metadata and vec tables", () => {
  const db = createDatabase();

  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE name IN ('memory_artifacts', 'memory_artifacts_vec')
    ORDER BY name
  `).all() as Array<{ name: string }>;

  assert.deepEqual(
    tables.map((table) => table.name),
    ["memory_artifacts", "memory_artifacts_vec"]
  );

  db.close();
});

test("sqlite vec database keeps a stable metadata row for repeated external ids", async () => {
  const db = createDatabase();
  seedTaskScope(db, {
    projectId: "project_alpha",
    goalId: "goal_alpha",
    taskId: "task_alpha"
  });

  const vectorDatabase = createSqliteVecDatabase({
    logger,
    db,
    embeddingProvider: createDeterministicEmbeddingProvider()
  });

  await vectorDatabase.upsert([
    createArtifact({
      id: "artifact_alpha",
      taskId: "task_alpha",
      kind: "run_note",
      content: "alpha context v1",
      summary: "alpha context v1"
    })
  ]);

  const firstRow = db.prepare(`
    SELECT id, content, summary
    FROM memory_artifacts
    WHERE external_id = 'artifact_alpha'
  `).get() as { id: number; content: string; summary: string | null };

  await vectorDatabase.upsert([
    createArtifact({
      id: "artifact_alpha",
      taskId: "task_alpha",
      kind: "run_note",
      content: "alpha context v2",
      summary: "alpha context v2"
    })
  ]);

  const updatedRow = db.prepare(`
    SELECT id, content, summary
    FROM memory_artifacts
    WHERE external_id = 'artifact_alpha'
  `).get() as { id: number; content: string; summary: string | null };
  const metadataCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM memory_artifacts
    WHERE external_id = 'artifact_alpha'
  `).get() as { count: number };
  const vectorCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM memory_artifacts_vec
    WHERE rowid = ?
  `).get(updatedRow.id) as { count: number };

  assert.equal(updatedRow.id, firstRow.id);
  assert.equal(updatedRow.content, "alpha context v2");
  assert.equal(updatedRow.summary, "alpha context v2");
  assert.equal(metadataCount.count, 1);
  assert.equal(vectorCount.count, 1);

  db.close();
});

test("sqlite vec database returns structured run_note items scoped to the requested project", async () => {
  const db = createDatabase();
  seedTaskScope(db, {
    projectId: "project_alpha",
    goalId: "goal_alpha",
    taskId: "task_alpha"
  });
  seedTaskScope(db, {
    projectId: "project_beta",
    goalId: "goal_beta",
    taskId: "task_beta"
  });

  const vectorDatabase = createSqliteVecDatabase({
    logger,
    db,
    embeddingProvider: createDeterministicEmbeddingProvider()
  });

  await vectorDatabase.upsert([
    createArtifact({
      id: "artifact_alpha",
      taskId: "task_alpha",
      kind: "instruction",
      content: "alpha implementation note",
      summary: "alpha implementation note"
    }),
    createArtifact({
      id: "artifact_beta",
      taskId: "task_beta",
      kind: "instruction",
      content: "alpha implementation note",
      summary: "alpha implementation note"
    })
  ]);

  const results = await vectorDatabase.search({
    text: "alpha implementation note",
    projectId: "project_alpha",
    goalId: "goal_alpha",
    taskId: "task_alpha",
    limit: 5
  });

  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {
    id: "artifact_alpha",
    kind: "instruction",
    projectId: "project_alpha",
    goalId: "goal_alpha",
    taskId: "task_alpha",
    content: "alpha implementation note",
    summary: "alpha implementation note",
    tags: ["contextual-indexing", "instruction"],
    score: 1
  });

  db.close();
});

test("sqlite vec database swallows embedding and sqlite-vec failures", async () => {
  const db = createDatabase();
  seedTaskScope(db, {
    projectId: "project_alpha",
    goalId: "goal_alpha",
    taskId: "task_alpha"
  });

  const throwingEmbeddingProvider: EmbeddingProvider = {
    name: "throwing",
    dimensions: 4,
    async embed(): Promise<number[]> {
      throw new Error("embedding offline");
    }
  };
  const embeddingFailureDatabase = createSqliteVecDatabase({
    logger,
    db,
    embeddingProvider: throwingEmbeddingProvider
  });

  await assert.doesNotReject(() =>
    embeddingFailureDatabase.upsert([
      createArtifact({
        id: "artifact_alpha",
        taskId: "task_alpha",
        kind: "run_note",
        content: "alpha implementation note",
        summary: "alpha implementation note"
      })
    ])
  );
  assert.deepEqual(
    await embeddingFailureDatabase.search({
      text: "alpha implementation note",
      projectId: "project_alpha"
    }),
    []
  );

  const deterministicDatabase = createSqliteVecDatabase({
    logger,
    db,
    embeddingProvider: createDeterministicEmbeddingProvider()
  });

  db.exec("DROP TABLE memory_artifacts_vec");

  await assert.doesNotReject(() =>
    deterministicDatabase.upsert([
      createArtifact({
        id: "artifact_alpha",
        taskId: "task_alpha",
        kind: "run_note",
        content: "alpha implementation note",
        summary: "alpha implementation note"
      })
    ])
  );
  assert.deepEqual(
    await deterministicDatabase.search({
      text: "alpha implementation note",
      projectId: "project_alpha"
    }),
    []
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

function createArtifact(overrides: Partial<MemoryArtifact> = {}): MemoryArtifact {
  return {
    id: "artifact_default",
    taskId: "task_alpha",
    kind: "run_note",
    content: "alpha implementation note",
    summary: "alpha implementation note",
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
