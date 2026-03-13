import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { CreateProjectInput } from "@opentasks/contracts";
import type { Logger } from "../../infra/logging";
import type { CoordinationStore } from "../../infra/storage/task-store";
import { issueResult, okResult } from "../service-result";
import type { ValidationService } from "./types";

interface CreateValidationServiceParams {
  logger: Logger;
  store: CoordinationStore;
  projectPath?: string;
}

export function createValidationService({
  logger,
  store,
  projectPath
}: CreateValidationServiceParams): ValidationService {
  return {
    async validateCreateProjectInput(input: CreateProjectInput, basePath?: string) {
      const trimmedDesc = input.description?.trim() ?? "";
      const trimmedDir = input.workingDirectory?.trim() ?? "";

      if (!trimmedDesc) {
        logger.step("validation-service", "Project creation rejected: description is required.");
        return issueResult(
          "invalid_input",
          "Project description is required.",
          ["Provide a non-empty description when creating a project."],
          { field: "description" }
        );
      }

      if (!trimmedDir) {
        logger.step("validation-service", "Project creation rejected: working directory is required.");
        return issueResult(
          "invalid_input",
          "Project working directory is required.",
          ["Provide a non-empty working directory path when creating a project."],
          { field: "workingDirectory" }
        );
      }

      const resolveBase = basePath ?? projectPath ?? process.cwd();
      const resolvedPath = resolve(resolveBase, trimmedDir);
      if (!existsSync(resolvedPath)) {
        logger.step("validation-service", `Project creation rejected: working directory does not exist: ${resolvedPath}`);
        return issueResult(
          "invalid_input",
          `Working directory does not exist: ${trimmedDir}`,
          ["Provide a path to an existing directory on the server."],
          { field: "workingDirectory", resolvedPath }
        );
      }
      const stat = statSync(resolvedPath);
      if (!stat.isDirectory()) {
        logger.step("validation-service", `Project creation rejected: path is not a directory: ${resolvedPath}`);
        return issueResult(
          "invalid_input",
          `Working directory is not a directory: ${trimmedDir}`,
          ["Provide a path to an existing directory on the server."],
          { field: "workingDirectory", resolvedPath }
        );
      }

      return okResult("Project input is valid.", { input: { ...input, description: trimmedDesc, workingDirectory: resolvedPath } });
    },
    async ensureProject(projectRef) {
      const project = await store.getProject(projectRef);
      if (project) {
        return okResult(`Project "${project.name}" is available.`, { project });
      }

      logger.step("validation-service", `Project "${projectRef}" was not found.`);
      return issueResult(
        "project_not_found",
        `Project "${projectRef}" was not found.`,
        ["Use start_session to create or find a project before creating or requesting goals and tasks."],
        {
          projects: await store.listProjects(100)
        }
      );
    },
    async ensureProjectGoals(projectRef) {
      const projectResult = await this.ensureProject(projectRef);
      if (projectResult.status !== "ok" || !projectResult.context?.project) {
        return projectResult;
      }

      const goals = await store.listGoals(projectResult.context.project.id);
      if (goals.length === 0) {
        logger.step("validation-service", `Project "${projectResult.context.project.id}" has no goals.`);
        return issueResult(
          "missing_goals",
          `Project "${projectResult.context.project.name}" does not have any goals yet.`,
          ["Create a goal with create_goal before creating or requesting tasks."],
          {
            project: projectResult.context.project,
            goals
          }
        );
      }

      return okResult(
        `Project "${projectResult.context.project.name}" has ${goals.length} goal(s).`,
        {
          project: projectResult.context.project,
          goals
        }
      );
    },
    async ensureGoalInProject(projectRef, goalId) {
      const projectGoalsResult = await this.ensureProjectGoals(projectRef);
      if (projectGoalsResult.status !== "ok" || !projectGoalsResult.context?.project) {
        return projectGoalsResult;
      }

      const goal = await store.getGoal(goalId);
      if (!goal) {
        return issueResult(
          "goal_not_found",
          `Goal "${goalId}" was not found for project "${projectGoalsResult.context.project.name}".`,
          ["Call get_goals for the project and choose one of the returned goal ids, or create a new goal first."],
          {
            project: projectGoalsResult.context.project,
            goals: projectGoalsResult.context.goals ?? []
          }
        );
      }

      if (goal.projectId !== projectGoalsResult.context.project.id) {
        return issueResult(
          "goal_project_mismatch",
          `Goal "${goalId}" does not belong to project "${projectGoalsResult.context.project.name}".`,
          ["Use a goal that belongs to the selected project, or call get_goals for that project first."],
          {
            project: projectGoalsResult.context.project,
            goal,
            goals: projectGoalsResult.context.goals ?? []
          }
        );
      }

      return okResult(
        `Goal "${goal.name}" belongs to project "${projectGoalsResult.context.project.name}".`,
        {
          project: projectGoalsResult.context.project,
          goal,
          goals: projectGoalsResult.context.goals ?? []
        }
      );
    },
    async ensureTask(taskId) {
      const task = await store.getTaskById(taskId);
      if (!task) {
        return issueResult("task_not_found", `Task "${taskId}" was not found.`);
      }

      return okResult(`Task "${task.id}" is available.`, { task });
    },
    async ensureTaskInGoal(taskId, goalId) {
      const taskResult = await this.ensureTask(taskId);
      if (taskResult.status !== "ok" || !taskResult.context?.task) {
        return taskResult;
      }

      if (taskResult.context.task.goalId !== goalId) {
        const goal = await store.getGoal(goalId);
        return issueResult(
          "task_goal_mismatch",
          `Task "${taskId}" does not belong to goal "${goalId}".`,
          ["Use a task that belongs to the requested goal, or fetch the goal list and task details again."],
          {
            task: taskResult.context.task,
            goal
          }
        );
      }

      return okResult(`Task "${taskId}" belongs to goal "${goalId}".`, {
        task: taskResult.context.task
      });
    }
  };
}
