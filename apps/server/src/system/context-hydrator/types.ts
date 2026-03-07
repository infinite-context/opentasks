import type { HydratedTask, TaskRecord } from "../../shared/types";

export interface ContextHydrator {
  hydrateTask(task: TaskRecord): Promise<HydratedTask>;
}
