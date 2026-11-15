import { spawn } from "node:child_process";

console.log("[animoriv2] Starting dev server (backend on :4000, Vite on :5173)...");

const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:server"], {
  stdio: "inherit",
});

const client = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:client"], {
  stdio: "inherit",
});

const shutdown = () => {
  console.log("\n[animoriv2] Shutting down dev services...");
  try {
    server.kill();
  } catch {}
  try {
    client.kill();
  } catch {}
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);
