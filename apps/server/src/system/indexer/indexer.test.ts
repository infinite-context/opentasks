import assert from "node:assert/strict";
import test from "node:test";
import type { CompletedRun, MemoryArtifact, RetrievedContextItem } from "@opentasks/contracts";
import type { Logger } from "../../infra/logging";
import { createIndexer } from "./indexer";
import type { InternalAgent } from "../internal-agent";
import type { VectorDatabase, VectorSearchQuery } from "../../infra/storage/vector-database";

const logger: Logger = {
  section() {},
  step() {},
  info() {}
};

function createCompletedRun(): CompletedRun {
  return {
    taskId: "task_alpha",
    projectId: "project_alpha",
    projectName: "Alpha Project",
    projectDescription: "Project for testing indexer dedupe.",
    goalId: "goal_alpha",
    goalName: "Goal Alpha",
    goalDescription: "Goal Alpha Description",
    taskTitle: "Improve indexing quality",
    taskDescription: "Generate grounded artifacts and skip duplicates.",
    summary: "Implemented grounded artifact generation.",
    contextDump: null,
    messages: ["Deduplicate repeated notes before storage."],
    filesTouched: [],
    errors: [],
    commands: [],
    decisions: [],
    outcome: "success"
  };
}

function createArtifact(overrides: Partial<MemoryArtifact> = {}): MemoryArtifact {
  return {
    id: "artifact_default",
    taskId: "task_alpha",
    kind: "run_note",
    content: "Grounded run note content",
    summary: "Grounded run note summary",
    source: "contextual-indexing",
    ...overrides
  };
}

test("indexer dedupes generated artifacts within a run and against recent scoped artifacts", async () => {
  const generatedArtifacts = [
    createArtifact({
      id: "artifact_run_note_a",
      kind: "run_note",
      content: "Grounded run note content",
      summary: "Grounded run note summary"
    }),
    createArtifact({
      id: "artifact_run_note_b",
      kind: "run_note",
      content: "Grounded run note content",
      summary: "Grounded run note summary"
    }),
    createArtifact({
      id: "artifact_instruction",
      kind: "instruction",
      content: "Always hydrate a claimed task after selection.",
      summary: "Hydrate after selecting the task."
    }),
    createArtifact({
      id: "artifact_architecture",
      kind: "architecture_note",
      content: "The hydrator enriches the selected task and does not decide which task to claim.",
      summary: "Hydration is downstream of orchestration."
    })
  ];

  const internalAgent: InternalAgent = {
    async generateArtifacts() {
      return generatedArtifacts;
    }
  };

  const searchQueries: VectorSearchQuery[] = [];
  const upsertCalls: MemoryArtifact[][] = [];
  const vectorDatabase: VectorDatabase = {
    async search(query) {
      searchQueries.push(query);

      if (query.text.includes("Always hydrate a claimed task")) {
        const duplicateCandidate: RetrievedContextItem = {
          id: "existing_instruction",
          kind: "instruction",
          projectId: "project_alpha",
          goalId: "goal_alpha",
          taskId: "task_alpha",
          content: "Always hydrate a claimed task after selection.",
          summary: "Hydrate after selecting the task.",
          score: 1
        };
        return [duplicateCandidate];
      }

      return [];
    },
    async upsert(artifacts) {
      upsertCalls.push(artifacts);
    }
  };

  const indexer = createIndexer({ logger, internalAgent, vectorDatabase });
  const artifacts = await indexer.processCompletedRun(createCompletedRun());

  assert.equal(searchQueries.length, 3);
  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(
    artifacts.map((artifact) => artifact.id),
    ["artifact_run_note_a", "artifact_architecture"]
  );
  assert.deepEqual(upsertCalls[0], artifacts);
});
