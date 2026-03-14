import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryVectorDatabase } from "./vector-database";
import type { Logger } from "../logging";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

test("in-memory vector database returns structured retrieval items for the current scope", async () => {
  const vectorDatabase = createInMemoryVectorDatabase({ logger });

  const results = await vectorDatabase.search({
    text: "Hydrate the claimed task with scoped context.",
    projectId: "project_demo",
    goalId: "goal_demo",
    taskId: "task_demo",
    limit: 3
  });

  assert.equal(results.length, 3);
  assert.ok(results.every((item) => typeof item === "object" && item !== null));
  assert.ok(results.every((item) => item.projectId === "project_demo"));
  assert.ok(results.every((item) => typeof item.kind === "string"));
  assert.ok(results.every((item) => typeof item.content === "string" && item.content.length > 0));
  assert.equal(results[0]?.taskId, "task_demo");
  assert.equal(results[0]?.score, 1);
});
