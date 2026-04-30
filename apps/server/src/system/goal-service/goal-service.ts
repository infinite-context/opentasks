import type { Logger } from "../../infra/logging";
import type { GoalStore, TaskStore } from "../../infra/storage/task-store";
import type { CreateGoalInput, GoalRecord, UpdateGoalInput } from "@opentasks/contracts";
import { issueResult, okResult } from "../service-result";
import type { ValidationService } from "../validation-service";
import type { GoalService } from "./types";

interface CreateGoalServiceParams {
  logger: Logger;
  goalStore: GoalStore;
  taskStore: TaskStore;
  validationService: ValidationService;
}

export function createGoalService({
  logger,
  goalStore,
  taskStore,
  validationService
}: CreateGoalServiceParams): GoalService {
  return {
    async createGoal(input: CreateGoalInput) {
      logger.step("goal-service", `Creating goal "${input.key}" in project "${input.projectId}".`);
      const projectResult = await validationService.ensureProject(input.projectId);
      if (projectResult.status !== "ok" || !projectResult.context?.project) {
        return projectResult;
      }

      const goal = await goalStore.createGoal(input);
      if (!goal) {
        return issueResult(
          "project_not_found",
          `Project "${input.projectId}" was not found.`,
          ["Use start_session to create or find a project first."]
        );
      }

      return okResult(
        `Goal "${goal.name}" [${goal.id}] is available for project "${projectResult.context.project.name}".`,
        {
          project: projectResult.context.project,
          goal
        }
      );
    },
    async updateGoal(input: UpdateGoalInput) {
      logger.step("goal-service", `Updating goal "${input.goalId}".`);

      if (input.projectId) {
        const validationResult = await validationService.ensureGoalInProject(input.projectId, input.goalId);
        if (validationResult.status !== "ok") {
          return validationResult;
        }
      }

      const goal = await goalStore.updateGoal(input);
      if (!goal) {
        return issueResult(
          "goal_not_found",
          `Goal "${input.goalId}" was not found.`,
          ["Call get_goals for the target project or create a goal first."]
        );
      }

      return okResult(`Updated goal "${goal.name}".`, { goal });
    },
    async getGoals(projectRef: string) {
      logger.step("goal-service", `Loading goals for project "${projectRef}".`);
      const validationResult = await validationService.ensureProjectGoals(projectRef);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const goals = validationResult.context?.goals ?? [];
      const roster =
        goals.length === 0 ? "" : `: ${goals.map((goal) => `"${goal.name}" [${goal.id}]`).join("; ")}`;

      return okResult(`Loaded ${goals.length} goal(s)${roster}.`, validationResult.context);
    },
    async resolveNextGoal(projectRef: string): Promise<GoalRecord | null> {
      const validationResult = await validationService.ensureProjectGoals(projectRef);
      if (validationResult.status !== "ok" || !validationResult.context?.project) {
        return null;
      }

      const goals = (validationResult.context.goals ?? []).filter((goal) => goal.status === "active");
      if (goals.length === 0) {
        return null;
      }

      const tasks = await taskStore.listTasks({ projectId: validationResult.context.project.id });
      const tasksById = new Map(tasks.map((task) => [task.id, task]));

      const isClaimable = (goal: GoalRecord) =>
        tasks.some((task) => {
          const availableAt = task.availableAt ? new Date(task.availableAt).getTime() : 0;
          return (
            task.goalId === goal.id &&
            task.status === "available" &&
            availableAt <= Date.now() &&
            task.dependencyIds.every((dependencyId) => tasksById.get(dependencyId)?.status === "completed")
          );
        });

      return goals.find(isClaimable) ?? null;
    },
    async listGoals(projectRef: string) {
      return {
        goals: await goalStore.listGoals(projectRef)
      };
    }
  };
}
