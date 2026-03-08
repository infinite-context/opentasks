# OpenTasks Cleanup & Modernization Plan

Based on the architectural review, the following plan outlines the concrete, step-by-step actions required to resolve the project's technical debt. To ensure consistency and avoid decision fatigue, this plan prescribes a single, optimal technology stack for each domain.

## Phase 1: Contracts & Type Consolidation

**Objective:** Establish a single source of truth for types and schemas.

1. **Delete Redundant Abstractions:** Remove the entire `apps/server/src/shared` directory (`types.ts`, `dtos.ts`, `primitives.ts`).
2. **Update Imports:** Refactor all backend files to import types, interfaces, and Zod schemas directly from `@opentasks/contracts`. 

## Phase 2: Database Layer Modernization (Drizzle ORM)

**Objective:** Replace brittle raw SQL strings with a type-safe, scalable ORM.
**Selected Technology:** **Drizzle ORM** (Lightweight, edge-compatible, excellent SQLite support, and strict type safety).

1. **Install Dependencies:** Add `drizzle-orm` and `drizzle-kit` to `apps/server`.
2. **Define Schema:** Translate the existing SQLite schema (`sqlite-schema.ts`) into Drizzle schema definitions.
3. **Refactor Data Access:** Rewrite `sqlite-task-database.ts` to use Drizzle's query builder instead of `db.prepare(...).run()`.
4. **Implement Migrations:** Set up Drizzle Kit to handle future database migrations automatically, replacing the manual `applySqliteSchema` script.

## Phase 3: Backend Framework & Architecture Flattening

**Objective:** Replace the custom HTTP server and pass-through layers with an industry-standard framework.
**Selected Technology:** **Fastify** (Extremely fast, excellent TypeScript support, and native Zod integration).

1. **Adopt Fastify:** Replace the raw `node:http` implementation in `http-server.ts` with Fastify.
2. **Integrate Zod:** Use `fastify-type-provider-zod` to automatically validate incoming requests and query parameters using the existing schemas in `@opentasks/contracts/schemas`.
3. **Replace Manual SSE:** Utilize `fastify-sse-v2` (or similar Fastify SSE plugin) to handle the dashboard stream endpoint, removing the manual `response.write()` logic.
4. **Flatten Architecture:** 
    * Delete `ExecutionLoop`, `TaskOrchestrator`, and `TaskListManager`.
    * Create a single, cohesive `TaskService` that handles the core business logic.
    * Route handlers (Fastify controllers) will call the `TaskService`, which directly interfaces with the Drizzle-backed `TaskStore`.
5. **Idiomatic Dependency Injection:** Remove the manual factory wiring in `app.ts`. Instead, register the `TaskStore` and `TaskService` as Fastify plugins (`fastify-plugin`), allowing them to be injected seamlessly into route handlers via the Fastify instance.

## Phase 4: Frontend Rewrite

**Objective:** Replace the unmaintainable vanilla DOM manipulation with a modern, reactive UI framework.
**Selected Technology:** **React** (Bootstrapped with **Vite**, styled with **Tailwind CSS**, state managed by **React Query**).

1. **Bootstrap Vite:** Clear out the existing vanilla TypeScript setup in `apps/web` and initialize a new React + TypeScript project using Vite.
2. **Component Migration:** Convert the raw HTML string templates (e.g., `renderDashboardView`, `renderMetricGrid`) into modular React components (`<Dashboard />`, `<MetricGrid />`).
3. **State Management:** Implement `@tanstack/react-query` to handle fetching data from the Fastify backend, caching, and managing loading/error states.
4. **SSE Integration:** Create a custom React hook (`useDashboardStream`) to consume the Server-Sent Events from the backend and update the React state reactively.
5. **Styling:** Adopt Tailwind CSS to replace any manual CSS, ensuring a consistent, scalable design system.

---

## Summary of the Target Architecture

* **Frontend:** React + Vite + Tailwind CSS + React Query
* **Backend Framework:** Fastify
* **Validation:** Zod (Shared via `@opentasks/contracts`)
* **Database:** SQLite + Drizzle ORM
* **Architecture Pattern:** Controller (Fastify Routes) -> Service (`TaskService`) -> Repository (`TaskStore`)