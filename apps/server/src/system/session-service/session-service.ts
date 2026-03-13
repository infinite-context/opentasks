import { dirname, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { Logger } from "../../infra/logging";
import type { GoalStore, ProjectStore } from "../../infra/storage/task-store";
import type { CreateProjectInput, GoalRecord } from "@opentasks/contracts";
import { issueResult, okResult } from "../service-result";
import type { SessionService } from "./types";
import type { ValidationService } from "../validation-service";

const OPEN_GOAL_STATUSES = ["active", "paused"] as const;

interface CreateSessionServiceParams {
  logger: Logger;
  projectStore: ProjectStore;
  goalStore: GoalStore;
  validationService: ValidationService;
  projectPath?: string;
}

/**
 * Derives a display name from a directory name.
 * - "example-project" / "Example_Project" -> "Example Project" (split by - or _, capitalize, join with space)
 * - "exampleProject" / "ExampleProject" -> "ExampleProject" (camelCase: keep as-is, capitalize first)
 */
function deriveNameFromDirectoryName(dirName: string): string {
  if (!dirName) return "Project";

  // Check if it contains - or _ (kebab/snake case)
  if (/[-_]/.test(dirName)) {
    return dirName
      .split(/[-_]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  // CamelCase: capitalize first letter
  return dirName.charAt(0).toUpperCase() + dirName.slice(1);
}

/**
 * Derives a key from a directory name. Always lowercase with dashes.
 * - "example_project" -> "example-project"
 * - "ExampleProject" -> "exampleproject"
 * - "example-project" -> "example-project"
 */
function deriveKeyFromDirectoryName(dirName: string): string {
  if (!dirName) return "project";
  return dirName
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Returns parent directory paths from the given path up to (but not including) the drive root.
 */
function getParentDirectories(path: string): string[] {
  const parents: string[] = [];
  let current = resolve(path);

  while (true) {
    const parent = dirname(current);
    if (parent === current) break; // Reached root
    parents.push(parent);
    current = parent;
  }

  return parents;
}

function isOpenGoal(goal: GoalRecord): boolean {
  return OPEN_GOAL_STATUSES.includes(goal.status as (typeof OPEN_GOAL_STATUSES)[number]);
}

export function createSessionService({
  logger,
  projectStore,
  goalStore,
  validationService,
  projectPath = process.cwd()
}: CreateSessionServiceParams): SessionService {
  const buildSessionResult = async (
    message: string,
    projectId: string,
    project: { id: string; name: string }
  ) => {
    const allGoals = await goalStore.listGoals(projectId);
    const openGoals = allGoals.filter(isOpenGoal);
    const goalSummary = openGoals.length > 0 ? openGoals.map((g) => g.name).join(", ") : undefined;
    const enhancedMessage = goalSummary != null ? `${message} Open goals: ${goalSummary}` : message;
    return okResult(enhancedMessage, {
      projectId,
      project,
      ...(openGoals.length > 0 && { goals: openGoals, goalSummary })
    });
  };

  return {
    async startSession(workingDirectory: string) {
      const trimmed = workingDirectory?.trim() ?? "";
      if (!trimmed) {
        return issueResult(
          "invalid_input",
          "Working directory is required.",
          ["Provide a non-empty working directory path."]
        );
      }

      const resolvedPath = resolve(projectPath, trimmed);
      if (!existsSync(resolvedPath)) {
        return issueResult(
          "invalid_input",
          `Working directory does not exist: ${trimmed}`,
          ["Provide a path to an existing directory."]
        );
      }
      const stat = statSync(resolvedPath);
      if (!stat.isDirectory()) {
        return issueResult(
          "invalid_input",
          `Path is not a directory: ${trimmed}`,
          ["Provide a path to an existing directory."]
        );
      }

      // 1. Check exact match
      let project = await projectStore.getProjectByWorkingDirectory(resolvedPath);
      if (project) {
        logger.step("session-service", `Found existing project for ${resolvedPath}.`);
        return buildSessionResult(
          `Session started. Project "${project.name}" is available.`,
          project.id,
          project
        );
      }

      // 2. Check parent directories
      const parents = getParentDirectories(resolvedPath);
      for (const parentPath of parents) {
        project = await projectStore.getProjectByWorkingDirectory(parentPath);
        if (project) {
          logger.step("session-service", `Found parent project for ${resolvedPath} at ${parentPath}.`);
          return buildSessionResult(
            `Session started. Project "${project.name}" is available.`,
            project.id,
            project
          );
        }
      }

      // 3. Create new project
      const segments = resolvedPath.split(/[/\\]/).filter(Boolean);
      const dirName = segments.pop() ?? "project";
      const baseName = dirName || "project";
      const baseKey = deriveKeyFromDirectoryName(baseName);
      const name = deriveNameFromDirectoryName(baseName);

      // Ensure unique key
      let candidateKey = baseKey;
      let suffix = 2;
      const existingProjects = await projectStore.listProjects(1000);
      while (existingProjects.some((p) => p.key === candidateKey)) {
        candidateKey = `${baseKey}-${suffix}`;
        suffix++;
      }

      const input: CreateProjectInput = {
        key: candidateKey,
        name,
        description: `Project rooted at ${resolvedPath}`,
        workingDirectory: resolvedPath
      };

      const validationResult = await validationService.validateCreateProjectInput(input, projectPath);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const validatedInput = validationResult.context?.input ?? input;
      logger.step("session-service", `Creating project "${validatedInput.key}" for ${resolvedPath}.`);
      const created = await projectStore.createProject(validatedInput);
      return buildSessionResult(
        `Session started. Project "${created.name}" was created.`,
        created.id,
        created
      );
    }
  };
}
