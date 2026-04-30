# Architecture

## Purpose

This document describes the system components and runtime flow for `opentasks`.

The architecture is based on a goal-driven task orchestration system that works alongside external agents, coordinates task execution through MCP, and preserves structured project, goal, and task state in SQLite (via Drizzle ORM). Learned artifacts are indexed into **sqlite-vec** (SQLite extension) with embeddings from the configured embedding provider (e.g. Ollama); an internal OpenRouter-backed agent generates structured memory rows when learning runs are processed.

## System boundary

The system is organized into three areas:

1. External components
Components that call into the system or provide external model access.

2. Internal components
Components inside `opentasks` that coordinate tasks, hydrate context, process run data, and generate reusable memory.

3. Storage components
Databases used for task state and retrievable memory.

## External components

### Web UI

The web UI is the browser-facing observability surface for the system.

It visualizes backend task coordination state through HTTP and SSE, and it uses the same canonical project, goal, task, task event, agent, and MCP log models that the backend uses internally.

Views include: dashboard (summary, pipeline, learning/memory preview), goals (goal-scoped task lists), tasks (task detail and lifecycle), projects (project selection and creation), agents (agent list and MCP tool logs per agent), MCP (connection status and configuration), **Memory** (artifact list and semantic search against indexed vectors), analytics, system health, and settings.

**Important Architectural Note:** The Web UI is intentionally built using Vanilla TypeScript, raw HTML string templates, and Vite. It does not use a modern reactive framework like React or Vue. This is by design to maintain a specific architectural footprint. Do not attempt to rewrite the frontend to a different framework.

### External Agent

The external agent is any client that requests work from the system and performs the task after receiving context.

Examples include coding agents, browser agents, and other MCP-capable runtimes.

### External Model Provider

OpenRouter is the default external model provider used by the system.

Additional providers can be supported through the model provider service.

## Internal components

### MCP Server

The MCP server is the agent-facing entry point into the system.

It supports two transports:

1. **stdio** (default): A long-lived stdio MCP service, typically one process per client. Caller-supplied `agentName` is required for task lifecycle tools.
2. **HTTP** (Streamable HTTP): Mounted at `/mcp` on the HTTP server when `OPENTASKS_MCP_OVER_HTTP` is enabled. Each connecting client receives a session-bound agent with a generated Docker-style display name (e.g. `quiet-forest`). Task lifecycle tools infer agent identity from the session; no `agentName` parameter is required.

These tools include project creation and lookup, goal creation and update, goal listing, task creation, orchestrated task request, task lifecycle operations, and task inspection.

### HTTP Server

The HTTP server is the browser-facing transport for project, goal, dashboard, task inspection, agent, MCP log, **memory**, and supporting flows.

It exposes JSON endpoints for project listing and creation, goal listing by project, dashboard snapshots, task lists, task detail, agent list, MCP logs by agent, **`GET /api/memory`** (artifact summaries), **`GET /api/memory/search`** (semantic retrieval preview), **`GET /api/tasks/:taskId/memory`** (task-scoped artifacts), and supporting browser metadata and file-system flows. It also exposes an SSE stream for live dashboard refresh.

When MCP over HTTP is enabled, it mounts the MCP handler at `/mcp` (POST for requests, GET for streaming, DELETE for session cleanup). The HTTP server delegates MCP handling to the MCP HTTP handler so browser and agent traffic share the same port.

It exposes the project-aware read endpoints needed by the web UI, including project selection, project-overview reads, goal inspection, dashboard reads (including optional **`learning`** previews), task inspection, agents, MCP logs, and memory reads for dashboard visualization.

It is built using Fastify and utilizes `fastify-type-provider-zod` for native request validation against the shared `@opentasks/contracts` schemas.

### Logger

The logger records operational events related to task requests and run processing.

It exists to preserve traceability around the execution and learning paths.

### Validation Service

The validation service provides shared cross-aggregate checks for the active runtime.

It verifies project existence, goal existence, project-goal ownership, and task-goal ownership, and it returns standardized service outcomes that the MCP transport can render consistently.

### Project Service

The project service owns project creation and lookup behavior.

It is the application-facing layer above project persistence and is responsible for returning standardized project-oriented responses and project list responses for MCP consumers.

### Session Service

The session service handles session startup and project resolution by working directory.

It implements `start_session(workingDirectory)`: resolves the path, looks up an existing project by exact or parent-directory match, and creates a new project if none is found. It derives project key and name from the directory name and returns the project with open goals. This is the entry point agents use before creating goals or requesting tasks.

