import type { TaskRecord } from "@opentasks/contracts";

export interface VectorSearchEngine {
  searchTaskContext(task: TaskRecord): Promise<string[]>;
}
