import type { DashboardHealthItemDto } from "@opentasks/contracts";
import { escapeHtml, formatHealthState } from "../utils";

export function renderHealthCard(health: DashboardHealthItemDto[]): string {
  return `
    <section class="card">
      <div class="card__header">
        <div>
          <div class="eyebrow">Platform</div>
          <h2>System health</h2>
        </div>
      </div>

      <div class="health-list">
        ${health.map(renderHealthItem).join("")}
      </div>
    </section>
  `;
}

function renderHealthItem(item: DashboardHealthItemDto): string {
  return `
    <div class="health-item">
      <div>
        <div class="mini-table__title">${escapeHtml(item.name)}</div>
        <div class="mini-table__subtitle">${escapeHtml(item.detail)}</div>
      </div>
      <span class="status-pill status-pill--health-${item.state}">${escapeHtml(formatHealthState(item.state))}</span>
    </div>
  `;
}
