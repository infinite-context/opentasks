import type { TaskRecord } from "../../shared/types";

export interface TaskListManager {
  selectAvailableTask(projectId: string): Promise<TaskRecord>;
}
