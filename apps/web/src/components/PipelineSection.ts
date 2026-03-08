import type { TaskStatus } from "@opentasks/contracts";
import { escapeHtml, formatStatus } from "../utils";

export function renderPipelineSection(
  pipeline: Array<{ status: TaskStatus; count: number }>,
  connectionState: string
): string {
  const healthState =
    connectionState === "connected" ? "healthy" : connectionState === "connecting" ? "degraded" : "warning";

  return `
    <section class="card card--large">
      <div class="card__header">
        <div>
          <div class="eyebrow">Pipeline</div>
          <h2>Task state overview</h2>
        </div>
        <span class="status-pill status-pill--health-${healthState}">
          ${escapeHtml(connectionState)}
        </span>
      </div>

      <div class="pipeline">
        ${pipeline.map((state) => renderPipelineState(state)).join("")}
      </div>
    </section>
  `;
}

function renderPipelineState(state: { status: TaskStatus; count: number }): string {
  return `
    <div class="pipeline__state">
      <div class="pipeline__bar pipeline__bar--${state.status}"></div>
      <div class="pipeline__meta">
        <span>${escapeHtml(formatStatus(state.status))}</span>
        <strong>${escapeHtml(String(state.count))}</strong>
      </div>
    </div>
  `;
}
