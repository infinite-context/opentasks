import type { Logger } from "../../infra/logging";
import type { ClaimedTask } from "@opentasks/contracts";
import type { TaskRequest } from "@opentasks/contracts";
import type { TaskOrchestrator } from "../task-orchestrator";

export interface ExecutionLoop {
  run(request: TaskRequest): Promise<ClaimedTask | null>;
}

interface CreateExecutionLoopParams {
  logger: Logger;
  taskOrchestrator: TaskOrchestrator;
}

export function createExecutionLoop({
  logger,
  taskOrchestrator
}: CreateExecutionLoopParams): ExecutionLoop {
  return {
    async run(request: TaskRequest): Promise<ClaimedTask | null> {
      logger.section("Execution Loop");
      logger.step("execution-loop", "Execution loop forwards the task request to the task orchestrator.");
      const claimedTask = await taskOrchestrator.prepareTask(request);

      if (!claimedTask) {
        logger.step("execution-loop", "Execution loop stops because no task was available.");
        return null;
      }

      logger.step(
        "execution-loop",
        `Execution loop completes after claiming task "${claimedTask.id}" for the external agent.`
      );

      return claimedTask;
    }
  };
}
