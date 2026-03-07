import type { TaskRecord } from "../../shared/types";

export interface TaskStore {
  claimNextTask(projectId: string, agentName: string): Promise<TaskRecord | null>;
}
