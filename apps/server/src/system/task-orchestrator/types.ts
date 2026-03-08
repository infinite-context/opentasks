import type { ClaimedTask } from "../../shared/types";
import type { TaskRequest } from "../../shared/dtos";

export interface TaskOrchestrator {
  prepareTask(request: TaskRequest): Promise<ClaimedTask | null>;
}
