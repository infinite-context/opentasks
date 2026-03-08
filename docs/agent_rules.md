# Agent Rules

## Purpose

This document defines how `opentasks` should be structured as the codebase grows.

It is not a product-scope document. It is the implementation structure guide for building new components, extending existing ones, and integrating new capabilities without breaking architectural boundaries.

## Primary goals

The project structure must optimize for:

1. Clear separation of responsibilities.
2. Safe integration of new components into existing flows.
3. Easy replacement of infrastructure details without rewriting business logic.
4. Predictable file layout and naming across the codebase.
5. Growth from a runnable skeleton into a production system without major rewrites.

## Architectural model

The system is organized around three core layers that already exist in the codebase:

- `transport`
- `system`
- `infra`

Supporting these layers are:

- `shared`
- `docs`
- workspace-level app and package boundaries

These layers must remain explicit. New code should strengthen this separation rather than blur it.

## Repository layout

The repository should continue to use a workspace-based layout:

```text
/
  apps/
    server/
      src/
        transport/
        system/
        infra/
        shared/
      package.json
  docs/
    architecture.md
    agent_rules.md
  package.json
```

As the project expands, use this layout:

```text
/
  apps/
    server/                # Main backend runtime
    worker/                # Optional async/background runtime
    web/                   # Optional UI or admin app
  packages/
    contracts/             # Shared DTOs, schemas, MCP contracts
    sdk/                   # Client helpers for external agents
    config/                # Shared config utilities
    testing/               # Shared test helpers and fixtures
  docs/
```

Rule: deployable runtimes belong in `apps/*`. Reusable cross-app code belongs in `packages/*`.

## Layer responsibilities

### `transport`

`transport` is the system boundary. It translates external requests into internal calls and translates internal results back into transport-specific responses.

Allowed responsibilities:

- MCP request and response handling
- protocol validation
- transport adapters
- serialization and deserialization
- mapping between external payloads and internal application contracts

Not allowed:

- business orchestration
- persistence logic
- model provider logic
- task selection rules

### `system`

`system` contains application behavior and use-case orchestration.

Allowed responsibilities:

- execution flow
- learning flow
- task preparation
- context hydration
- indexing logic
- coordination between ports and services

Not allowed:

- direct vendor SDK calls
- direct database client ownership
- protocol-specific request parsing

### `infra`

`infra` contains implementation details for external dependencies.

Allowed responsibilities:

- database adapters
- provider integrations
- logging implementations
- configuration loading
- storage implementations

Not allowed:

- owning end-to-end workflow decisions
- embedding transport-specific behavior unless the component itself is a transport adapter

### `shared`

`shared` contains small, stable, cross-layer contracts used inside a single app.

Allowed responsibilities:

- core types
- value objects
- shared enums
- small utility contracts

Not allowed:

- business workflows
- infrastructure implementations
- large utility dumping grounds

If shared contracts need to be reused by multiple apps, promote them into `packages/contracts`.

### Shared contract split

Inside an app, `shared` should be split by responsibility rather than treated as a single contract file.

Use:

- `shared/primitives.ts` for structural base interfaces such as `IdentityModel` and `AuditableModel`
- `shared/types.ts` for persisted or domain-facing entity/state contracts
- `shared/dtos.ts` for transport-facing DTOs, command payloads, and non-persisted request/response contracts

Rule: if a shape represents stored entity state, it belongs in `types.ts`. If a shape represents input/output across a boundary, it belongs in `dtos.ts`.

## Dependency rules

Dependencies must move inward toward business logic through interfaces, not outward through implementation leakage.

Allowed dependency direction inside an app:

- `transport` -> `system`
- `system` -> `shared`
- `system` -> `infra` only through explicit interfaces or injected implementations
- `infra` -> `shared`

Disallowed dependencies:

- `system` importing transport adapters
- `shared` importing from `transport`, `system`, or `infra`
- `infra` calling into transport
- sibling system modules reaching into each other's private files

Rule: if a component needs an external capability, define a port/type for the dependency and inject the implementation.

## Component design rules

Each system component should live in its own folder and follow the current pattern:

```text
component-name/
  index.ts
  component-name.ts
  types.ts
```

Use this structure when the component has real behavior or public types. Very small leaf modules may omit `types.ts` if it adds no value.

### Required module shape

Prefer this pattern:

- `createX()` factory function
- `X` interface in `types.ts` or the main file
- constructor params grouped into a `CreateXParams` interface
- dependencies injected explicitly

This gives the project consistent composition, testing, and replacement behavior.

### Public API rule

Every module folder should export a stable public surface through `index.ts`.

Consumers should import from:

- `./system/task-orchestrator`
- not `./system/task-orchestrator/task-orchestrator`

Rule: internal files are private unless exported through the folder's `index.ts`.

## Integration rules

When integrating a new component, decide first which role it plays:

1. Boundary adapter
2. Orchestrator or use-case service
3. Infrastructure adapter
4. Shared contract package

Integration must happen through the correct seam.

### Add a new transport

If adding HTTP, queue consumers, CLI commands, or another protocol:

