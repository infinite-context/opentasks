import type {
  CreateProjectInput,
  OperationResultDto,
  ProjectListDto
} from "@opentasks/contracts";

export interface ProjectService {
  createProject(input: CreateProjectInput): Promise<OperationResultDto>;
  getProject(projectRef: string): Promise<OperationResultDto>;
  listProjects(limit?: number): Promise<ProjectListDto>;
}
