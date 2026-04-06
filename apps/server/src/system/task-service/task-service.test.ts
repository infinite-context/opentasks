import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import type { MemoryArtifact } from "@opentasks/contracts";
import type { Logger } from "../../infra/logging";
import { createInMemoryTaskStore } from "../../infra/storage/in-memory-task-store";
import type { LearningLoop } from "../learning-loop";
import { createValidationService } from "../validation-service";
import { createTaskService } from "./task-service";

function createTestLogger(): { logger: Logger; infos: string[] } {
  const infos: string[] = [];

  return {
    infos,
    logger: {
      section() {},
      step() {},
      info(scope, message) {
        infos.push(`[${scope}] ${message}`);
      }
    }
  };
}

async function createReadyTaskService(logger: Logger, learningLoop?: LearningLoop | null) {
  const taskStore = createInMemoryTaskStore({ logger });
  const validationService = createValidationService({ logger, store: taskStore });
  const taskService = createTaskService({
    logger,
    taskStore,
    validationService,
    defaultLeaseDurationSeconds: 900,
    learningLoop
  });

  const project = await taskStore.createProject({
    key: "task-service-project",
    name: "Task Service Project",
    description: "Project for task service tests",
    workingDirectory: process.cwd()
  });
  const goal = await taskStore.createGoal({
    projectId: project.id,
    key: "task-service-goal",
    name: "Task Service Goal"
  });

  assert.ok(goal);

  const task = await taskStore.createTask({
    projectId: project.id,
    goalId: goal.id,
    title: "Ship task-service learning hook",
    description: "Exercise task completion behavior"
  });

  assert.ok(task);
  assert.equal((await taskService.claimTaskById(task.id, "agent-one")).status, "ok");
  assert.equal((await taskService.startTask(task.id, "agent-one")).status, "ok");

  return { project, goal, task, taskService };
}

test("task service triggers the learning loop asynchronously after completion", async () => {
  const { logger, infos } = createTestLogger();
  const runs: Array<Parameters<LearningLoop["run"]>[0]> = [];
  let resolveRun: (artifacts: MemoryArtifact[]) => void = () => {};

  const learningLoop: LearningLoop = {
    async run(run) {
      runs.push(run);
      return await new Promise<MemoryArtifact[]>((resolve) => {
        resolveRun = resolve;
      });
    }
  };

  const { project, goal, task, taskService } = await createReadyTaskService(logger, learningLoop);
  const resultPromise = taskService.completeTask(task.id, "agent-one", {
    summary: "Completed successfully"
  });

  const returnedBeforeImmediate = await Promise.race([
    resultPromise.then(() => true),
    waitForImmediate().then(() => false)
  ]);

  assert.equal(returnedBeforeImmediate, true);

  const result = await resultPromise;
  assert.equal(result.status, "ok");

  await waitForImmediate();

  assert.deepEqual(runs, [
    {
      taskId: task.id,
      projectId: project.id,
      projectName: project.name,
      projectDescription: project.description,
      goalId: goal.id,
      goalName: goal.name,
      goalDescription: goal.description,
      taskTitle: task.title,
      taskDescription: task.description,
      summary: "Completed successfully",
      contextDump: null,
      messages: [],
      filesTouched: [],
      errors: [],
      commands: [],
      decisions: [],
      outcome: "success"
    }
  ]);
  assert.ok(!infos.some((message) => message.includes("Learning loop failed")));

  resolveRun([]);
});

test("task service triggers the learning loop asynchronously after failure", async () => {
  const { logger, infos } = createTestLogger();
  const runs: Array<Parameters<LearningLoop["run"]>[0]> = [];
  let resolveRun: (artifacts: MemoryArtifact[]) => void = () => {};

  const learningLoop: LearningLoop = {
    async run(run) {
      runs.push(run);
      return await new Promise<MemoryArtifact[]>((resolve) => {
        resolveRun = resolve;
      });
    }
  };

  const { project, goal, task, taskService } = await createReadyTaskService(logger, learningLoop);
  const resultPromise = taskService.failTask(task.id, "agent-one", {
    error: "Compilation failed",
    metadata: {
      stderr: "TS2304"
    }
  });

  const returnedBeforeImmediate = await Promise.race([
    resultPromise.then(() => true),
    waitForImmediate().then(() => false)
  ]);

  assert.equal(returnedBeforeImmediate, true);

  const result = await resultPromise;
  assert.equal(result.status, "ok");

  await waitForImmediate();

  assert.deepEqual(runs, [
    {
      taskId: task.id,
      projectId: project.id,
      projectName: project.name,
      projectDescription: project.description,
      goalId: goal.id,
      goalName: goal.name,
      goalDescription: goal.description,
      taskTitle: task.title,
      taskDescription: task.description,
      summary: "Compilation failed",
      contextDump: null,
      messages: ['Structured metadata:\n{\n  "stderr": "TS2304"\n}'],
      filesTouched: [],
      errors: [],
      commands: [],
      decisions: [],
      outcome: "failure"
    }
  ]);
  assert.ok(!infos.some((message) => message.includes("Learning loop failed")));

  resolveRun([]);
});

test("task service isolates learning loop failures after completion", async () => {
  const { logger, infos } = createTestLogger();
  const learningLoop: LearningLoop = {
    async run() {
      throw new Error("indexer exploded");
    }
  };

  const { task, taskService } = await createReadyTaskService(logger, learningLoop);
  const result = await taskService.completeTask(task.id, "agent-one", {
    summary: "Completed despite downstream failure"
  });

  assert.equal(result.status, "ok");
  assert.equal(result.context?.task?.status, "completed");

  await waitForImmediate();

  assert.ok(
    infos.some(
      (message) =>
        message.includes(`Learning loop failed for task "${task.id}"`) && message.includes("indexer exploded")
    )
  );
});

test("task service preserves completion behavior when no learning loop is configured", async () => {
  const { logger, infos } = createTestLogger();
  const { task, taskService } = await createReadyTaskService(logger);
  const result = await taskService.completeTask(task.id, "agent-one", {
    summary: "Completed without learning"
  });

  assert.equal(result.status, "ok");
  assert.equal(result.context?.task?.status, "completed");

  await waitForImmediate();

  assert.ok(!infos.some((message) => message.includes("Learning loop")));
});
