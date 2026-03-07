import type { Logger } from "../../infra/logging";
import type { TaskRequest } from "../../shared/types";
import type { ContextHydrator } from "../context-hydrator";
import type { TaskListManager } from "../task-list-manager";
import type { TaskOrchestrator } from "./types";

interface CreateTaskOrchestratorParams {
  logger: Logger;
  taskListManager: TaskListManager;
  contextHydrator: ContextHydrator;
}

export function createTaskOrchestrator({
  logger,
  taskListManager,
  contextHydrator
}: CreateTaskOrchestratorParams): TaskOrchestrator {
  return {
    async prepareTask(request: TaskRequest) {
      logger.step(
        "task-orchestrator",
        "Task orchestrator requests available work from the task list manager."
      );

      const task = await taskListManager.claimNextTask(request.projectId, request.agentName);

      if (!task) {
        logger.step(
          "task-orchestrator",
          `Task orchestrator found no available task for project "${request.projectId}".`
        );

        return null;
      }

      logger.step(
        "task-orchestrator",
        `Task orchestrator passes task \"${task.id}\" to the context hydrator.`
      );

      return contextHydrator.hydrateTask(task);
    }
  };
}
