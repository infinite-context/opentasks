/**
 * Server instructions for the OpenTasks MCP server.
 * These are injected into the LLM system prompt to guide agent behavior.
 * See: https://modelcontextprotocol.io/blog/server-instructions
 */
export const MCP_SERVER_INSTRUCTIONS = `OpenTasks coordinates project goals and tasks for external agents.

Always call start_session(workingDirectory) first, using your current working directory root (the project/workspace path). This creates or finds the project for your scope. Do not call create_goal, create_task, request_task, or other project-scoped tools before start_session.

Workflow: 1) start_session with working directory root, 2) create_goal to define work, 3) create_task to add tasks inside goals, 4) request_task to ask the orchestrator for the next task. Use get_project_overview to inspect project state.`;
