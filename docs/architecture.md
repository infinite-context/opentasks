# Architecture

## Purpose

This document describes the system components and runtime flow for `opentasks`.

The architecture is based on a self-learning task management system that works alongside external agents, coordinates task execution through MCP, and preserves structured task state in SQLite (via Drizzle ORM) while the retrieval and learning subsystems continue to grow.

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

It visualizes backend task coordination state through HTTP and SSE, and it uses the same canonical project, task, and task event models that the backend uses internally.

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

It runs as a long-lived stdio MCP service and exposes task lifecycle tools to external agents.

These tools currently include task request, start, heartbeat, complete, fail, release, and task inspection operations.

### HTTP Server

The HTTP server is the browser-facing transport for dashboard and task inspection flows.

It exposes JSON read endpoints for dashboard snapshots, task lists, and task detail, and it exposes an SSE stream for live dashboard refresh.

It is built using Fastify and utilizes `fastify-type-provider-zod` for native request validation against the shared `@opentasks/contracts` schemas.

### Logger

The logger records operational events related to task requests and run processing.

It exists to preserve traceability around the execution and learning paths.

### Task Orchestrator

The task orchestrator coordinates task selection and overall task flow.

It requests available work from the task list manager and returns the claimed task for delivery through MCP.

### Task List Manager

The task list manager is responsible for selecting available work from the task database.

It handles task retrieval, assignment, and dependency-aware task availability.

### Task Query Service

The task query service provides read-oriented task list and task detail responses for browser consumers.

It assembles canonical task records and their related lifecycle events without embedding transport logic.

### Dashboard Query Service

The dashboard query service builds aggregate observability responses for the web UI.

It derives summary metrics, pipeline counts, recent activity, agent workload, and health views from canonical backend task and event data.

### Context Hydrator

The context hydrator enriches a selected task with relevant prior memory before the task is returned to the external agent.

It gathers this context through the vector search engine.

This component remains part of the architecture, but the active execution path currently returns claimed tasks directly while retrieval-backed hydration is still being introduced.

### Indexer

The indexer processes completed run data and prepares memory artifacts for storage.

It is responsible for turning run output into indexed chunks or other reusable context objects.

This component exists structurally but is not part of the active runtime startup path today.

### Vector Search Engine

The vector search engine retrieves relevant prior memory for task hydration and indexing workflows.

It queries the vector database and returns context for downstream use.

### Internal Agent

The internal agent is a lower-cost model-driven worker used during contextual indexing.

It processes run data and helps generate structured context artifacts for storage.

### Model Provider Service

The model provider service is the internal abstraction for model requests.

It sends requests to OpenRouter and returns responses to the internal agent.

It isolates provider-specific logic so additional model backends can be added later without changing the rest of the system.

## Storage components

### SQLite Task Database

The SQLite task database stores task state, dependency data, assignment state, task events, and task availability information.

It is the backing store queried by the task service. It uses Drizzle ORM for type-safe query building and schema management, replacing brittle raw SQL strings.

It is also the source of truth for persisted object identifiers. Project, task, and task event IDs use prefixed identifiers such as `project_<id>`, `task_<id>`, and `task_event_<id>`.

### Vector Database

The vector database stores indexed memory artifacts for retrieval.

It is used by both the vector search engine and the indexing workflow.

## Core loops

### Execution loop

The execution loop is the path used to prepare and return work to an external agent.

1. The external agent requests a task through the MCP server.
2. The MCP server forwards the request to the execution loop.
3. The execution loop forwards the request to the task orchestrator.
4. The task orchestrator asks the task list manager to claim the next available task.
5. The task list manager uses the Drizzle-backed SQLite task database for dependency-aware atomic claiming.
6. The claimed task is returned through the MCP server to the external agent.

The MCP surface also supports additional lifecycle operations after claiming a task:

1. The external agent marks the task as started.
2. The external agent renews the task lease through heartbeats while work is in progress.
3. The external agent completes, fails, or releases the task.
4. Each transition is persisted and recorded in the task event log.

### Learning loop

The learning loop is the path used to turn completed work into reusable memory.

1. The external agent submits completed run context back to the system.
2. The MCP server forwards that context to the indexer.
3. The indexer calls the internal agent for contextual indexing work.
4. The internal agent sends model requests through the model provider service.
5. The model provider service communicates with OpenRouter.
6. The internal agent returns generated context artifacts to the indexing workflow.
7. The indexer inserts or updates stored memory in the vector database.

### Dashboard read path

The dashboard read path is the browser-facing observability flow.

1. The web UI requests a dashboard snapshot through the HTTP server.
2. The HTTP server validates query parameters with shared schemas.
3. The HTTP server calls the dashboard query service or task query service.
4. The query service loads canonical project, task, and event data from the task store.
5. Aggregate dashboard DTOs are built around canonical entities.
6. The response is returned to the browser as JSON.
7. The SSE endpoint periodically emits fresh dashboard snapshot events for live updates.

## System flow

The system currently operates through an active task coordination path, an active dashboard read path, and a defined learning path. The task path handles task selection, dependency-aware claiming, lease management, lifecycle transitions, and delivery through MCP. The dashboard path handles browser-oriented observability through HTTP and SSE over the same task store. The learning path remains part of the architecture and continues to define how completed work will eventually become reusable context for future runs.

## Shared contracts

The system currently uses a canonical shared contract package at `packages/contracts`, with server-local `shared` modules acting as app-level facades where helpful.

The contract package is separated into three categories:

1. `primitives`
Base structural interfaces such as identity and auditable models.

2. `types`
Persisted or domain-facing entity/state contracts such as projects, tasks, claimed tasks, task events, and memory artifacts.

3. `dtos`
Transport-facing and workflow input/output shapes such as task requests, task completions, task releases, task detail responses, dashboard snapshots, hydrated task payloads, and model request DTOs.

Runtime validation schemas for these contracts live alongside them so MCP and HTTP can validate from the same source.
