import type { TaskRecord } from "../../shared/types";
import type { HydratedTask } from "../../shared/dtos";

export interface ContextHydrator {
  hydrateTask(task: TaskRecord): Promise<HydratedTask>;
}
