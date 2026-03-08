import type { ClaimedTask } from "../../shared/types";
import type { TaskClaimOptions } from "../../shared/dtos";

export interface TaskListManager {
  claimNextTask(
    projectId: string,
    agentName: string,
    options: TaskClaimOptions
  ): Promise<ClaimedTask | null>;
}
