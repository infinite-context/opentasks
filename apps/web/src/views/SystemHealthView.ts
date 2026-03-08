import type { DashboardSnapshotDto } from "@opentasks/contracts";
import { renderHealthCard } from "../components";

export function renderSystemHealthView(snapshot: DashboardSnapshotDto | null): string {
  const health = snapshot?.health ?? [];

  return `
    <section class="content-grid">
      <div class="stack">
        ${renderHealthCard(health)}
      </div>
    </section>
  `;
}
