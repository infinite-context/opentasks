import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createTaskOrchestrator } from "./task-orchestrator";
import type { Logger } from "../../infra/logging";
import type { ClaimedTask } from "../../shared/types";
import type { TaskClaimOptions, TaskRequest } from "../../shared/dtos";
import type { TaskListManager } from "../task-list-manager";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

function createClaimedTask(overrides: Partial<ClaimedTask> = {}): ClaimedTask {
  const timestamp = "2026-01-01T00:00:00.000Z";

  return {
    id: `task_${randomUUID().replace(/-/g, "")}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: "demo-project",
    title: "Demo task",
    description: "A task used for unit testing.",
    status: "assigned",
    priority: "P1",
    availableAt: "2026-01-01T00:00:00.000Z",
    assignedTo: "agent-one",
    assignedAt: "2026-01-01T00:01:00.000Z",
    leaseExpiresAt: "2026-01-01T00:16:00.000Z",
    startedAt: null,
    completedAt: null,
    failedAt: null,
    blockedReason: null,
    lastError: null,
    source: "manual",
    metadata: {},
    dependencyIds: [],
    ...overrides
  };
}

test("task orchestrator returns a claimed task directly in phase one", async () => {
  let capturedOptions: TaskClaimOptions | null = null;

  const taskListManager: TaskListManager = {
    async claimNextTask(
      projectId: string,
      agentName: string,
      options: TaskClaimOptions
    ): Promise<ClaimedTask | null> {
      assert.equal(projectId, "demo-project");
      assert.equal(agentName, "agent-one");
      capturedOptions = options;
      return createClaimedTask({ assignedTo: agentName });
    }
  };

  const orchestrator = createTaskOrchestrator({
    logger,
    taskListManager,
    defaultLeaseDurationSeconds: 900
  });

  const request: TaskRequest = {
    agentName: "agent-one",
    projectId: "demo-project",
    taskHint: "pick the best task"
  };

  const claimedTask = await orchestrator.prepareTask(request);

  assert.ok(claimedTask);
  assert.match(claimedTask.id, /^task_/);
  assert.deepEqual(capturedOptions, {
    taskHint: "pick the best task",
    capabilities: undefined,
    leaseDurationSeconds: 900
  });
});

test("task orchestrator returns null when no task is available", async () => {
  const taskListManager: TaskListManager = {
    async claimNextTask(): Promise<ClaimedTask | null> {
      return null;
    }
  };

  const orchestrator = createTaskOrchestrator({
    logger,
    taskListManager,
    defaultLeaseDurationSeconds: 300
  });

  const claimedTask = await orchestrator.prepareTask({
    agentName: "agent-one",
    projectId: "demo-project"
  });

  assert.equal(claimedTask, null);
});
