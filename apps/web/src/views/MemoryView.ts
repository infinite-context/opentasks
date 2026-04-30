import type { DashboardMemoryArtifactSummaryDto, RetrievedContextItem } from "@opentasks/contracts";
import { escapeHtml } from "../utils";

export interface MemoryViewProps {
  projectLabel: string;
  listLoading: boolean;
  listError: string;
  artifacts: DashboardMemoryArtifactSummaryDto[];
  total: number;
  searchQuery: string;
  searchLoading: boolean;
  searchError: string;
  searchResults: RetrievedContextItem[] | null;
}

export function renderMemoryView(props: MemoryViewProps): string {
  const listSection = props.listLoading
    ? `<p class="muted">Loading artifacts…</p>`
    : props.listError
      ? `<p class="error">${escapeHtml(props.listError)}</p>`
      : renderArtifactTable(props.artifacts, props.total);

  const searchSection = props.searchLoading
    ? `<p class="muted">Searching…</p>`
    : props.searchError
      ? `<p class="error">${escapeHtml(props.searchError)}</p>`
      : props.searchResults
        ? renderSearchResults(props.searchResults)
        : `<p class="muted">Run a semantic search against indexed vectors for this project.</p>`;

  return `
    <section class="stack memory-view">
      <div class="card">
        <div class="card__header">
          <div>
            <div class="eyebrow">Project</div>
            <h2>Learned memory</h2>
          </div>
          <div class="pill">${escapeHtml(props.projectLabel)}</div>
        </div>
        <p class="muted small">
          Artifacts are produced when tasks complete and when agents submit task/run context. Retrieval quality depends on SQLite + embeddings configuration on the server.
        </p>
      </div>

      <div class="card">
        <div class="card__header">
          <div>
            <div class="eyebrow">Browse</div>
            <h2>Indexed artifacts</h2>
          </div>
          <div class="pill">${props.total} total</div>
        </div>
        ${listSection}
      </div>

      <div class="card">
        <div class="card__header">
          <div>
            <div class="eyebrow">Semantic search</div>
            <h2>Vector retrieval preview</h2>
          </div>
        </div>
        <form class="memory-search-form" data-memory-search-form="">
          <label class="sr-only" for="memory-search-input">Search query</label>
          <input
            id="memory-search-input"
            name="query"
            type="search"
            class="input memory-search-input"
            placeholder="Describe the memory you are looking for…"
            value="${escapeHtml(props.searchQuery)}"
            autocomplete="off"
          />
          <button type="submit" class="button button--primary" data-memory-search-submit="">Search</button>
        </form>
        ${searchSection}
      </div>
    </section>
  `;
}

function renderArtifactTable(rows: DashboardMemoryArtifactSummaryDto[], total: number): string {
  if (rows.length === 0) {
    return `<p class="muted">No artifacts indexed for this project yet.</p>`;
  }

  const body = rows
    .map(
      (row) => `
      <tr>
        <td><code>${escapeHtml(row.kind)}</code></td>
        <td>${escapeHtml(row.summary ?? row.id)}</td>
        <td><code>${escapeHtml(row.taskId)}</code></td>
        <td class="muted">${escapeHtml(row.createdAt)}</td>
      </tr>`
    )
    .join("");

  return `
    <div class="table-wrap">
      <table class="table memory-table">
        <thead>
          <tr>
            <th>Kind</th>
            <th>Summary</th>
            <th>Task</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <p class="muted small">Showing ${rows.length} of ${total} artifact(s).</p>
  `;
}

function renderSearchResults(items: RetrievedContextItem[]): string {
  if (items.length === 0) {
    return `<p class="muted">No matches returned for that query.</p>`;
  }

  return `
    <ul class="memory-search-results">
      ${items
        .map(
          (item) => `
        <li class="memory-search-result">
          <div class="memory-search-result__title">
            <strong>${escapeHtml(item.kind)}</strong>
            <span class="muted">score ${typeof item.score === "number" ? item.score.toFixed(3) : "—"}</span>
          </div>
          <div>${escapeHtml(item.summary ?? item.content.slice(0, 240))}</div>
          <div class="muted small">${escapeHtml(item.taskId ?? "")} ${escapeHtml(item.id)}</div>
        </li>`
        )
        .join("")}
    </ul>
  `;
}
