#!/usr/bin/env node
/**
 * Daybreak tunnel agent — runs on the PC.
 * Polls the Vercel dashboard for start/stop commands, verifies the sudo
 * password locally, then brings cloudflared up or down.
 *
 * Env (required):
 *   TUNNEL_AGENT_TOKEN   shared secret with Vercel
 *   DASHBOARD_URL        e.g. https://acunetix-dashboard.vercel.app
 *
 * Optional:
 *   CLOUDFLARED_BIN      default: cloudflared
 *   ACUNETIX_ORIGIN      default: https://127.0.0.1:3443
 *   AGENT_LOG            default: /tmp/daybreak-tunnel-agent.log
 */
import { spawn, execFile } from "node:child_process";
import { createWriteStream, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { webcrypto } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const execFileAsync = promisify(execFile); // used for pkill

const DASHBOARD_URL = (process.env.DASHBOARD_URL || "").replace(/\/$/, "");
const TOKEN = process.env.TUNNEL_AGENT_TOKEN || "";
const CLOUDFLARED = process.env.CLOUDFLARED_BIN || "cloudflared";
const ORIGIN = process.env.ACUNETIX_ORIGIN || "https://127.0.0.1:3443";
const LOG_FILE = process.env.AGENT_LOG || "/tmp/daybreak-tunnel-agent.log";
const CF_LOG = process.env.CLOUDFLARED_LOG || "/tmp/cloudflared-acunetix.log";
const STATE_FILE =
  process.env.TUNNEL_STATE_FILE ||
  join(homedir(), ".daybreak-tunnel-state.json");

if (!DASHBOARD_URL || !TOKEN) {
  console.error("Set DASHBOARD_URL and TUNNEL_AGENT_TOKEN");
  process.exit(1);
}

let cloudflaredProc = null;
let publicUrl = null;
let lastError = null;
let lastResult = null;

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(line);
  try {
    writeFileSync(LOG_FILE, `${line}\n`, { flag: "a" });
  } catch {
    /* ignore */
  }
}

function saveState() {
  try {
    mkdirSync(join(homedir()), { recursive: true });
    writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          publicUrl,
          tunnelUp: Boolean(cloudflaredProc && !cloudflaredProc.killed),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } catch {
    /* ignore */
  }
}

async function api(path, init = {}) {
  const response = await fetch(`${DASHBOARD_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(
      `API ${path} failed (${response.status}): ${json?.error || text}`,
    );
  }
  return json;
}

function tunnelUp() {
  return Boolean(cloudflaredProc && cloudflaredProc.exitCode === null);
}

async function heartbeat(extra = {}) {
  await api("/api/tunnel/agent/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      tunnelUp: tunnelUp(),
      publicUrl: tunnelUp() ? publicUrl : null,
      error: lastError,
      result: lastResult,
      ...extra,
    }),
  });
}

function toBuf(b64) {
  return Buffer.from(b64, "base64");
}

async function openSealed(sealed) {
  const [ivB64, dataB64] = sealed.split(".");
  const hash = await webcrypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(TOKEN),
  );
  const key = await webcrypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "decrypt",
  ]);
  const plain = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(ivB64) },
    key,
    toBuf(dataB64),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function verifySudoPassword(password) {
  return new Promise((resolve) => {
    const child = spawn("sudo", ["-S", "-k", "-p", "", "true"], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 15_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.stdin.write(`${password}\n`);
    child.stdin.end();
  });
}

async function stopTunnel(password) {
  const ok = await verifySudoPassword(password);
  if (!ok) throw new Error("PC password rejected by sudo");

  // Authorized: stop cloudflared (does not need root after verification)
  if (cloudflaredProc && cloudflaredProc.exitCode === null) {
    cloudflaredProc.kill("SIGTERM");
    await sleep(800);
    if (cloudflaredProc.exitCode === null) cloudflaredProc.kill("SIGKILL");
  }
  cloudflaredProc = null;

  try {
    await execFileAsync("pkill", ["-f", "cloudflared tunnel --url"]);
  } catch {
    /* no matching process */
  }

  publicUrl = null;
  lastError = null;
  lastResult = "Tunnel stopped";
  saveState();
  log("tunnel stopped");
}

function waitForUrl(timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      try {
        const { readFileSync } = await import("node:fs");
        const text = readFileSync(CF_LOG, "utf8");
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi);
        if (match?.length) {
          clearInterval(timer);
          resolve(match[match.length - 1]);
          return;
        }
      } catch {
        /* log not ready */
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for trycloudflare URL"));
      }
    }, 500);
  });
}

async function startTunnel(password) {
  const ok = await verifySudoPassword(password);
  if (!ok) throw new Error("PC password rejected by sudo");

  if (tunnelUp()) {
    lastResult = `Tunnel already up at ${publicUrl}`;
    return;
  }

  // Clear old log so we detect the new URL
  try {
    writeFileSync(CF_LOG, "");
  } catch {
    /* ignore */
  }

  const out = createWriteStream(CF_LOG, { flags: "a" });
  cloudflaredProc = spawn(
    CLOUDFLARED,
    [
      "tunnel",
      "--url",
      ORIGIN,
      "--no-tls-verify",
      "--edge-ip-version",
      "4",
      "--logfile",
      CF_LOG,
      "--loglevel",
      "info",
    ],
    {
      detached: false,
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  cloudflaredProc.on("exit", (code) => {
    log(`cloudflared exited code=${code}`);
    cloudflaredProc = null;
    publicUrl = null;
    saveState();
  });
  out.end();

  publicUrl = await waitForUrl();
  lastError = null;
  lastResult = `Tunnel started: ${publicUrl}`;
  saveState();
  log("tunnel started", publicUrl);
}

async function handleCommand(command) {
  const payload = await openSealed(command.sealedPassword);
  if (!payload?.password) throw new Error("Missing password in command");
  if (payload.exp && Date.now() > payload.exp) {
    throw new Error("Command expired");
  }

  if (command.action === "start") {
    await startTunnel(payload.password);
  } else if (command.action === "stop") {
    await stopTunnel(payload.password);
  } else {
    throw new Error(`Unknown action ${command.action}`);
  }
}

async function main() {
  log("agent starting", DASHBOARD_URL);
  for (;;) {
    try {
      await heartbeat();
      const polled = await api("/api/tunnel/agent/poll");
      if (polled?.command) {
        log("received command", polled.command.action, polled.command.id);
        try {
          await handleCommand(polled.command);
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          lastResult = null;
          log("command failed", lastError);
        }
        await heartbeat();
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      log("loop error", lastError);
    }
    await sleep(2000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
