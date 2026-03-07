# opentasks

`opentasks` is an open, model-agnostic runtime for task coordination, context hydration, and cross-session learning for external agents.

## Overview

Agents can perform well within a single run, but they often lose continuity across runs. On large projects and long-running workflows, that leads to repeated discovery work, unnecessary token use, and weaker reuse of prior progress.

`opentasks` is designed to preserve task-relevant context outside the model. It helps external agents start work with better awareness of prior runs, project state, and reusable memory.

## Core flow

1. An external agent requests work from the system.
2. The system selects a task and hydrates it with relevant prior context.
3. The agent performs the task with that context.
4. The completed run is processed into reusable memory.
5. Future tasks can retrieve that memory and start from a stronger state.

## System characteristics

- Model-agnostic
- External to any single agent client
- Built around task coordination and context hydration
- Designed to learn from completed work and reuse that knowledge later

## Documentation

- [`docs/architecture.md`](./docs/architecture.md): system components and runtime flow
