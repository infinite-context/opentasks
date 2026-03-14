import type { Logger } from "../../infra/logging";
import type { TaskStore } from "../../infra/storage/task-store";
import type {
  CreateTaskInput,
  OperationResultDto,
  TaskCompletion,
  TaskFailure,
  TaskRelease
} from "@opentasks/contracts";
import { issueResult, okResult } from "../service-result";
import type { LearningLoop } from "../learning-loop";
import type { ValidationService } from "../validation-service";

export interface TaskService {
  createTask(input: CreateTaskInput): Promise<OperationResultDto>;
  claimTaskById(taskId: string, agentName: string, leaseDurationSeconds?: number): Promise<OperationResultDto>;
  startTask(taskId: string, agentName: string): Promise<OperationResultDto>;
  completeTask(taskId: string, agentName: string, completion: TaskCompletion): Promise<OperationResultDto>;
  failTask(taskId: string, agentName: string, failure: TaskFailure): Promise<OperationResultDto>;
  releaseTask(taskId: string, agentName: string, release: TaskRelease): Promise<OperationResultDto>;
  renewTaskLease(taskId: string, agentName: string, leaseDurationSeconds: number): Promise<OperationResultDto>;
  getTask(taskId: string): Promise<OperationResultDto>;
}

interface CreateTaskServiceParams {
  logger: Logger;
  taskStore: TaskStore;
  validationService: ValidationService;
  defaultLeaseDurationSeconds: number;
  learningLoop?: LearningLoop | null;
}

export function createTaskService({
  logger,
  taskStore,
  validationService,
  defaultLeaseDurationSeconds,
  learningLoop = null
}: CreateTaskServiceParams): TaskService {
  return {
    async createTask(input: CreateTaskInput): Promise<OperationResultDto> {
      logger.step("task-service", `Creating task "${input.title}" in goal "${input.goalId}".`);
      const goalValidation = await validationService.ensureGoalInProject(input.projectId, input.goalId);
      if (goalValidation.status !== "ok") {
        return goalValidation;
      }

      const task = await taskStore.createTask(input);
      if (!task) {
        return issueResult(
          "goal_not_found",
          `Task "${input.title}" could not be created because the goal or project context is invalid.`,
          ["Verify the project and goal pair, then retry create_task."]
        );
      }

      return okResult(`Created task ${task.id}: "${task.title}".`, {
        project: goalValidation.context?.project,
        goal: goalValidation.context?.goal,
        task
      });
    },
    async claimTaskById(
      taskId: string,
      agentName: string,
      leaseDurationSeconds?: number
    ): Promise<OperationResultDto> {
      logger.step("task-service", `Claiming task "${taskId}" by id.`);
      const validationResult = await validationService.ensureTask(taskId);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const task = await taskStore.claimTaskById(taskId, agentName, {
        leaseDurationSeconds:
          leaseDurationSeconds && leaseDurationSeconds > 0
            ? leaseDurationSeconds
            : defaultLeaseDurationSeconds
      });

      if (!task) {
        return issueResult(
          "invalid_transition",
          `Task ${taskId} could not be claimed.`,
          [
            "Make sure the task is available, dependency-ready, and belongs to an active goal before calling claim_task_by_id."
          ],
          validationResult.context
        );
      }

      return okResult(`Claimed task ${task.id} for ${task.assignedTo}.`, { task });
    },
    async startTask(taskId: string, agentName: string): Promise<OperationResultDto> {
      logger.step("task-service", `Starting task "${taskId}".`);
      const validationResult = await validationService.ensureTask(taskId);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const task = await taskStore.markTaskInProgress(taskId, agentName);
      if (!task) {
        return issueResult(
          "invalid_transition",
          `Task ${taskId} could not be started.`,
          ["Make sure the task is assigned to the requesting agent before calling start_task."],
          validationResult.context
        );
      }

      return okResult(`Task ${task.id} is now in progress.`, { task });
    },
    async completeTask(taskId: string, agentName: string, completion: TaskCompletion): Promise<OperationResultDto> {
      logger.step("task-service", `Completing task "${taskId}".`);
      const validationResult = await validationService.ensureTask(taskId);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const task = await taskStore.completeTask(taskId, agentName, completion);
      if (!task) {
        return issueResult(
          "invalid_transition",
          `Task ${taskId} could not be completed.`,
          ["Make sure the task is assigned to the requesting agent before calling complete_task."],
          validationResult.context
        );
      }

      if (learningLoop) {
        void Promise.resolve()
          .then(() =>
            learningLoop.run({
              taskId: task.id,
              projectId: task.projectId,
              summary: completion.summary,
              outcome: "success"
            })
          )
          .catch((error: unknown) => {
            logger.info(
              "task-service",
              `Learning loop failed for task "${task.id}": ${error instanceof Error ? error.message : String(error)}`
            );
          });
      }

      return okResult(`Task ${task.id} completed.`, { task });
    },
    async failTask(taskId: string, agentName: string, failure: TaskFailure): Promise<OperationResultDto> {
      logger.step("task-service", `Failing task "${taskId}".`);
      const validationResult = await validationService.ensureTask(taskId);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const task = await taskStore.failTask(taskId, agentName, failure);
      if (!task) {
        return issueResult(
          "invalid_transition",
          `Task ${taskId} could not be marked as failed.`,
          ["Make sure the task is assigned to the requesting agent before calling fail_task."],
          validationResult.context
        );
      }

      return okResult(`Task ${task.id} marked as failed.`, { task });
    },
    async releaseTask(taskId: string, agentName: string, release: TaskRelease): Promise<OperationResultDto> {
      logger.step("task-service", `Releasing task "${taskId}".`);
      const validationResult = await validationService.ensureTask(taskId);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const task = await taskStore.releaseTask(taskId, agentName, release);
      if (!task) {
        return issueResult(
          "invalid_transition",
          `Task ${taskId} could not be released.`,
          ["Make sure the task is assigned to the requesting agent before calling release_task."],
          validationResult.context
        );
      }

      return okResult(`Task ${task.id} released back to the queue.`, { task });
    },
    async renewTaskLease(taskId: string, agentName: string, leaseDurationSeconds: number): Promise<OperationResultDto> {
      logger.step("task-service", `Renewing lease for task "${taskId}".`);
      const validationResult = await validationService.ensureTask(taskId);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const task = await taskStore.renewTaskLease(
        taskId,
        agentName,
        leaseDurationSeconds > 0 ? leaseDurationSeconds : defaultLeaseDurationSeconds
      );
      if (!task) {
        return issueResult(
          "invalid_transition",
          `Task ${taskId} lease could not be renewed.`,
          ["Make sure the task is assigned to the requesting agent before calling heartbeat_task."],
          validationResult.context
        );
      }

      return okResult(`Lease renewed for task ${task.id}.`, { task });
    },
    async getTask(taskId: string): Promise<OperationResultDto> {
      logger.step("task-service", `Loading task "${taskId}".`);
      const validationResult = await validationService.ensureTask(taskId);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const events = await taskStore.listTaskEvents(taskId);
      return okResult(`Loaded task ${taskId} with ${events.length} lifecycle event(s).`, {
        task: validationResult.context?.task ?? null,
        events
      });
    }
  };
}
