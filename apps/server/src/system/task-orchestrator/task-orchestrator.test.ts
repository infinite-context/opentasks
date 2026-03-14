import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createTaskOrchestrator } from "./task-orchestrator";
import type { Logger } from "../../infra/logging";
import { operationContextDtoSchema } from "@opentasks/contracts";
import type {
  ClaimedTask,
  ContextPacket,
  GoalRecord,
  OperationResultDto,
  ProjectRecord,
  RetrievedContextItem,
  TaskEvent
} from "@opentasks/contracts";
import type { TaskClaimOptions, TaskRequest } from "@opentasks/contracts";
import type { ContextHydrator } from "../context-hydrator";
import type { GoalService } from "../goal-service";
import type { TaskListManager } from "../task-list-manager";
import type { ValidationService } from "../validation-service";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

function createLoggerSpy() {
  const infoMessages: string[] = [];

  return {
    infoMessages,
    logger: {
      section() {},
      step() {},
      info(_scope: string, message: string) {
        infoMessages.push(message);
      }
    } satisfies Logger
  };
}

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
  description: "Demo project for testing",
  workingDirectory: ".",
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

function createContextPacket(taskId: string): ContextPacket {
  const item: RetrievedContextItem = {
    id: "memory-1",
    kind: "run_note",
    projectId: project.id,
    goalId: goal.id,
    taskId,
    content: "Prior implementation detail",
    summary: "Reusable note from a related run",
    tags: ["testing"],
    score: 0.9
  };

  return {
    taskId,
    items: [item],
    notes: ["Hydrated for testing"]
  };
}

const validationService: ValidationService = {
  async validateCreateProjectInput(): Promise<OperationResultDto> {
    throw new Error("not used");
  },
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
  assert.equal(result.context?.hydratedContext, null);
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

test("task orchestrator adds hydrated context when a context hydrator is configured", async () => {
  const claimedTask = createClaimedTask();
  const hydratedContext = createContextPacket(claimedTask.id);
  const contextHydrator: ContextHydrator = {
    async hydrateTask(task) {
      assert.equal(task.id, claimedTask.id);
      return {
        ...task,
        context: hydratedContext
      };
    }
  };

  const taskListManager: TaskListManager = {
    async claimNextTask(): Promise<ClaimedTask | null> {
      return claimedTask;
    }
  };

  const orchestrator = createTaskOrchestrator({
    logger,
    validationService,
    goalService,
    taskListManager,
    contextHydrator,
    defaultLeaseDurationSeconds: 900
  });

  const result = await orchestrator.prepareTask({
    agentName: "agent-one",
    projectId: project.id
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.context?.hydratedContext, hydratedContext);
  assert.equal(result.context?.task?.id, claimedTask.id);
});

test("task orchestrator logs hydration failures and still returns the claimed task", async () => {
  const { logger: loggerSpy, infoMessages } = createLoggerSpy();
  const claimedTask = createClaimedTask();
  const contextHydrator: ContextHydrator = {
    async hydrateTask() {
      throw new Error("vector lookup unavailable");
    }
  };

  const taskListManager: TaskListManager = {
    async claimNextTask(): Promise<ClaimedTask | null> {
      return claimedTask;
    }
  };

  const orchestrator = createTaskOrchestrator({
    logger: loggerSpy,
    validationService,
    goalService,
    taskListManager,
    contextHydrator,
    defaultLeaseDurationSeconds: 900
  });

  const result = await orchestrator.prepareTask({
    agentName: "agent-one",
    projectId: project.id
  });

  assert.equal(result.status, "ok");
  assert.equal(result.context?.task?.id, claimedTask.id);
  assert.equal(result.context?.hydratedContext, null);
  assert.ok(infoMessages.some((message) => message.includes(`Context hydration failed for task "${claimedTask.id}"`)));
});

test("operation context schema stays aligned with hydrated context and existing DTO fields", () => {
  const claimedTask = createClaimedTask();
  const context: Record<string, unknown> = {
    projectId: project.id,
    project,
    projects: [project],
    goal,
    goals: [goal],
    goalSummary: "Primary goal summary",
    task: claimedTask,
    hydratedContext: createContextPacket(claimedTask.id),
    events: [
      {
        id: "event-1",
        taskId: claimedTask.id,
        projectId: project.id,
        eventType: "task_claimed",
        actorType: "agent",
        actorId: "agent-one",
        payload: {},
        createdAt: "2026-01-01T00:01:00.000Z"
      } satisfies TaskEvent
    ],
    input: {
      key: "demo-project",
      name: "Demo Project",
      description: "Demo project for testing",
      workingDirectory: "."
    },
    field: "workingDirectory",
    resolvedPath: "/tmp/demo"
  };

  assert.deepEqual(operationContextDtoSchema.parse(context), context);
});
