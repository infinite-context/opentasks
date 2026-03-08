import type {
  CreateGoalInput,
  GoalRecord,
  GoalListDto,
  OperationResultDto,
  UpdateGoalInput
} from "@opentasks/contracts";

export interface GoalService {
  createGoal(input: CreateGoalInput): Promise<OperationResultDto>;
  updateGoal(input: UpdateGoalInput): Promise<OperationResultDto>;
  getGoals(projectRef: string): Promise<OperationResultDto>;
  resolveNextGoal(projectRef: string): Promise<GoalRecord | null>;
  listGoals(projectRef: string): Promise<GoalListDto>;
}
