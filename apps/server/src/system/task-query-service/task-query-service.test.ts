import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "../../infra/logging";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import { createTaskQueryService } from "./task-query-service";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

test("task query search returns readiness insight for blocked dependency chains", async () => {
  const taskStore = createInMemoryTaskStore({
    logger,
    initialTasks: []
  });

  const project = await taskStore.createProject({
    key: "query-resolution-project",
    name: "Query Resolution Project",
    description: "Project for search readiness tests.",
    workingDirectory: "."
  });

  assert.ok(project);

  const goal = await taskStore.createGoal({
    projectId: project.id,
    key: "auth-goal",
    name: "Auth Goal",
    description: "Authentication flow work."
  });

  assert.ok(goal);

  const dependencyTask = await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Normalize JWT payload",
    description: "Normalize auth token state before logout fixes."
  });

  assert.ok(dependencyTask);

  const blockedDependencyTask = await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Fix JWT deserialization",
    description: "Fix auth token parsing for session state.",
    dependencyIds: [dependencyTask.id]
  });

  assert.ok(blockedDependencyTask);

  const matchedTask = await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Fix logout bug in auth flow",
    description: "Users cannot log out correctly in the auth flow.",
    dependencyIds: [blockedDependencyTask.id]
  });

  assert.ok(matchedTask);

  const taskQueryService = createTaskQueryService({
    logger,
    taskStore
  });

  const result = await taskQueryService.searchTasks({
    projectId: project.id,
    query: "logout auth"
  });

  const hit = result.results.find((candidate) => candidate.task.id === matchedTask.id);

  assert.ok(hit);
  assert.equal(hit.claimable, false);
  assert.deepEqual(hit.nextClaimableDependencyTaskIds, [dependencyTask.id]);
  assert.deepEqual(
    hit.unresolvedUpstreamDependencies.map((dependency) => dependency.id),
    [dependencyTask.id, blockedDependencyTask.id]
  );
});

test("task query search marks directly claimable tasks as claimable", async () => {
  const taskStore = createInMemoryTaskStore({
    logger,
    initialTasks: []
  });

  const project = await taskStore.createProject({
    key: "claimable-task-project",
    name: "Claimable Task Project",
    description: "Project for claimable search tests.",
    workingDirectory: "."
  });

  assert.ok(project);

  const goal = await taskStore.createGoal({
    projectId: project.id,
    key: "claimable-goal",
    name: "Claimable Goal",
    description: "Ready work."
  });

  assert.ok(goal);

  const task = await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Investigate auth refresh flow",
    description: "Inspect the auth refresh behavior."
  });

  assert.ok(task);

  const taskQueryService = createTaskQueryService({
    logger,
    taskStore
  });

  const result = await taskQueryService.searchTasks({
    projectId: project.id,
    query: "auth refresh"
  });

  const hit = result.results.find((candidate) => candidate.task.id === task.id);

  assert.ok(hit);
  assert.equal(hit.claimable, true);
  assert.deepEqual(hit.nextClaimableDependencyTaskIds, []);
  assert.deepEqual(hit.unresolvedUpstreamDependencies, []);
});
