import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "../../infra/logging";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import { createValidationService } from "../validation-service";
import { createGoalService } from "./goal-service";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

test("goal service resolves the next claimable goal for a project", async () => {
  const store = createInMemoryTaskStore({ logger });
  const project = await store.createProject({
    key: "goal-resolution-project",
    name: "Goal Resolution Project"
  });
  const firstGoal = await store.createGoal({
    projectId: project.id,
    key: "goal-a",
    name: "Goal A",
    priority: "P0"
  });
  const secondGoal = await store.createGoal({
    projectId: project.id,
    key: "goal-b",
    name: "Goal B",
    priority: "P1"
  });

  assert.ok(firstGoal);
  assert.ok(secondGoal);

  await store.createTask({
    projectId: project.id,
    goalId: secondGoal.id,
    title: "Available task"
  });

  const validationService = createValidationService({ logger, store });
  const goalService = createGoalService({
    logger,
    goalStore: store,
    taskStore: store,
    validationService
  });

  const nextGoal = await goalService.resolveNextGoal(project.id);

  assert.equal(nextGoal?.id, secondGoal.id);
});
