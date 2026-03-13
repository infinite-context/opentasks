import type { Logger } from "../../infra/logging";
import type { ProjectStore } from "../../infra/storage/task-store";
import type { CreateProjectInput, UpdateProjectInput } from "@opentasks/contracts";
import { okResult } from "../service-result";
import type { ProjectService } from "./types";
import type { ValidationService } from "../validation-service";

interface CreateProjectServiceParams {
  logger: Logger;
  projectStore: ProjectStore;
  validationService: ValidationService;
}

export function createProjectService({
  logger,
  projectStore,
  validationService
}: CreateProjectServiceParams): ProjectService {
  return {
    async createProject(input: CreateProjectInput) {
      const validationResult = await validationService.validateCreateProjectInput(input);
      if (validationResult.status !== "ok") {
        return validationResult;
      }

      const validatedInput = validationResult.context?.input ?? input;
      logger.step("project-service", `Creating project "${validatedInput.key}".`);
      const project = await projectStore.createProject(validatedInput);
      return okResult(`Project "${project.name}" is available for use.`, { project });
    },
    async updateProject(input: UpdateProjectInput) {
      const project = await projectStore.getProject(input.projectId);
      if (!project) {
        return {
          status: "project_not_found" as const,
          message: `Project "${input.projectId}" was not found.`,
          guidance: ["Use start_session or get_project to find a valid project id."],
          context: {
            projects: await projectStore.listProjects(100)
          }
        };
      }
      logger.step("project-service", `Updating project "${project.key}" description.`);
      const updated = await projectStore.updateProject(input);
      return okResult(`Project "${updated!.name}" description updated.`, { project: updated });
    },
    async getProject(projectRef: string) {
      logger.step("project-service", `Loading project "${projectRef}".`);
      const project = await projectStore.getProject(projectRef);

      if (!project) {
        return {
          status: "project_not_found",
          message: `Project "${projectRef}" was not found.`,
          guidance: ["Use start_session to create or find a project for your working directory."],
          context: {
            projects: await projectStore.listProjects(100)
          }
        };
      }

      return okResult(`Loaded project "${project.name}".`, { project });
    },
    async listProjects(limit?: number) {
      logger.step("project-service", "Listing projects.");
      return {
        projects: await projectStore.listProjects(limit)
      };
    }
  };
}
