# opentasks

> An open, model-agnostic runtime for task coordination, context hydration, and cross-session learning for AI agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

Agents perform well in isolated, single-shot tasks. However, on large projects and long-running workflows, they often lose continuity across runs. This leads to **repeated discovery work, unnecessary token usage, and weaker reuse of prior progress**.

`opentasks` is designed to solve this by preserving task-relevant context outside the model's transient context window. It acts as an orchestrator and memory layer, helping external agents start their work with better awareness of prior runs, project state, and reusable memory.

---

## Key Features

- **Context Hydration:** Automatically enriches new tasks with relevant prior memory using a Vector Database before handing them to an agent.
- **Cross-Session Learning:** Processes completed runs into reusable memory artifacts, allowing your agents to get "smarter" about your specific codebase/project over time.
- **Model-Agnostic & MCP Ready:** Interfaces with external agents via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), meaning it works seamlessly with any MCP-capable client (like Cursor, Claude Desktop, etc.).
- **Internal indexing agent:** Uses a lower-cost model (via OpenRouter) internally to index run data and generate structured context artifacts without bloating your main agent's costs.

## How it Works

`opentasks` operates through two interconnected loops:

At a high level, the interaction looks like this:

```text
Agent -> request task
System -> return hydrated task

Agent -> do work
Agent -> submit completed run

System -> learn from run
System -> improve next task
```

That is the core interaction model of the system.

### 1. The Execution Loop (Doing the work)

1. An external agent requests work via the **MCP Server**.
2. The **Task Orchestrator** pulls an available task from the SQLite database.
3. The **Context Hydrator** fetches relevant prior memory from the Vector Search Engine.
4. The hydrated task is returned to the agent, primed with everything it needs to know.

### 2. The Learning Loop (Remembering for next time)

1. The external agent completes the task and submits the run context back.
2. The **Indexer** uses an internal, lower-cost agent to process the completed run.
3. Relevant knowledge is extracted, vectorized, and stored in the Vector Database.
4. Future tasks can now retrieve this memory.

## Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- npm (bundled with Node.js)
- Ollama installed locally
- `embeddinggemma` pulled into Ollama: `ollama pull embeddinggemma`
- OpenRouter API Key (for the internal indexing agent)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/opentasks.git
   cd opentasks
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure the learning pipeline in `apps/server/.env`:

   ```env
   OPENTASKS_EMBEDDING_PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_EMBEDDING_MODEL=embeddinggemma
   OLLAMA_EMBEDDING_DIMENSIONS=256

   OPENROUTER_API_KEY=your-openrouter-key
   OPENROUTER_MODEL=google/gemini-2.0-flash-001
   ```

4. Start Ollama if it is not already running.

5. Start the development server:
   ```bash
   npm run dev
   ```

If Ollama is unavailable or `embeddinggemma` is missing, OpenTasks now fails fast at startup with an actionable setup error instead of silently falling back to fake embeddings.

### MCP Setup

OpenTasks can be connected to MCP-capable agents in two ways: stdio MCP or Streamable HTTP MCP.

#### stdio MCP

To connect OpenTasks as a stdio MCP server, add this to your MCP config:

```json
{
  "mcpServers": {
    "opentasks": {
      "command": "npm",
      "args": ["run", "start:mcp"],
      "cwd": "/path/to/opentasks"
    }
  }
}
```

With stdio MCP, the agent runtime launches OpenTasks as a child process for the session.

#### Streamable HTTP MCP

To connect through HTTP MCP, start the backend:

```bash
npm run dev:server
```

This exposes the Streamable HTTP MCP endpoint at:

```text
http://localhost:3005/mcp
```

Register the MCP server URL in your agent runtime. Depending on the client, this can be configured globally or per project:

Codex CLI:

```bash
codex mcp add opentasks --url http://localhost:3005/mcp
```

Claude Code (user scope):

```bash
claude mcp add --transport http --scope user opentasks http://localhost:3005/mcp
```

After registering the server, restart your agent runtime or start a new session. For Codex, you can verify the registration with:

```bash
codex mcp list
codex mcp get opentasks
```

Other MCP-capable clients should use their equivalent "add MCP server by URL" flow when they support Streamable HTTP MCP.

With HTTP MCP, OpenTasks runs as a shared local server and agent runtimes connect to `http://localhost:3005/mcp`.

After connecting through either transport, the first OpenTasks tool call should be `start_session` with the current workspace root:

```json
{
  "workingDirectory": "/path/to/your/project"
}
```

## Documentation

Dive deeper into the system's design and internals:

- [**Architecture Overview**](./docs/architecture.md): Detailed breakdown of system components, storage layers, and runtime flows.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
