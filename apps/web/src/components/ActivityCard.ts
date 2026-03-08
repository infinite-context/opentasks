import type { DashboardSnapshotDto } from "@opentasks/contracts";
import { escapeHtml, formatRelativeTime, formatTaskEvent } from "../utils";

export function renderActivityCard(activity: DashboardSnapshotDto["activity"]): string {
  return `
    <section class="card">
      <div class="card__header">
        <div>
          <div class="eyebrow">Live signal</div>
          <h2>Recent activity</h2>
        </div>
      </div>

      <div class="activity-list">
        ${activity.map(renderActivityItem).join("")}
      </div>
    </section>
  `;
}

function renderActivityItem(item: DashboardSnapshotDto["activity"][number]): string {
  return `
    <div class="activity-item">
      <div class="activity-item__time">${escapeHtml(formatRelativeTime(item.event.createdAt))}</div>
      <div>
        <div class="activity-item__title">${escapeHtml(formatTaskEvent(item.event))}</div>
        <div class="activity-item__detail">${escapeHtml(item.taskTitle ?? item.taskId)}</div>
      </div>
    </div>
  `;
}
