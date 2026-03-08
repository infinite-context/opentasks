import type { Logger } from "../../infra/logging";
import type { TaskRequest } from "@opentasks/contracts";
import { issueResult, okResult } from "../service-result";
import type { GoalService } from "../goal-service";
import type { TaskListManager } from "../task-list-manager";
import type { ValidationService } from "../validation-service";
import type { TaskOrchestrator } from "./types";

interface CreateTaskOrchestratorParams {
  logger: Logger;
  validationService: ValidationService;
  goalService: GoalService;
  taskListManager: TaskListManager;
  defaultLeaseDurationSeconds: number;
}

export function createTaskOrchestrator({
  logger,
  validationService,
  goalService,
  taskListManager,
  defaultLeaseDurationSeconds
}: CreateTaskOrchestratorParams): TaskOrchestrator {
  return {
    async prepareTask(request: TaskRequest) {
      logger.step(
        "task-orchestrator",
        "Task orchestrator validates project state before selecting a goal."
      );

      const projectValidation = await validationService.ensureProjectGoals(request.projectId);
      if (projectValidation.status !== "ok" || !projectValidation.context?.project) {
        return projectValidation;
      }

      const goal = await goalService.resolveNextGoal(projectValidation.context.project.id);
      if (!goal) {
        logger.step(
          "task-orchestrator",
          `Task orchestrator found no claimable goal for project "${projectValidation.context.project.id}".`
        );
        return issueResult(
          "no_task_available",
          `No task is currently available for project "${projectValidation.context.project.name}".`,
          ["Create a task in one of the project's goals, or wait until a blocked dependency becomes available."],
          projectValidation.context
        );
      }

      const task = await taskListManager.claimNextTask(projectValidation.context.project.id, goal.id, request.agentName, {
        taskHint: request.taskHint,
        capabilities: request.capabilities,
        leaseDurationSeconds: request.leaseDurationSeconds ?? defaultLeaseDurationSeconds
      });

      if (!task) {
        logger.step(
          "task-orchestrator",
          `Task orchestrator found no available task for goal "${goal.id}".`
        );

        return issueResult(
          "no_task_available",
          `No task is currently available for project "${projectValidation.context.project.name}".`,
          ["Create a task in one of the project's goals, or wait until a blocked dependency becomes available."],
          {
            ...projectValidation.context,
            goal
          }
        );
      }

      logger.step(
        "task-orchestrator",
        `Task orchestrator returns claimed task "${task.id}" from goal "${goal.id}".`
      );

      return okResult(`Claimed task ${task.id} for ${task.assignedTo}.`, {
        ...projectValidation.context,
        goal,
        task
      });
    }
  };
}
