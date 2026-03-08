import type { DashboardSnapshotDto } from "@opentasks/contracts";
import { escapeHtml } from "../utils";
import type { AnalyticsTimeRange } from "../types";

export interface AnalyticsViewProps {
  snapshot: DashboardSnapshotDto | null;
  analyticsTimeRange: AnalyticsTimeRange;
}

export function renderAnalyticsView(props: AnalyticsViewProps): string {
  const { snapshot, analyticsTimeRange } = props;
  const summary = snapshot?.summary ?? null;

  const completedTotal = summary?.completedTasks ?? 0;
  const failedTotal = summary?.failedTasks ?? 0;
  const outcomeTotal = completedTotal + failedTotal;
  const successRate = outcomeTotal > 0 ? Math.round((completedTotal / outcomeTotal) * 100) : 0;

  return `
    <section class="analytics">
      <div class="analytics__header">
        <div class="eyebrow">Task metrics</div>
        <h2>Analytics</h2>
      </div>
      ${summary ? `
        <div class="analytics__summary-cards">
          <div class="analytics-summary-card">
            <div class="analytics-summary-card__value">${escapeHtml(String(summary.completedTasks))}</div>
            <div class="analytics-summary-card__label">Completed</div>
          </div>
          <div class="analytics-summary-card analytics-summary-card--failure">
            <div class="analytics-summary-card__value">${escapeHtml(String(summary.failedTasks))}</div>
            <div class="analytics-summary-card__label">Failed</div>
          </div>
          <div class="analytics-summary-card">
            <div class="analytics-summary-card__value">${escapeHtml(String(successRate))}%</div>
            <div class="analytics-summary-card__label">Success rate</div>
          </div>
          <div class="analytics-summary-card">
            <div class="analytics-summary-card__value">${escapeHtml(String(summary.activeAgents))}</div>
            <div class="analytics-summary-card__label">Active agents</div>
          </div>
        </div>
      ` : ""}

      <div class="analytics__charts">
        <div class="analytics-card analytics-card--wide">
          <div class="analytics-card__header analytics-card__header--row">
            <div>
              <div class="eyebrow">Trends</div>
              <h3>Completions & failures over time</h3>
              <div class="analytics-legend">
                <span class="analytics-legend__item"><span class="analytics-legend__dot analytics-legend__dot--completed"></span>Completed</span>
                <span class="analytics-legend__item"><span class="analytics-legend__dot analytics-legend__dot--failed"></span>Failed</span>
              </div>
            </div>
            <select class="analytics-time-range-select" data-analytics-time-range aria-label="Time range">
              <option value="day" ${analyticsTimeRange === "day" ? "selected" : ""}>Day (hours)</option>
              <option value="week" ${analyticsTimeRange === "week" ? "selected" : ""}>Week (days)</option>
              <option value="month" ${analyticsTimeRange === "month" ? "selected" : ""}>Month (days)</option>
              <option value="year" ${analyticsTimeRange === "year" ? "selected" : ""}>Year (months)</option>
            </select>
          </div>
          <div class="analytics-card__body">
            <canvas id="analytics-timeseries-chart" aria-label="Completed and failed tasks over time"></canvas>
          </div>
        </div>
      </div>
    </section>
  `;
}
