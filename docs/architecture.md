# Architecture

## Purpose

This document describes the system components and runtime flow for `opentasks`.

The architecture is based on a self-learning task management system that works alongside external agents, hydrates tasks with prior context, and stores reusable knowledge from completed work.

## System boundary

The system is organized into three areas:

1. External components
Components that call into the system or provide external model access.

2. Internal components
Components inside `opentasks` that coordinate tasks, hydrate context, process run data, and generate reusable memory.

3. Storage components
Databases used for task state and retrievable memory.

## External components

### External Agent

The external agent is any client that requests work from the system and performs the task after receiving context.

Examples include coding agents, browser agents, and other MCP-capable runtimes.

### External Model Provider

OpenRouter is the default external model provider used by the system.

Additional providers can be supported through the model provider service.

## Internal components

### MCP Server

The MCP server is the entry point into the system.

It receives task requests from external agents and routes them into the task and indexing workflows.

### Logger

The logger records operational events related to task requests and run processing.

It exists to preserve traceability around the execution and learning paths.

### Task Orchestrator

The task orchestrator coordinates task selection and overall task flow.

It requests available work from the task list manager and works with the context hydrator before returning a task to the external agent.

### Task List Manager

The task list manager is responsible for selecting available work from the task database.

It handles task retrieval, assignment, and dependency-aware task availability.

### Context Hydrator

The context hydrator enriches a selected task with relevant prior memory before the task is returned to the external agent.

It gathers this context through the vector search engine.

### Indexer

The indexer processes completed run data and prepares memory artifacts for storage.

It is responsible for turning run output into indexed chunks or other reusable context objects.

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

### PostgreSQL Task Database

The PostgreSQL task database stores task state and task availability information.

It is the backing store queried by the task list manager.

### Vector Database

The vector database stores indexed memory artifacts for retrieval.

It is used by both the vector search engine and the indexing workflow.

## Core loops

### Execution loop

The execution loop is the path used to prepare and return work to an external agent.

1. The external agent requests a task through the MCP server.
2. The MCP server forwards the request to the task orchestrator.
3. The task orchestrator requests available work from the task list manager.
4. The task list manager queries the PostgreSQL task database.
5. The selected task is assigned to the context hydrator.
6. The context hydrator requests relevant memory through the vector search engine.
7. The vector search engine queries the vector database.
8. The hydrated task is returned through the MCP server to the external agent.

### Learning loop

The learning loop is the path used to turn completed work into reusable memory.

1. The external agent submits completed run context back to the system.
2. The MCP server forwards that context to the indexer.
3. The indexer calls the internal agent for contextual indexing work.
4. The internal agent sends model requests through the model provider service.
5. The model provider service communicates with OpenRouter.
6. The internal agent returns generated context artifacts to the indexing workflow.
7. The indexer inserts or updates stored memory in the vector database.

## System flow

The system operates through two connected paths. The task path handles task selection, context hydration, and task delivery to the external agent for the current run. The learning path handles completed run processing, contextual indexing, model-assisted memory generation, and storage of reusable context for future runs. Together, these paths allow the system to support the current task while improving the quality of later tasks.
