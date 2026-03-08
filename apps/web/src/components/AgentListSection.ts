import type { DashboardSnapshotDto } from "@opentasks/contracts";
import { escapeHtml } from "../utils";

export function renderAgentListSection(
  agents: DashboardSnapshotDto["agents"],
  selectedAgentName: string
): string {
  return `
    <section class="card card--large">
      <div class="card__header">
        <div>
          <div class="eyebrow">Workload</div>
          <h2>Agents</h2>
        </div>
      </div>

      <div class="agent-list" role="list">
        ${
          agents.length > 0
            ? agents.map((agent) => renderAgentRow(agent, agent.agentName === selectedAgentName)).join("")
            : `<div class="detail-callout"><div class="detail-value">No agents have claimed tasks yet.</div></div>`
        }
      </div>
    </section>
  `;
}

function renderAgentRow(
  agent: DashboardSnapshotDto["agents"][number],
  isSelected: boolean
): string {
  return `
    <div class="agent-row ${isSelected ? "agent-row--selected" : ""}" data-agent-name="${escapeHtml(agent.agentName)}" role="listitem" tabindex="0">
      <div class="agent-row__header">
        <span class="agent-row__name">${escapeHtml(agent.agentName)}</span>
        <span class="status-pill status-pill--compact status-pill--${agent.failedTasks > 0 ? "failed" : "completed"}">${escapeHtml(String(agent.failedTasks))} failed</span>
      </div>
      <div class="agent-row__stats">
        ${escapeHtml(String(agent.assignedTasks))} assigned · ${escapeHtml(String(agent.inProgressTasks))} active · ${escapeHtml(String(agent.completedTasks))} completed
      </div>
    </div>
  `;
}
