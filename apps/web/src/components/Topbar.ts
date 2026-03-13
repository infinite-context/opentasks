import { escapeHtml } from "../utils";

export interface TopbarProps {
  title: string;
  subtitle?: string;
  mcpConnected: boolean;
  mcpChecking?: boolean;
}

export function renderTopbar(props: TopbarProps): string {
  const { title, subtitle = "Live dashboard", mcpConnected, mcpChecking = false } = props;
  const statusLabel = mcpChecking ? "Checking…" : mcpConnected ? "MCP connected" : "MCP disconnected";
  const statusClass = mcpChecking ? "mcp-status--checking" : mcpConnected ? "mcp-status--connected" : "mcp-status--disconnected";
  return `
    <header class="topbar">
      <div>
        <div class="eyebrow">${escapeHtml(subtitle)}</div>
        <h1>${escapeHtml(title)}</h1>
      </div>

      <div class="topbar__actions">
        <span class="mcp-status ${statusClass}" title="${escapeHtml(statusLabel)}" data-mcp-status>
          <span class="mcp-status__dot" aria-hidden="true"></span>
          <span class="mcp-status__label">${escapeHtml(statusLabel)}</span>
        </span>
      </div>
    </header>
  `;
}
