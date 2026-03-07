import type { HydratedTask, TaskRequest } from "../../shared/types";

export interface TaskOrchestrator {
  prepareTask(request: TaskRequest): Promise<HydratedTask>;
}
