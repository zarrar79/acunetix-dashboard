#!/usr/bin/env node
/**
 * Thin wrapper — real logic lives in tunnel-ctl.mjs (hardcoded PC script).
 * systemd runs: node scripts/tunnel-ctl.mjs agent
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [join(dir, "tunnel-ctl.mjs"), "agent"], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
