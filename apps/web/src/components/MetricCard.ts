import type { MetricTrend } from "../types";
import { escapeHtml } from "../utils";

export function renderMetricCard(
  label: string,
  value: string,
  delta: string,
  trend: MetricTrend
): string {
  return `
    <section class="card metric-card">
      <div class="eyebrow">${escapeHtml(label)}</div>
      <div class="metric-card__value">${escapeHtml(value)}</div>
      <div class="metric-card__delta metric-card__delta--${trend}">${escapeHtml(delta)}</div>
    </section>
  `;
}