### Agent Service

The agent service manages agent identity and lifecycle.

It creates or reuses agents by client name, assigns Docker-style display names (e.g. `quiet-forest`) for HTTP MCP sessions, and maintains last-seen timestamps. The agent store (SQLite or in-memory) persists agent records. Agent identity is inferred from the MCP session when running over HTTP, so task lifecycle tools do not require an explicit `agentName` parameter in that mode.

### Goal Service

The goal service owns goal creation, goal updates, goal listing, and goal selection for orchestration.

It resolves the next eligible goal for a project before task claiming occurs, and it returns standardized missing-goal and goal-mismatch outcomes for MCP consumers.

### Task Orchestrator

The task orchestrator coordinates goal-aware task selection and overall task flow.

It validates the request, asks the goal service to resolve the next eligible goal for the project, then asks the task list manager to claim the next available task within that goal.

### Task List Manager

The task list manager is responsible for selecting available work from the task database.

It handles goal-scoped task retrieval, assignment, and dependency-aware task availability.

Its active selection path is SQLite-backed and still uses an atomic goal-scoped claim query in the storage adapter.

### Task Query Service

The task query service provides read-oriented task list and task detail responses for browser consumers.

It assembles canonical task records and their related lifecycle events without embedding transport logic. It supports search and filtering for task discovery.

### Task Resolution Service

The task resolution service provides query-based task recommendation.

It implements `recommend_task_for_query`: searches tasks by text query, returns a claimable match when available, or suggests the next dependency-ready task when the queried task is blocked. Used by MCP consumers to find work without claiming it first.

### Memory Query Service

The memory query service provides read-side access to persisted **`memory_artifacts`** metadata and sqlite-vec-backed semantic search for HTTP consumers.

It backs **`GET /api/memory`**, **`GET /api/memory/search`**, and **`GET /api/tasks/:taskId/memory`**. MCP intentionally stays minimal here so agents rely on hydrated task context plus coordinator tools rather than browsing raw artifact payloads in chat.

### Dashboard Query Service

The dashboard query service builds aggregate observability responses for the web UI.

It derives summary metrics, pipeline counts, recent activity, agent workload, health views, and an optional **`learning`** block (artifact totals, recent summaries, indexing policy note, health row) from canonical backend task/event data plus the memory artifact reader.

### Context Hydrator

The context hydrator enriches a claimed task with relevant prior memory before the task is returned to an agent client.

It gathers ranked **`RetrievedContextItem`** rows through the vector search engine for the active task/project scope.

### Indexer

The indexer processes completion summaries and submitted task/run context notes into structured memory artifacts.

It deduplicates near-identical payloads where practical and upserts rows into sqlite-vec via the vector database adapter.

Background indexing may run after terminal transitions (`complete_task` / `fail_task`), while **`submit_task_context`** / **`submit_run_context`** can enqueue richer indexing passes; duplicates are skipped heuristically (see dashboard **`indexingPolicyNote`**).

### Vector Search Engine

The vector search engine retrieves ranked memory for hydration and dashboard memory search previews.

It queries sqlite-vec tables through the vector database adapter and returns **`RetrievedContextItem`** payloads.

### Internal Agent

The internal agent is the OpenRouter-backed worker used by the learning pipeline when configured.

It synthesizes summaries and structured artifact bodies from run/task context payloads before embeddings are computed.

### Model Provider Service

The model provider service abstracts outbound LLM requests.

It sends requests to OpenRouter for the internal indexing agent (when enabled) and isolates provider-specific logic so additional model backends can be introduced without rewriting orchestration services.

## Storage components

### SQLite Coordination Database

The SQLite coordination database stores project state, goal state, task state, dependency data, assignment state, task events, task availability information, agent records, and MCP tool invocation logs.

The `agents` table stores session-bound agent identities with a unique Docker-style display name (e.g. `quiet-forest`), used when MCP runs over HTTP. The agent store (SQLite or in-memory) backs the agent service.

The `mcp_logs` table records each MCP tool invocation: agent, tool name, arguments, result status, and optional error message. The MCP log store (SQLite or in-memory) backs observability for agent activity in the web UI.

It is the backing store queried by the project, goal, validation, task, agent, and session services. It uses Drizzle ORM for type-safe query building and schema management, replacing brittle raw SQL strings.

It is also the source of truth for persisted object identifiers. Project, goal, task, and task event IDs use prefixed identifiers such as `project_<id>`, `goal_<id>`, `task_<id>`, and `task_event_<id>`.

