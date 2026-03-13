import type {
  CreateProjectInput,
  OperationResultDto,
  ProjectListDto,
  UpdateProjectInput
} from "@opentasks/contracts";

export interface ProjectService {
  createProject(input: CreateProjectInput): Promise<OperationResultDto>;
  updateProject(input: UpdateProjectInput): Promise<OperationResultDto>;
  getProject(projectRef: string): Promise<OperationResultDto>;
  listProjects(limit?: number): Promise<ProjectListDto>;
}
