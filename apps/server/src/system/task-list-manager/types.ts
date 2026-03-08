import type { ClaimedTask } from "@opentasks/contracts";
import type { TaskClaimOptions } from "@opentasks/contracts";

export interface TaskListManager {
  claimNextTask(
    projectId: string,
    goalId: string,
    agentName: string,
    options: TaskClaimOptions
  ): Promise<ClaimedTask | null>;
}
