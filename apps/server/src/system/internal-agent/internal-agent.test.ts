import assert from "node:assert/strict";
import test from "node:test";
import type { CompletedRun, ModelResponse } from "@opentasks/contracts";
import type { Logger } from "../../infra/logging";
import { createInternalAgent } from "./internal-agent";
import type { ModelProviderService } from "../model-provider-service/types";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

function createCompletedRun(overrides: Partial<CompletedRun> = {}): CompletedRun {
  return {
    taskId: "task_alpha",
    projectId: "project_alpha",
    projectName: "Alpha Project",
    projectDescription: "Project focused on learning-pipeline validation.",
    goalId: "goal_alpha",
    goalName: "Improve contextual memory",
    goalDescription: "Generate better reusable task context.",
    taskTitle: "Improve artifact grounding",
    taskDescription: "Make the generated artifacts reflect the actual completed run.",
    summary: "Updated the artifact-generation prompt to reduce speculation.",
    contextDump: null,
    messages: ["Added stricter output rules", "Kept retrieval unchanged"],
    filesTouched: [],
    errors: [],
    commands: [],
    decisions: [],
    outcome: "success",
    ...overrides
  };
}

test("internal agent converts a structured model response into capped typed artifacts", async () => {
  const requests: string[] = [];
  const structuredResponse: ModelResponse = {
    provider: "openrouter",
    text: JSON.stringify({
      artifacts: [
        {
          kind: "instruction",
          summary: "Keep artifact prompts tightly grounded.",
          content: "When generating memory artifacts, only use the run context that was explicitly provided."
        },
        {
          kind: "architecture_note",
          summary: "Hydration stays downstream of task selection.",
          content: "The context hydrator should enrich the claimed task and must not decide what task to claim."
        },
        {
          kind: "run_note",
          summary: "Prompt shaping improved artifact grounding.",
          content: "A stricter JSON-only prompt reduced generic OpenRouter artifact output in the smoke test."
        },
        {
          kind: "run_note",
          summary: "This fourth artifact should be dropped by the cap.",
          content: "Only the first three valid artifacts should survive."
        }
      ]
    })
  };

  const modelProviderService: ModelProviderService = {
    async sendModelRequest(request) {
      requests.push(request.prompt);
      return structuredResponse;
    }
  };

  const internalAgent = createInternalAgent({ logger, modelProviderService });
  const firstArtifacts = await internalAgent.generateArtifacts(createCompletedRun());
  const secondArtifacts = await internalAgent.generateArtifacts(createCompletedRun());

  assert.equal(requests.length, 2);
  assert.match(requests[0] ?? "", /Return only valid JSON/i);
  assert.match(requests[0] ?? "", /Improve artifact grounding/);

  assert.equal(firstArtifacts.length, 3);
  assert.deepEqual(
    firstArtifacts.map((artifact) => artifact.kind),
    ["instruction", "architecture_note", "run_note"]
  );
  assert.ok(firstArtifacts.every((artifact) => artifact.id.startsWith("memory_")));
  assert.ok(firstArtifacts.every((artifact) => artifact.content.length > 0));
  assert.ok(firstArtifacts.every((artifact) => artifact.summary.length > 0));
  assert.deepEqual(
    firstArtifacts.map((artifact) => artifact.id),
    secondArtifacts.map((artifact) => artifact.id)
  );
});

test("internal agent falls back to a deterministic run note when the model response is unstructured", async () => {
  const modelProviderService: ModelProviderService = {
    async sendModelRequest() {
      return {
        provider: "noop",
        text: "Contextual indexing skipped because no model provider is configured."
      };
    }
  };

  const internalAgent = createInternalAgent({ logger, modelProviderService });
  const artifacts = await internalAgent.generateArtifacts(
    createCompletedRun({
      outcome: "failure",
      summary: "Typecheck still fails on unrelated baseline MCP typing issues.",
      messages: ["Do not widen scope into unrelated execution bugs."],
      contextDump: "tsc still fails in baseline MCP typing areas outside this change set.",
      filesTouched: ["apps/server/src/system/internal-agent/internal-agent.ts"],
      errors: ["TS2322 in unrelated MCP tooling"],
      commands: ["npm --workspace=@opentasks/server --silent run typecheck"],
      decisions: ["Do not widen scope into unrelated execution bugs."]
    })
  );

  assert.equal(artifacts.length, 1);
  assert.deepEqual(artifacts[0], {
    id: artifacts[0]?.id,
    taskId: "task_alpha",
    kind: "run_note",
    content:
      'Task outcome: failure.\nTask: Improve artifact grounding.\nTask description: Make the generated artifacts reflect the actual completed run.\nTerminal summary: Typecheck still fails on unrelated baseline MCP typing issues.\nSubmitted context dump: tsc still fails in baseline MCP typing areas outside this change set.\nSupplemental note 1: Do not widen scope into unrelated execution bugs.\nFile touched 1: apps/server/src/system/internal-agent/internal-agent.ts\nObserved error 1: TS2322 in unrelated MCP tooling\nCommand 1: npm --workspace=@opentasks/server --silent run typecheck\nDecision 1: Do not widen scope into unrelated execution bugs.',
    summary: "Failed Improve artifact grounding: Typecheck still fails on unrelated baseline MCP typing issues.",
    source: "contextual-indexing"
  });
  assert.ok(artifacts[0]?.id.startsWith("memory_"));
});
