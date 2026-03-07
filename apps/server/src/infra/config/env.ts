export interface AppEnv {
  appName: string;
  defaultAgentName: string;
  defaultProjectId: string;
  defaultProvider: string;
}

export function loadEnv(): AppEnv {
  return {
    appName: "opentasks",
    defaultAgentName: "external-agent",
    defaultProjectId: "demo-project",
    defaultProvider: "openrouter"
  };
}