- place the adapter in `transport/<transport-name>`
- map external payloads into internal request contracts
- call system components only through their public interfaces
- do not embed business rules in transport handlers

### Add a new system capability

If adding a new workflow or business process:

- create a new module in `system/<capability-name>`
- keep it focused on one use case or one orchestration concern
- inject dependencies rather than constructing infra internally
- expose a minimal interface

### Add a new provider or storage implementation

If adding PostgreSQL, Redis, a vector engine, or another model provider:

- place the implementation in `infra`
- define or reuse the port/interface used by `system`
- keep vendor-specific logic fully contained in the adapter
- never let vendor response shapes leak into system contracts

## Naming rules

Use descriptive, explicit names that reflect the architecture.

- folders: kebab-case
- files: kebab-case
- interfaces: PascalCase
- factory functions: `createX`
- transport adapters: `<transport>-<role>`
- provider adapters: `<vendor>-provider`
- storage adapters: `<technology>-<resource>`

Prefer names that reflect behavior, such as:

- `task-orchestrator`
- `context-hydrator`
- `model-provider-service`

Avoid vague names such as:

- `utils`
- `helpers`
- `manager2`
- `misc`

## Contract rules

Contracts must be stable and intentional.

- Transport contracts describe external interaction.
- System contracts describe use-case inputs and outputs.
- Infra contracts describe implementation capabilities behind ports.
- Shared contracts describe app-level primitives.

Rule: do not pass raw vendor SDK objects across layers.

Rule: persisted models should extend at least `IdentityModel`. Persisted models with lifecycle timestamps should extend `AuditableModel`.

Rule: request objects, mutation payloads, and transport responses should be modeled as DTOs rather than entity types.

Rule: if a type crosses more than one app boundary, move it into `packages/contracts` and back it with runtime validation when appropriate.

## Composition rules

Application composition should happen near the app root, not deep inside feature modules.

Current composition belongs in files like:

- `apps/server/src/app.ts`

Continue using the root composition pattern:

- load config
- construct infra implementations
- construct system services
- wire transports and loops

Rule: feature modules should not instantiate their own databases, provider clients, or sibling services unless there is an explicit factory boundary for that purpose.

## Data and persistence rules

Persistence logic must stay behind storage interfaces.

- `system` decides what data it needs
- `infra/storage` decides how that data is retrieved or stored

Guidelines:

- keep query logic in storage adapters
- return domain-relevant contracts, not raw database rows
- isolate migration or driver-specific code from orchestration code
- use one adapter per responsibility where practical
- let the database generate persisted identifiers on insert and hydrate the created model from the returned row
- use prefixed object identifiers for persisted records, following the Stripe-style pattern such as `task_<id>` or `project_<id>`

Examples:

- task state storage
- vector memory storage
- future run history storage

## Model integration rules

All external model access must be routed through a provider abstraction.

- provider-specific code belongs in `infra/providers`
- provider orchestration belongs in `system/model-provider-service`
- downstream components depend on the service contract, not on a specific vendor

Rule: prompt construction and model usage policy should live close to the use case that needs it, while HTTP/API details stay inside the provider adapter.

## Observability rules

Operational visibility must be built in from the start.

- system modules should emit meaningful step-level logs
- infra adapters should log important boundary actions
- transport adapters should log request lifecycle events

Logging should describe:

- what the component is doing
- why the next handoff is occurring
- the minimal identifiers needed for tracing

Do not log secrets, full prompt bodies, or sensitive payloads by default.

## Testing strategy rules

The project should grow with a layered testing strategy.

- unit tests for system modules using mocked ports
- adapter tests for infra implementations
- transport tests for request and response translation
- integration tests for end-to-end workflow slices

Placement guidance:

- colocated tests for module-level behavior are acceptable
- shared fixtures and builders should move to `packages/testing` once reused

Rule: system behavior should be testable without booting real providers or databases.

## Documentation rules

Architecture documentation must stay aligned with the code.

When adding or changing a major component:

- update `docs/architecture.md` if the runtime flow changes
- update `docs/agent_rules.md` if the structural rule set changes
- add module-level README or doc comments only when the behavior is non-obvious

## Change checklist

Before introducing a new component, confirm:

1. The component belongs in the correct layer.
2. The public interface is clear and minimal.
3. Dependencies are injected, not hidden.
4. External implementation details do not leak across boundaries.
5. The module can be imported through an `index.ts` boundary.
6. Names match the project's naming conventions.
7. Related docs are updated if the architecture changed.

## Non-negotiable rules

These rules should be treated as default architectural constraints:

- Do not place business logic in `transport`.
- Do not let `infra` define workflow behavior.
- Do not let `shared` become a catch-all folder.
- Do not bypass public module boundaries.
- Do not couple system logic directly to vendors.
- Do not add new top-level folders without a clear architectural reason.

## Decision principle

When a structural choice is unclear, prefer:

1. explicit boundaries over convenience
2. small composable modules over large multi-purpose classes
3. dependency injection over hidden construction
4. contracts owned by the consumer side of the boundary
5. implementation replaceability over short-term speed

If a proposed change violates one of these principles, the default answer should be to redesign the integration rather than force it into the current structure.
