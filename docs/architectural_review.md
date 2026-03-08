# Architectural Review & Codebase Audit

This document outlines the findings from a comprehensive review of the entire repository (`apps/server`, `apps/web`, `apps/data`, and `packages/contracts`). The objective of this review is to identify nonstandard practices, inconsistent implementations, redundant abstractions, and scaling bottlenecks.

## 1. Nonstandard, Impractical Practices

*   **Vanilla DOM Manipulation for a Complex UI (`apps/web`):** The frontend is built entirely using vanilla TypeScript and raw HTML string templates (e.g., `renderDashboardView` returning template literals). This is a highly impractical approach for a modern, stateful dashboard. It lacks reactivity, component lifecycle management, and built-in XSS protection, making it incredibly difficult to maintain and scale.
*   **Custom HTTP Server from Scratch (`apps/server`):** The backend relies on a custom-built HTTP server using raw `node:http` (`apps/server/src/transport/http/http-server.ts`). Routing is handled via manual `if (url.pathname === ...)` blocks, and query parameters are parsed manually. This completely ignores industry-standard frameworks (like Express, Fastify, or NestJS) that provide robust routing, middleware, and error handling out of the box.

## 2. Inconsistent or Hacky Attempts to Solve Problems

*   **Routing via If/Else Chains:** The `handleRequest` function in `http-server.ts` uses a massive chain of `if/else` statements to route requests. This is a hacky solution that will quickly become unmanageable as the API surface grows.
*   **Manual Server-Sent Events (SSE):** The dashboard streaming endpoint (`/api/dashboard/stream`) manually constructs SSE responses using `response.write()`. While functional, this is error-prone and better handled by a dedicated library or framework feature.
*   **Manual Dependency Injection:** The server uses a custom factory-based dependency injection pattern (e.g., `createApp`, `createHttpTransport`, `createExecutionLoop` in `app.ts`). While not inherently wrong, manually wiring every single dependency adds boilerplate and complexity that a standard DI container would eliminate.

## 3. Redefined Models, Classes, and Unnecessary Abstractions

*   **Unnecessary Type Re-exports (`apps/server/src/shared/`):** The server has files like `types.ts`, `dtos.ts`, and `primitives.ts` inside a `shared` folder that do nothing but re-export types from `@opentasks/contracts`. This creates an unnecessary abstraction layer. The server should import directly from the contracts package to avoid confusion about where the source of truth lies.
*   **Over-engineered Service Layers (Pass-throughs):** The backend suffers from severe "pass-through" over-engineering. For example, the flow for claiming a task goes:
    1.  `ExecutionLoop.run()` calls...
    2.  `TaskOrchestrator.prepareTask()`, which calls...
    3.  `TaskListManager.claimNextTask()`, which calls...
    4.  `TaskStore.claimNextTask()`.
    
    None of these intermediate layers (`ExecutionLoop`, `TaskOrchestrator`, `TaskListManager`) add meaningful business logic; they simply log a message and pass the arguments down the chain. This bloats the codebase, increases cognitive load, and makes tracing execution unnecessarily difficult.

## 4. Poor Implementation Choices That Hinder Scaling

*   **Frontend Architecture:** Scaling the `apps/web` dashboard will be nearly impossible. As new features, interactive elements, and complex state requirements are added, the manual string concatenation and DOM event listener management will lead to "spaghetti code" and severe performance bottlenecks (due to full DOM re-renders instead of virtual DOM diffing).
*   **Backend Middleware & Extensibility:** Because the server uses raw `node:http`, adding standard features like authentication, rate limiting, request validation, or CORS configurations will require writing custom boilerplate for every route, rather than simply plugging in standard middleware.
*   **Raw SQL Database Access:** The `sqlite-task-database.ts` file uses raw SQL strings with `better-sqlite3`. While fast, managing complex queries, relationships, and future database migrations this way is brittle. Without a Query Builder (like Kysely or Knex) or an ORM (like Prisma or Drizzle), scaling the data model will be prone to runtime errors and SQL injection vulnerabilities if not handled perfectly.

## 5. Areas of the Project Needing Refinement

*   **Frontend Rewrite:** The `apps/web` application needs to be completely rewritten using a modern UI framework (React, Vue, or Svelte). This is the most critical technical debt in the repository.
*   **Backend Framework Adoption:** The custom `node:http` server should be replaced with a standard framework like Fastify or Express to handle routing, validation (integrating with the existing Zod schemas), and middleware.
*   **Architecture Flattening:** The backend service layers (`ExecutionLoop`, `TaskOrchestrator`, `TaskListManager`) should be consolidated or removed entirely if they do not contain distinct, necessary business logic. The transport layer should likely interact directly with the application services or data stores.
*   **Direct Contract Usage:** Remove the `apps/server/src/shared` directory and update all imports to pull directly from `@opentasks/contracts`.
*   **Database Tooling:** Adopt a query builder or ORM for the SQLite database to improve maintainability and type safety of database operations.

---

## Architectural Assessment

### Is the project in a good place architecturally?
**No.** The project suffers heavily from "Not Invented Here" syndrome. By choosing to build custom, low-level implementations for the HTTP server and the frontend UI, the architecture has bypassed years of industry standardization. Furthermore, the backend is over-engineered with unnecessary abstraction layers (pass-through services) that don't provide actual value but increase complexity.

### Is the project in a place that it can scale and be built on top of without fragmenting?
**No.** The current foundation is extremely brittle. If a team tries to build on top of the vanilla HTML string frontend, it will quickly fragment into unmaintainable, bug-prone code. Similarly, adding new API endpoints to the backend will result in massive, unreadable `if/else` routing blocks. The lack of standard frameworks means every new developer will have to learn a custom, non-standard way of doing basic tasks, which severely limits team scaling.

### Are we happy with where this project is currently at?
**No.** While the project might function currently as a proof-of-concept, the technical debt is critically high. The core infrastructure (routing, UI rendering, data access) needs to be replaced with standard, scalable tools before any significant feature development continues. The current state is a liability for future development.