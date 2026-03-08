export interface Logger {
  section(title: string): void;
  step(scope: string, message: string): void;
  info(scope: string, message: string): void;
}

function formatScope(scope: string): string {
  return scope.padEnd(24, " ");
}

export function createLogger(): Logger {
  let stepCount = 0;

  return {
    section(title) {
      stepCount = 0;
      console.error(`\n=== ${title} ===`);
    },
    step(scope, message) {
      stepCount += 1;
      const number = String(stepCount).padStart(2, "0");
      console.error(`${number}. ${formatScope(scope)} ${message}`);
    },
    info(scope, message) {
      console.error(`-  ${formatScope(scope)} ${message}`);
    }
  };
}
