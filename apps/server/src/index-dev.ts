import { createApp } from "./app";

async function main(): Promise<void> {
  const app = createApp();
  await app.run();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
