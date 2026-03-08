import type { TaskRecord } from "../../shared/types";

export interface VectorSearchEngine {
  searchTaskContext(task: TaskRecord): Promise<string[]>;
}
