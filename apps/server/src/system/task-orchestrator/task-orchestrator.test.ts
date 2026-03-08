import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createTaskOrchestrator } from "./task-orchestrator";
import type { Logger } from "../../infra/logging";
import type { ClaimedTask, GoalRecord, OperationResultDto, ProjectRecord } from "@opentasks/contracts";
import type { TaskClaimOptions, TaskRequest } from "@opentasks/contracts";
import type { GoalService } from "../goal-service";
import type { TaskListManager } from "../task-list-manager";
import type { ValidationService } from "../validation-service";

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
    goalId: "goal_demo",
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

const project: ProjectRecord = {
  id: "demo-project",
  key: "demo-project",
  name: "Demo Project",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const goal: GoalRecord = {
  id: "goal_demo",
  projectId: project.id,
  key: "initial-goal",
  name: "Initial Goal",
  description: "",
  status: "active",
  priority: "P0",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const validationService: ValidationService = {
  async ensureProjectGoals(): Promise<OperationResultDto> {
    return {
      status: "ok",
      message: "ok",
      guidance: [],
      context: {
        project,
        goals: [goal]
      }
    };
  },
  async ensureProject(): Promise<OperationResultDto> {
    return {
      status: "ok",
      message: "ok",
      guidance: [],
      context: { project }
    };
  },
  async ensureGoalInProject(): Promise<OperationResultDto> {
    return {
      status: "ok",
      message: "ok",
      guidance: [],
      context: { project, goal }
    };
  },
  async ensureTask(): Promise<OperationResultDto> {
    throw new Error("not used");
  },
  async ensureTaskInGoal(): Promise<OperationResultDto> {
    throw new Error("not used");
  }
};

const goalService: GoalService = {
  async createGoal() {
    throw new Error("not used");
  },
  async updateGoal() {
    throw new Error("not used");
  },
  async getGoals() {
    throw new Error("not used");
  },
  async resolveNextGoal() {
    return goal;
  },
  async listGoals() {
    return { goals: [goal] };
  }
};

test("task orchestrator returns a claimed task directly in phase one", async () => {
  let capturedOptions: TaskClaimOptions | null = null;

  const taskListManager: TaskListManager = {
    async claimNextTask(
      projectId: string,
      goalId: string,
      agentName: string,
      options: TaskClaimOptions
    ): Promise<ClaimedTask | null> {
      assert.equal(projectId, "demo-project");
      assert.equal(goalId, "goal_demo");
      assert.equal(agentName, "agent-one");
      capturedOptions = options;
      return createClaimedTask({ assignedTo: agentName });
    }
  };

  const orchestrator = createTaskOrchestrator({
    logger,
    validationService,
    goalService,
    taskListManager,
    defaultLeaseDurationSeconds: 900
  });

  const request: TaskRequest = {
    agentName: "agent-one",
    projectId: "demo-project",
    taskHint: "pick the best task"
  };

  const result = await orchestrator.prepareTask(request);

  assert.equal(result.status, "ok");
  assert.match(result.context?.task?.id ?? "", /^task_/);
  assert.deepEqual(capturedOptions, {
    taskHint: "pick the best task",
    capabilities: undefined,
    leaseDurationSeconds: 900
  });
});

test("task orchestrator returns a no_task_available result when no task is available", async () => {
  const taskListManager: TaskListManager = {
    async claimNextTask(): Promise<ClaimedTask | null> {
      return null;
    }
  };

  const orchestrator = createTaskOrchestrator({
    logger,
    validationService,
    goalService,
    taskListManager,
    defaultLeaseDurationSeconds: 300
  });

  const result = await orchestrator.prepareTask({
    agentName: "agent-one",
    projectId: "demo-project"
  });

  assert.equal(result.status, "no_task_available");
});
