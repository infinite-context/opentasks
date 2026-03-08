import type { Logger } from "../../infra/logging";
import type { TaskRequest } from "@opentasks/contracts";
import type { TaskListManager } from "../task-list-manager";
import type { TaskOrchestrator } from "./types";

interface CreateTaskOrchestratorParams {
  logger: Logger;
  taskListManager: TaskListManager;
  defaultLeaseDurationSeconds: number;
}

export function createTaskOrchestrator({
  logger,
  taskListManager,
  defaultLeaseDurationSeconds
}: CreateTaskOrchestratorParams): TaskOrchestrator {
  return {
    async prepareTask(request: TaskRequest) {
      logger.step(
        "task-orchestrator",
        "Task orchestrator requests available work from the task list manager."
      );

      const task = await taskListManager.claimNextTask(request.projectId, request.agentName, {
        taskHint: request.taskHint,
        capabilities: request.capabilities,
        leaseDurationSeconds: request.leaseDurationSeconds ?? defaultLeaseDurationSeconds
      });

      if (!task) {
        logger.step(
          "task-orchestrator",
          `Task orchestrator found no available task for project "${request.projectId}".`
        );

        return null;
      }

      logger.step(
        "task-orchestrator",
        `Task orchestrator returns claimed task "${task.id}" directly in phase one.`
      );

      return task;
    }
  };
}
