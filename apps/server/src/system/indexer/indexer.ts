import type { Logger } from "../../infra/logging";
import type { VectorDatabase } from "../../infra/storage/vector-database";
import type { MemoryArtifact } from "@opentasks/contracts";
import type { CompletedRun } from "@opentasks/contracts";
import type { InternalAgent } from "../internal-agent";
import type { Indexer } from "./types";

interface CreateIndexerParams {
  logger: Logger;
  internalAgent: InternalAgent;
  vectorDatabase: VectorDatabase;
}

export function createIndexer({
  logger,
  internalAgent,
  vectorDatabase
}: CreateIndexerParams): Indexer {
  return {
    async processCompletedRun(run: CompletedRun): Promise<MemoryArtifact[]> {
      logger.step(
        "indexer",
        `Indexer processes completed run data for task \"${run.taskId}\".`
      );

      const artifacts = await internalAgent.generateArtifacts(run);
      const uniqueArtifacts = dedupeArtifactsWithinRun(artifacts);
      const novelArtifacts = await filterPreviouslyIndexedArtifacts(uniqueArtifacts, run, vectorDatabase, logger);

      logger.step(
        "indexer",
        `Indexer stores ${novelArtifacts.length} generated memory artifact(s) in the vector database.`
      );

      await vectorDatabase.upsert(novelArtifacts);
      return novelArtifacts;
    }
  };
}

function dedupeArtifactsWithinRun(artifacts: MemoryArtifact[]): MemoryArtifact[] {
  const seenSignatures = new Set<string>();

  return artifacts.filter((artifact) => {
    const signature = buildArtifactSignature(artifact.kind, artifact.summary, artifact.content);
    if (seenSignatures.has(signature)) {
      return false;
    }

    seenSignatures.add(signature);
    return true;
  });
}

async function filterPreviouslyIndexedArtifacts(
  artifacts: MemoryArtifact[],
  run: CompletedRun,
  vectorDatabase: VectorDatabase,
  logger: Logger
): Promise<MemoryArtifact[]> {
  const retainedArtifacts: MemoryArtifact[] = [];

  for (const artifact of artifacts) {
    const nearbyArtifacts = await vectorDatabase.search({
      text: artifact.content,
      projectId: run.projectId,
      goalId: run.goalId,
      taskId: run.taskId,
      limit: 8
    });

    const duplicate = nearbyArtifacts.some((candidate) => {
      if (candidate.kind !== artifact.kind) {
        return false;
      }

      if (candidate.taskId !== run.taskId && candidate.goalId !== run.goalId) {
        return false;
      }

      return (
        buildArtifactSignature(candidate.kind, candidate.summary ?? "", candidate.content) ===
        buildArtifactSignature(artifact.kind, artifact.summary, artifact.content)
      );
    });

    if (duplicate) {
      logger.step(
        "indexer",
        `Indexer skipped duplicate ${artifact.kind} artifact for task "${run.taskId}".`
      );
      continue;
    }

    retainedArtifacts.push(artifact);
  }

  return retainedArtifacts;
}

function buildArtifactSignature(kind: string, summary: string, content: string): string {
  return `${kind}::${normalize(summary)}::${normalize(content)}`;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
