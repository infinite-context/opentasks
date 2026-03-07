export interface Logger {
  section(title: string): void;
  step(scope: string, message: string): void;
  info(scope: string, message: string): void;
}

function formatLine(scope: string, message: string): string {
  return `${new Date().toISOString()} [${scope}] ${message}`;
}

export function createLogger(): Logger {
  return {
    section(title) {
      console.log(`\n=== ${title} ===`);
    },
    step(scope, message) {
      console.log(formatLine(scope, message));
    },
    info(scope, message) {
      console.log(formatLine(scope, message));
    }
  };
}
