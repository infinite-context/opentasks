import { escapeHtml } from "../utils";

export interface McpViewProps {
  projectPath: string | null;
  isLoading: boolean;
  errorMessage: string;
}

export function renderMcpView(props: McpViewProps): string {
  const { projectPath, isLoading, errorMessage } = props;

  const pathForConfig = projectPath ?? "<path-to-project>";
  const mcpConfig = {
    mcpServers: {
      opentasks: {
        command: "npm",
        args: ["--prefix", pathForConfig, "run", "start:mcp"]
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
        Add the OpenTasks MCP server to your Cursor or other MCP client by adding the following to your <code>mcp.json</code> config file.
      </p>

      ${
        errorMessage
          ? `<div class="detail-callout"><div class="detail-value">${escapeHtml(errorMessage)}</div></div>`
          : ""
      }

      ${
        isLoading
          ? `<div class="detail-callout"><div class="detail-value">Loading project path...</div></div>`
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
                ${
                  projectPath != null
                    ? "The path above is resolved from the server&rsquo;s current working directory. Override with <code>OPENTASKS_PROJECT_PATH</code> if needed."
                    : "Replace <code>&lt;path-to-project&gt;</code> with your OpenTasks project directory (e.g. <code>c:/Development/OpenTasks</code>). Ensure the server is running to auto-detect the path."
                }
              </p>
            `
      }
    </section>
  `;
}
