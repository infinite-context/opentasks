import type { Logger } from "../../infra/logging";
import type { ProjectStore } from "../../infra/storage/task-store";
import type { CreateProjectInput } from "@opentasks/contracts";
import { okResult } from "../service-result";
import type { ProjectService } from "./types";

interface CreateProjectServiceParams {
  logger: Logger;
  projectStore: ProjectStore;
}

export function createProjectService({
  logger,
  projectStore
}: CreateProjectServiceParams): ProjectService {
  return {
    async createProject(input: CreateProjectInput) {
      logger.step("project-service", `Creating project "${input.key}".`);
      const project = await projectStore.createProject(input);
      return okResult(`Project "${project.name}" is available for use.`, { project });
    },
    async getProject(projectRef: string) {
      logger.step("project-service", `Loading project "${projectRef}".`);
      const project = await projectStore.getProject(projectRef);

      if (!project) {
        return {
          status: "project_not_found",
          message: `Project "${projectRef}" was not found.`,
          guidance: ["Create a project with create_project first."],
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
