import type { RetrievedContextItem, TaskRecord } from "@opentasks/contracts";

export interface VectorSearchEngine {
  searchTaskContext(task: TaskRecord): Promise<RetrievedContextItem[]>;
}
