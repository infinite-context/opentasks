import type { DashboardSnapshotDto } from "@opentasks/contracts";
import { escapeHtml } from "../utils";

export function renderLearningMemoryCard(snapshot: DashboardSnapshotDto | null): string {
  const learning = snapshot?.learning;

  if (!learning) {
    return `
    <section class="card">
      <div class="card__header">
        <div>
          <div class="eyebrow">Learning</div>
          <h2>Indexed memory</h2>
        </div>
      </div>
      <p class="muted">Select a project on the dashboard to see learned artifact counts.</p>
    </section>
  `;
  }

  const rows =
    learning.recentArtifacts.length === 0
      ? `<li class="muted">No artifacts indexed yet for this project.</li>`
      : learning.recentArtifacts
          .map(
            (a) => `
      <li>
        <strong>${escapeHtml(a.kind)}</strong>
        · ${escapeHtml(a.summary ?? a.id)}
        <div class="muted small">${escapeHtml(a.taskId)} · ${escapeHtml(a.createdAt)}</div>
      </li>`
          )
          .join("");

  return `
    <section class="card learning-memory-card">
      <div class="card__header">
        <div>
          <div class="eyebrow">Learning</div>
          <h2>Indexed memory</h2>
        </div>
        <div class="pill">${learning.artifactCount} artifact(s)</div>
      </div>
      <p class="muted small">${escapeHtml(learning.indexingPolicyNote)}</p>
      <ul class="memory-preview-list">
        ${rows}
      </ul>
      <p class="muted small">Open the <strong>Memory</strong> page for the full artifact list and semantic search.</p>
    </section>
  `;
}
