import { createHash } from "node:crypto";
import { z } from "zod";
import type { Logger } from "../../infra/logging";
import type { MemoryArtifact } from "@opentasks/contracts";
import type { CompletedRun } from "@opentasks/contracts";
import type { ModelProviderService } from "../model-provider-service";
import type { InternalAgent } from "./types";

interface CreateInternalAgentParams {
  logger: Logger;
  modelProviderService: ModelProviderService;
}

const generatedArtifactSchema = z.object({
  kind: z.enum(["run_note", "instruction", "architecture_note"]),
  summary: z.string().min(1),
  content: z.string().min(1)
});

const generatedArtifactBatchSchema = z.object({
  artifacts: z.array(z.unknown())
});

export function createInternalAgent({
  logger,
  modelProviderService
}: CreateInternalAgentParams): InternalAgent {
  return {
    async generateArtifacts(run: CompletedRun): Promise<MemoryArtifact[]> {
      logger.step(
        "internal-agent",
        "Internal agent prepares contextual indexing work for the model provider service."
      );

      const response = await modelProviderService.sendModelRequest({
        prompt: buildArtifactGenerationPrompt(run)
      });

      logger.step(
        "internal-agent",
        "Internal agent converts the provider response into reusable memory artifacts."
      );

      const parsedArtifacts = parseStructuredArtifacts(response.text);
      if (!parsedArtifacts) {
        logger.info(
          "internal-agent",
          `Internal agent fell back to a deterministic run note because ${response.provider} returned an unstructured artifact response.`
        );
        return [createDeterministicRunNote(run)];
      }

      if (parsedArtifacts.length === 0) {
        return [createDeterministicRunNote(run)];
      }

      return parsedArtifacts.map((artifact) => materializeArtifact(run, artifact));
    }
  };
}

function buildArtifactGenerationPrompt(run: CompletedRun): string {
  const runContext = {
    project: {
      id: run.projectId,
      name: run.projectName,
      description: run.projectDescription
    },
    goal: {
      id: run.goalId,
      name: run.goalName,
      description: run.goalDescription
    },
    task: {
      id: run.taskId,
      title: run.taskTitle,
      description: run.taskDescription
    },
    outcome: run.outcome,
    terminalSummary: run.summary,
    submittedMessages: run.messages
  };

  return [
    "You convert terminal task runs into reusable contextual memory for a task orchestration system.",
    "Return only valid JSON with this shape:",
    '{"artifacts":[{"kind":"run_note","summary":"...","content":"..."}]}',
    "Rules:",
    "- Use only the provided run context. Do not invent files, tools, APIs, models, or implementation details.",
    "- Return between 1 and 3 artifacts total.",
    "- Only emit kinds instruction, architecture_note, or run_note.",
    "- Emit instruction only for concrete reusable execution guidance.",
    "- Emit architecture_note only for stable design relationships or constraints grounded in the input.",
    "- Emit run_note for concrete observations from this run that may help future related tasks.",
    "- Keep each summary short, specific, and factual.",
    "- Keep each content field concise and reusable. Avoid markdown headings and avoid generic retrospectives.",
    "Run context:",
    JSON.stringify(runContext, null, 2)
  ].join("\n");
}

function parseStructuredArtifacts(responseText: string): Array<z.infer<typeof generatedArtifactSchema>> | null {
  const candidatePayloads = [
    responseText.trim(),
    extractCodeFenceJson(responseText),
    extractBalancedJsonObject(responseText)
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const candidate of candidatePayloads) {
    try {
      const parsed = JSON.parse(candidate);
      const result = generatedArtifactBatchSchema.safeParse(parsed);
      if (result.success) {
        const validArtifacts = result.data.artifacts
          .map((artifact) => generatedArtifactSchema.safeParse(artifact))
          .filter((artifact): artifact is { success: true; data: z.infer<typeof generatedArtifactSchema> } => artifact.success)
          .map((artifact) => ({
            kind: artifact.data.kind,
            summary: normalizeWhitespace(artifact.data.summary),
            content: normalizeWhitespace(artifact.data.content)
          }))
          .slice(0, 3);

        return validArtifacts;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractCodeFenceJson(value: string): string | null {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? null;
}

function extractBalancedJsonObject(value: string): string | null {
  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return value.slice(firstBrace, lastBrace + 1).trim();
}

function createDeterministicRunNote(run: CompletedRun): MemoryArtifact {
  const contentSections = [
    `Task outcome: ${run.outcome}.`,
    `Task: ${run.taskTitle}.`,
    run.taskDescription ? `Task description: ${run.taskDescription}` : "",
    `Terminal summary: ${run.summary}`,
    ...run.messages.map((message, index) => `Supplemental note ${index + 1}: ${message}`)
  ].filter((value) => value.length > 0);

  const summary = truncate(
    normalizeWhitespace(`${capitalizeOutcome(run.outcome)} ${run.taskTitle}: ${run.summary}`),
    160
  );
  const content = contentSections.join("\n");

  return {
    id: createArtifactId(run.taskId, "run_note", summary, content),
    taskId: run.taskId,
    kind: "run_note",
    content,
    summary,
    source: "contextual-indexing"
  };
}

function materializeArtifact(
  run: CompletedRun,
  artifact: z.infer<typeof generatedArtifactSchema>
): MemoryArtifact {
  const summary = truncate(normalizeWhitespace(artifact.summary), 160);
  const content = normalizeWhitespace(artifact.content);

  return {
    id: createArtifactId(run.taskId, artifact.kind, summary, content),
    taskId: run.taskId,
    kind: artifact.kind,
    content,
    summary,
    source: "contextual-indexing"
  };
}

function createArtifactId(taskId: string, kind: string, summary: string, content: string): string {
  const digest = createHash("sha1")
    .update(JSON.stringify({ taskId, kind, summary, content }))
    .digest("hex")
    .slice(0, 24);

  return `memory_${digest}`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function capitalizeOutcome(outcome: CompletedRun["outcome"]): string {
  return outcome === "success" ? "Completed" : "Failed";
}
