import type { Logger } from "../../infra/logging";
import type { OperationResultDto } from "@opentasks/contracts";
import type { TaskRequest } from "@opentasks/contracts";
import type { TaskOrchestrator } from "../task-orchestrator";

export interface ExecutionLoop {
  run(request: TaskRequest): Promise<OperationResultDto>;
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
    async run(request: TaskRequest): Promise<OperationResultDto> {
      logger.section("Execution Loop");
      logger.step("execution-loop", "Execution loop forwards the task request to the task orchestrator.");
      return taskOrchestrator.prepareTask(request);
    }
  };
}
