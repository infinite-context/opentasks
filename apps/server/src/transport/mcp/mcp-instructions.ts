/**
 * Server instructions for the OpenTasks MCP server.
 * These are injected into the LLM system prompt to guide agent behavior.
 * See: https://modelcontextprotocol.io/blog/server-instructions
 */
export const MCP_SERVER_INSTRUCTIONS = `OpenTasks coordinates project goals and tasks for external agents.

Always call start_session(workingDirectory) first, using your current working directory root (the project/workspace path). This creates or finds the project for your scope. The response text includes the canonical project id and working directory—copy the project id when needed for dashboards or debugging.

Do not call create_goal, create_task, request_task, claim_task_by_id, or other project-scoped tools before start_session.

Lifecycle (typical):

1. start_session — establishes scope and returns project metadata (including project id).

2. create_goal / create_task — shape work inside the project.

3. Claim work — either request_task (orchestrator picks the next dependency-ready task) or claim_task_by_id for a specific task id.

4. start_task — move an assigned task to in_progress.

5. heartbeat_task — renew leases while working.

6. Terminal transitions — complete_task, fail_task, or release_task.

7. Optional learning inputs — after completion/failure, submit_task_context posts lightweight notes into the learning/indexing pipeline. Rich run exports belong in submit_run_context.

Owned-runtime sessions:

If you control the runtime and can reliably export structured run evidence (commands, files touched, errors, decisions), declare client.capability as owned_runtime in start_session. Owned-runtime sessions may call submit_run_context after a task is terminal.

Most MCP hosts (including Cursor-style agents that cannot programmatically attach transcripts) should keep client.capability at black_box (default). Do not choose owned_runtime unless you integrate submit_run_context in code.

Inspection:

Use get_goals and list_tasks for ids (summaries include ids where applicable). Use get_project_overview for dashboard-style snapshots.

Browsing indexed learned memory is intended for the web dashboard (HTTP APIs under /api/memory), not primary MCP outputs—agents stay focused on tasks and hydrated context when claiming work.
`;
