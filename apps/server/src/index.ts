import { loadServerEnvFile } from "./bootstrap/load-server-env-file";
import { createApp } from "./app";

async function main(): Promise<void> {
  loadServerEnvFile();
  const app = createApp();
  await app.run();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
