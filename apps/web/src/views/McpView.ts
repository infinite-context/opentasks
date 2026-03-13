import { escapeHtml } from "../utils";

export interface McpViewProps {
  isLoading: boolean;
  errorMessage: string;
  mcpUrl: string;
}

export function renderMcpView(props: McpViewProps): string {
  const { isLoading, errorMessage, mcpUrl } = props;

  const mcpConfig = {
    mcpServers: {
      opentasks: {
        url: mcpUrl
      }
    }
  };
  const configJson = JSON.stringify(mcpConfig, null, 2);

  return `
    <section class="card card--large">
      <div class="card__header">
        <div>
          <div class="eyebrow">Model Context Protocol</div>
          <h2>MCP server setup</h2>
        </div>
      </div>

      <p class="detail-summary">
        Add the OpenTasks MCP server to your Cursor or other MCP client by adding the following to your <code>mcp.json</code> config file. The server uses Streamable HTTP (SSE) at <code>/mcp</code>.
      </p>

      ${
        errorMessage
          ? `<div class="detail-callout"><div class="detail-value">${escapeHtml(errorMessage)}</div></div>`
          : ""
      }

      ${
        isLoading
          ? `<div class="detail-callout"><div class="detail-value">Loading...</div></div>`
          : `
              <div class="mcp-config-block">
                <pre class="mcp-config__pre"><code class="mcp-config__code">${escapeHtml(configJson)}</code></pre>
                <button class="button button--ghost mcp-config__copy" data-copy-mcp type="button">
                  <span class="button__content">
                    <i class="fa-solid fa-copy fa-fw" aria-hidden="true"></i>
                    <span>Copy to clipboard</span>
                  </span>
                </button>
              </div>
              <p class="detail-summary" style="margin-top: 1rem;">
                Ensure the OpenTasks server is running (<code>npm run start:server</code>) before connecting. Cursor connects over HTTP/SSE to the MCP endpoint.
              </p>
            `
      }
    </section>
  `;
}
