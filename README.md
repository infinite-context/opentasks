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

### 1. The Execution Loop (Doing the work)
1. An external agent requests work via the **MCP Server**.
2. The **Task Orchestrator** pulls an available task from the PostgreSQL database.
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
- PostgreSQL (for the task database)
- Vector Database (configuration pending)
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

3. Set up your environment variables (see `.env.example` in `apps/server`).

4. Start the development server:
   ```bash
   npm run dev
   ```

## Documentation

Dive deeper into the system's design and internals:

- [**Architecture Overview**](./docs/architecture.md): Detailed breakdown of system components, storage layers, and runtime flows.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
