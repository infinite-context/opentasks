import type { DashboardSnapshotDto } from "@opentasks/contracts";
import { escapeHtml } from "../utils";

export function renderAgentUtilizationCard(agents: DashboardSnapshotDto["agents"]): string {
  return `
    <section class="card">
      <div class="card__header">
        <div>
          <div class="eyebrow">Workload</div>
          <h2>Agent utilization</h2>
        </div>
      </div>

      <div class="mini-table">
        ${agents.map(renderAgentLoad).join("")}
      </div>
    </section>
  `;
}

function renderAgentLoad(agent: DashboardSnapshotDto["agents"][number]): string {
  return `
    <div class="mini-table__row">
      <div>
        <div class="mini-table__title">${escapeHtml(agent.agentName)}</div>
        <div class="mini-table__subtitle">
          ${escapeHtml(`${agent.assignedTasks} assigned | ${agent.inProgressTasks} active | ${agent.completedTasks} completed`)}
        </div>
      </div>
      <div class="mini-table__metric">${escapeHtml(String(agent.failedTasks))} failed</div>
    </div>
  `;
}
