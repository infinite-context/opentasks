import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");
const LAUNCHER_PORT = Number.parseInt(process.env.OPENTASKS_LAUNCHER_PORT ?? "3006", 10);

let serverProcess: ReturnType<typeof spawn> | null = null;

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/start") {
    if (serverProcess) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Server already started" }));
      return;
    }

    serverProcess = spawn("npm", ["run", "start:server"], {
      cwd: projectRoot,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, OPENTASKS_MCP_OVER_HTTP: "true" }
    });
    serverProcess.unref();

    serverProcess.on("exit", (code) => {
      serverProcess = null;
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(LAUNCHER_PORT, "127.0.0.1", () => {
  console.log(`OpenTasks launcher listening on http://127.0.0.1:${LAUNCHER_PORT}`);
});