The current bootstrap path supports legacy SQLite databases by backfilling `tasks.goal_id`, creating default goals for existing projects when needed, and only then creating goal-dependent indexes.

### Vector Database

The vector database stores embeddings and indexed metadata for memory artifacts (**sqlite-vec**).

Hydration and **`GET /api/memory/search`** share the same embedding provider configuration used at indexing time.

It is queried by both the vector search engine (hydration + previews) and the indexing workflow.

## Core loops

### Execution loop

The execution loop is the path used to prepare and return work to an external agent.

1. The external agent requests a task through the MCP server.
2. The MCP server forwards the request to the execution loop.
3. The execution loop forwards the request to the task orchestrator.
4. The task orchestrator calls the validation service to verify the project and ensure that goals exist.
5. The task orchestrator asks the goal service to resolve the next eligible goal for the project.
6. The task orchestrator asks the task list manager to claim the next available task in that goal.
7. The task list manager uses the Drizzle-backed SQLite coordination database for dependency-aware atomic claiming.
8. The claimed task is returned through the MCP server to the external agent.

The MCP surface also supports additional lifecycle operations after claiming a task:

1. The external agent marks the task as started.
2. The external agent renews the task lease through heartbeats while work is in progress.
3. The external agent completes, fails, or releases the task.
4. Each transition is persisted and recorded in the task event log.

The MCP surface also supports session and project management operations used before task execution begins:

1. The external agent calls `start_session(workingDirectory)` first to create or find a project by path (exact or parent-directory match).
2. The external agent can create a project, read a project, or list projects.
3. The external agent can create, update, and list goals for a project.
4. Task creation requires an existing project-goal pair and is rejected with standardized guidance when that context is missing.
5. The task resolution service supports `recommend_task_for_query` for search-based task discovery without claiming.
6. Claimed tasks returned through MCP include hydrated vector memory assembled by the context hydrator.

### Learning loop

The learning loop turns completed work and explicit submissions into reusable stored memory.

1. Terminal transitions enqueue background processing from completion summaries when enabled.
2. Agents may call **`submit_task_context`** / **`submit_run_context`** with richer notes; these may trigger additional indexing passes (artifacts remain observable via HTTP/dashboard rather than verbose MCP payloads).
3. The indexer invokes the internal agent (OpenRouter) when configured, persists **`memory_artifacts`**, embeds content through the embedding provider, and writes vectors into sqlite-vec.
4. Later tasks hydrate via the vector search engine using project/task-aware ranking.

Duplicate detection is heuristic; consult dashboard copy for the canonical indexing policy wording exposed to operators.

### Browser read path

The browser read path is the browser-facing observability flow.

1. The web UI selects an active project and requests project-scoped data through the HTTP server.
2. The HTTP server validates query parameters with shared schemas.
3. The HTTP server calls the project service, goal service, dashboard query service, task query service, agent service, MCP log store, or **memory query service** depending on the view being loaded.
4. The service layer loads canonical project, goal, task, event, agent, MCP log, and optional memory artifact preview rows from coordination storage + sqlite-backed readers.
5. Aggregate or list DTOs are built around canonical entities.
6. The response is returned to the browser as JSON.
7. The SSE endpoint periodically emits fresh dashboard snapshot events for live updates.

The browser UI uses this read path to maintain its active project context, render project, goal, task, agent, MCP, **memory**, and dashboard views, and keep project-scoped dashboard state synchronized with live backend data.

## System flow

The system operates through an active goal-driven coordination path, an active browser read path, and an active retrieval/indexing path backed by embeddings + sqlite-vec when configured. MCP stays focused on task lifecycle and hydrated payloads; artifact browsing is intentionally routed through HTTP/dashboard surfaces.

The system exposes standardized operation outcomes for mutation-style workflows so transport adapters can render actionable guidance without owning business rules themselves.

## Shared contracts

The system currently uses a canonical shared contract package at `packages/contracts` as the single source of truth for cross-app contracts.

The contract package is separated into three categories:

1. `primitives`
Base structural interfaces such as identity and auditable models.

2. `types`
Persisted or domain-facing entity/state contracts such as projects, goals, tasks, claimed tasks, task events, operation outcomes, and memory artifacts.

3. `dtos`
Transport-facing and workflow input/output shapes such as project and goal commands, task requests, task completions, task releases, task detail responses, dashboard snapshots, standardized operation results, hydrated task payloads, and model request DTOs.

Runtime validation schemas for these contracts live alongside them so MCP and HTTP can validate from the same source.
