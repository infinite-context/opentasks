import type { OperationResultDto } from "@opentasks/contracts";

export interface ValidationService {
  ensureProject(projectRef: string): Promise<OperationResultDto>;
  ensureProjectGoals(projectRef: string): Promise<OperationResultDto>;
  ensureGoalInProject(projectRef: string, goalId: string): Promise<OperationResultDto>;
  ensureTask(taskId: string): Promise<OperationResultDto>;
  ensureTaskInGoal(taskId: string, goalId: string): Promise<OperationResultDto>;
}
