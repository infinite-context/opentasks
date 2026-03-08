import type { TaskRecord } from "@opentasks/contracts";
import type { HydratedTask } from "@opentasks/contracts";

export interface ContextHydrator {
  hydrateTask(task: TaskRecord): Promise<HydratedTask>;
}
