import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "../../infra/logging";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import { createTaskQueryService } from "../task-query-service";
import { createTaskResolutionService } from "./task-resolution-service";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

test("task resolution recommends a directly claimable matched task", async () => {
  const taskStore = createInMemoryTaskStore({
    logger,
    initialTasks: []
  });

  const project = await taskStore.createProject({
    key: "resolution-direct-project",
    name: "Resolution Direct Project",
    description: "Project for direct query resolution.",
    workingDirectory: "."
  });

  assert.ok(project);

  const goal = await taskStore.createGoal({
    projectId: project.id,
    key: "resolution-direct-goal",
    name: "Resolution Direct Goal",
    description: "Directly claimable work."
  });

  assert.ok(goal);

  const task = await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Fix logout bug in auth flow",
    description: "Users cannot log out correctly."
  });

  assert.ok(task);

  const taskQueryService = createTaskQueryService({ logger, taskStore });
  const taskResolutionService = createTaskResolutionService({
    logger,
    taskQueryService,
    taskStore
  });

  const result = await taskResolutionService.recommendTaskForQuery({
    projectId: project.id,
    query: "logout auth"
  });

  assert.equal(result.recommendedTaskId, task.id);
  assert.equal(result.recommendedTask?.id, task.id);
});

test("task resolution recommends a claimable upstream dependency when the best match is blocked", async () => {
  const taskStore = createInMemoryTaskStore({
    logger,
    initialTasks: []
  });

  const project = await taskStore.createProject({
    key: "resolution-upstream-project",
    name: "Resolution Upstream Project",
    description: "Project for upstream dependency resolution.",
    workingDirectory: "."
  });

  assert.ok(project);

  const goal = await taskStore.createGoal({
    projectId: project.id,
    key: "resolution-upstream-goal",
    name: "Resolution Upstream Goal",
    description: "Blocked work."
  });

  assert.ok(goal);

  const taskA = await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Normalize JWT payload",
    description: "Normalize auth token state before logout fixes."
  });

  assert.ok(taskA);

  const taskB = await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Fix JWT deserialization",
    description: "Fix auth token parsing for session state.",
    dependencyIds: [taskA.id]
  });

  assert.ok(taskB);

  const taskC = await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Fix logout bug in auth flow",
    description: "Users cannot log out correctly in the auth flow.",
    dependencyIds: [taskB.id]
  });

  assert.ok(taskC);

  const taskQueryService = createTaskQueryService({ logger, taskStore });
  const taskResolutionService = createTaskResolutionService({
    logger,
    taskQueryService,
    taskStore
  });

  const result = await taskResolutionService.recommendTaskForQuery({
    projectId: project.id,
    query: "logout auth"
  });

  assert.equal(result.recommendedTaskId, taskA.id);
  assert.equal(result.recommendedTask?.id, taskA.id);
});

test("task resolution returns no recommendation when nothing matches", async () => {
  const taskStore = createInMemoryTaskStore({
    logger,
    initialTasks: []
  });

  const project = await taskStore.createProject({
    key: "resolution-empty-project",
    name: "Resolution Empty Project",
    description: "Project for empty query resolution.",
    workingDirectory: "."
  });

  assert.ok(project);

  const goal = await taskStore.createGoal({
    projectId: project.id,
    key: "resolution-empty-goal",
    name: "Resolution Empty Goal",
    description: "No matching work."
  });

  assert.ok(goal);

  await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Investigate caching issue",
    description: "Inspect response cache invalidation."
  });

  const taskQueryService = createTaskQueryService({ logger, taskStore });
  const taskResolutionService = createTaskResolutionService({
    logger,
    taskQueryService,
    taskStore
  });

  const result = await taskResolutionService.recommendTaskForQuery({
    projectId: project.id,
    query: "logout auth"
  });

  assert.equal(result.recommendedTaskId, null);
  assert.equal(result.recommendedTask, null);
});
