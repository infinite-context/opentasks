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
  contextDump?: string | null;
  messages?: string[];
  filesTouched?: string[];
  errors?: string[];
  commands?: string[];
  decisions?: string[];
}

export function buildCompletedRun({
  task,
  goal,
  project,
  summary,
  outcome,
  contextDump = null,
  messages = [],
  filesTouched = [],
  errors = [],
  commands = [],
  decisions = []
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
    summary: summary.trim(),
    contextDump: normalizeOptionalText(contextDump),
    messages: normalizeMessages(messages),
    filesTouched: normalizeMessages(filesTouched),
    errors: normalizeMessages(errors),
    commands: normalizeMessages(commands),
    decisions: normalizeMessages(decisions),
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

function normalizeOptionalText(value?: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
