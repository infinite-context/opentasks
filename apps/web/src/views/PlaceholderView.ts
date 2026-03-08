import { escapeHtml } from "../utils";

export function renderPlaceholderView(title: string): string {
  return `
    <section class="card card--large">
      <div class="card__header">
        <div>
          <div class="eyebrow">Coming soon</div>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>
      <div class="detail-summary">
        <p>This view is not yet implemented. Backend support may be added in a future release.</p>
      </div>
    </section>
  `;
}
