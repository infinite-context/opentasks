import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  process.loadEnvFile(filePath);
}

export function loadServerEnvFile(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envFilePath = resolve(__dirname, "../../.env");
  loadEnvFile(envFilePath);
}
