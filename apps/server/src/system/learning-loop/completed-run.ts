import type {
  CompletedRun,
  GoalRecord,
  ProjectRecord,
  TaskOutcome,
  TaskRecord
} from "@opentasks/contracts";

interface BuildCompletedRunParams {
  task: TaskRecord;
  goal: GoalRecord | null;
  project: ProjectRecord | null;
  summary: string;
  outcome: TaskOutcome;
  messages?: string[];
}

export function buildCompletedRun({
  task,
  goal,
  project,
  summary,
  outcome,
  messages = []
}: BuildCompletedRunParams): CompletedRun {
  return {
    taskId: task.id,
    projectId: task.projectId,
    projectName: project?.name ?? task.projectId,
    projectDescription: project?.description ?? "",
    goalId: task.goalId,
    goalName: goal?.name ?? task.goalId,
    goalDescription: goal?.description ?? "",
    taskTitle: task.title,
    taskDescription: task.description,
    summary,
    messages: normalizeMessages(messages),
    outcome
  };
}

export function serializeRunMetadata(metadata?: Record<string, unknown>): string[] {
  if (!metadata || Object.keys(metadata).length === 0) {
    return [];
  }

  return [`Structured metadata:\n${JSON.stringify(metadata, null, 2)}`];
}

function normalizeMessages(messages: string[]): string[] {
  return messages
    .map((message) => message.trim())
    .filter((message) => message.length > 0);
}
