import assert from "node:assert/strict";
import test from "node:test";
import { createVectorSearchEngine } from "./vector-search-engine";
import type { Logger } from "../../infra/logging";
import type { VectorDatabase, VectorSearchQuery } from "../../infra/storage/vector-database";
import type { RetrievedContextItem, TaskRecord } from "@opentasks/contracts";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

function createTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task_demo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    projectId: "project_demo",
    goalId: "goal_demo",
    title: "Hydrate task context",
    description: "Preserve structured retrieval items in the context packet.",
    status: "available",
    priority: "P1",
    availableAt: "2026-01-01T00:00:00.000Z",
    assignedTo: null,
    assignedAt: null,
    leaseExpiresAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    blockedReason: null,
    lastError: null,
    source: "system",
    metadata: {},
    dependencyIds: [],
    ...overrides
  };
}

function createRetrievedItem(
  id: string,
  overrides: Partial<RetrievedContextItem> = {}
): RetrievedContextItem {
  return {
    id,
    kind: "run_note",
    projectId: "project_demo",
    goalId: null,
    taskId: null,
    content: `${id} content`,
    summary: `${id} summary`,
    tags: [],
    score: 0.75,
    ...overrides
  };
}

test("vector search engine passes task text and scope into semantic search", async () => {
  let capturedQuery: VectorSearchQuery | null = null;

  const vectorDatabase: VectorDatabase = {
    async search(query: VectorSearchQuery): Promise<RetrievedContextItem[]> {
      capturedQuery = query;
      return [];
    },
    async upsert(): Promise<void> {}
  };

  const engine = createVectorSearchEngine({
    logger,
    vectorDatabase
  });

  await engine.searchTaskContext(createTask());

  assert.deepEqual(capturedQuery, {
    text: "Hydrate task context\nPreserve structured retrieval items in the context packet.",
    projectId: "project_demo",
    goalId: "goal_demo",
    taskId: "task_demo"
  });
});

test("vector search engine keeps project scope and reranks task and goal matches ahead of generic context", async () => {
  const vectorDatabase: VectorDatabase = {
    async search(): Promise<RetrievedContextItem[]> {
      return [
        createRetrievedItem("generic", { score: 0.7 }),
        createRetrievedItem("goal-match", { goalId: "goal_demo", score: 0.2 }),
        createRetrievedItem("task-match", { goalId: "goal_demo", taskId: "task_demo", score: 0.1 }),
        createRetrievedItem("other-project", { projectId: "project_other", goalId: "goal_demo", taskId: "task_demo", score: 0.99 })
      ];
    },
    async upsert(): Promise<void> {}
  };

  const engine = createVectorSearchEngine({
    logger,
    vectorDatabase
  });

  const results = await engine.searchTaskContext(createTask());

  assert.deepEqual(
    results.map((item) => item.id),
    ["task-match", "goal-match", "generic"]
  );
  assert.deepEqual(
    results.map((item) => item.score),
    [1, 0.9, 0.7]
  );
});
