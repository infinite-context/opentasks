import type {
  ClaimedTask,
  GoalRecord,
  ProjectRecord,
  TaskEvent,
  TaskRecord
} from "@opentasks/contracts";
import type {
  CreateGoalInput,
  CreateProjectInput,
  CreateTaskInput,
  TaskClaimOptions,
  TaskCompletion,
  TaskFailure,
  TaskQueryFilters,
  TaskRelease,
  UpdateGoalInput,
  UpdateProjectInput
} from "@opentasks/contracts";

export interface ProjectStore {
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  updateProject(input: UpdateProjectInput): Promise<ProjectRecord | null>;
  getProject(projectId: string): Promise<ProjectRecord | null>;
  getProjectByWorkingDirectory(workingDirectory: string): Promise<ProjectRecord | null>;
  listProjects(limit?: number): Promise<ProjectRecord[]>;
}

export interface GoalStore {
  createGoal(input: CreateGoalInput): Promise<GoalRecord | null>;
  updateGoal(input: UpdateGoalInput): Promise<GoalRecord | null>;
  getGoal(goalId: string): Promise<GoalRecord | null>;
  listGoals(projectId: string): Promise<GoalRecord[]>;
}

export interface TaskStore {
  createTask(input: CreateTaskInput): Promise<TaskRecord | null>;
  claimNextTask(
    projectId: string,
    goalId: string,
    agentName: string,
    options: TaskClaimOptions
  ): Promise<ClaimedTask | null>;
  claimTaskById(
    taskId: string,
    agentName: string,
    options: TaskClaimOptions
  ): Promise<ClaimedTask | null>;
  getTaskById(taskId: string): Promise<TaskRecord | null>;
  listTasks(filters?: TaskQueryFilters): Promise<TaskRecord[]>;
  markTaskInProgress(taskId: string, agentName: string): Promise<TaskRecord | null>;
  completeTask(taskId: string, agentName: string, completion: TaskCompletion): Promise<TaskRecord | null>;
  failTask(taskId: string, agentName: string, failure: TaskFailure): Promise<TaskRecord | null>;
  releaseTask(taskId: string, agentName: string, release: TaskRelease): Promise<TaskRecord | null>;
  renewTaskLease(
    taskId: string,
    agentName: string,
    leaseDurationSeconds: number
  ): Promise<TaskRecord | null>;
  requeueExpiredTasks(projectId?: string, goalId?: string): Promise<number>;
  listTaskEvents(taskId: string): Promise<TaskEvent[]>;
  listProjectTaskEvents(projectId: string, limit?: number): Promise<TaskEvent[]>;
}

export type CoordinationStore = ProjectStore & GoalStore & TaskStore;
