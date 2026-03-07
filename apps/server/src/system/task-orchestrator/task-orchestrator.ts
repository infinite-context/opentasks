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

      const task = await taskListManager.selectAvailableTask(request.projectId);

      logger.step(
        "task-orchestrator",
        `Task orchestrator passes task \"${task.id}\" to the context hydrator.`
      );

      return contextHydrator.hydrateTask(task);
    }
  };
}
