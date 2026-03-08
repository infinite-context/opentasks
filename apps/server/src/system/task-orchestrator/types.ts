import type { OperationResultDto } from "@opentasks/contracts";
import type { TaskRequest } from "@opentasks/contracts";

export interface TaskOrchestrator {
  prepareTask(request: TaskRequest): Promise<OperationResultDto>;
}
