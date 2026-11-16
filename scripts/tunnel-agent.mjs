#!/usr/bin/env node
/**
 * Daybreak tunnel agent — runs on the PC (prefer systemd user service).
 *
 * - Polls dashboard for start/stop
 * - Verifies sudo password once on Start/Stop
 * - Auto-retries cloudflared when Cloudflare times out
 * - Auto-restarts tunnel if it dies while desiredUp=true (no AI / no re-approval)
 *
 * Env:
 *   TUNNEL_AGENT_TOKEN, DASHBOARD_URL (required)
 *   CLOUDFLARED_BIN, ACUNETIX_ORIGIN, AGENT_LOG, CLOUDFLARED_LOG
 *   START_MAX_ATTEMPTS (default 8)
 *   START_RETRY_MS (default 5000)
 */
import { spawn, execFile, execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { webcrypto } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const execFileAsync = promisify(execFile);

const DASHBOARD_URL = (process.env.DASHBOARD_URL || "").replace(/\/$/, "");
const TOKEN = process.env.TUNNEL_AGENT_TOKEN || "";
const CLOUDFLARED = process.env.CLOUDFLARED_BIN || "cloudflared";
const ORIGIN = process.env.ACUNETIX_ORIGIN || "https://127.0.0.1:3443";
const LOG_FILE = process.env.AGENT_LOG || "/tmp/daybreak-tunnel-agent.log";
const CF_LOG = process.env.CLOUDFLARED_LOG || "/tmp/cloudflared-acunetix.log";
const STATE_FILE =
  process.env.TUNNEL_STATE_FILE ||
  join(homedir(), ".daybreak-tunnel-state.json");
const START_MAX_ATTEMPTS = Number(process.env.START_MAX_ATTEMPTS || 8);
const START_RETRY_MS = Number(process.env.START_RETRY_MS || 5000);

if (!DASHBOARD_URL || !TOKEN) {
  console.error("Set DASHBOARD_URL and TUNNEL_AGENT_TOKEN");
  process.exit(1);
}

let cloudflaredProc = null;
let publicUrl = null;
let lastError = null;
let lastResult = null;
/** When true, agent keeps cloudflared up without asking again. */
let desiredUp = false;
let starting = false;
/** Set when the current spawn exits, so waiters don't miss it after detach. */
let spawnExitCode = null;

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(line);
  try {
    writeFileSync(LOG_FILE, `${line}\n`, { flag: "a" });
  } catch {
    /* ignore */
  }
}

function loadState() {
  try {
    if (!existsSync(STATE_FILE)) return;
    const data = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    desiredUp = Boolean(data.desiredUp);
    publicUrl = data.publicUrl || null;
  } catch {
    /* ignore */
  }
}

function saveState() {
  try {
    writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          desiredUp,
          publicUrl: desiredUp ? publicUrl : null,
          tunnelUp: tunnelUp(),
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

function readLatestUrl() {
  try {
    const text = readFileSync(CF_LOG, "utf8");
    if (/failed to request quick Tunnel|deadline exceeded/i.test(text)) {
      return null;
    }
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi);
    if (match?.length) return match[match.length - 1];
  } catch {
    /* ignore */
  }
  return null;
}

function cloudflaredPids() {
  try {
    const out = execFileSync(
      "pgrep",
      ["-f", "cloudflared tunnel --url https://127.0.0.1:3443"],
      { encoding: "utf8" },
    );
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function tunnelUp() {
  if (cloudflaredProc && cloudflaredProc.exitCode === null) return true;
  return cloudflaredPids().length > 0;
}

async function heartbeat(extra = {}) {
  const up = tunnelUp();
  if (up && !publicUrl) publicUrl = readLatestUrl();
  if (!up) publicUrl = null;
  await api("/api/tunnel/agent/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      tunnelUp: up,
      publicUrl: up ? publicUrl : null,
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

async function killCloudflared() {
  if (cloudflaredProc && cloudflaredProc.exitCode === null) {
    try {
      cloudflaredProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    await sleep(700);
    if (cloudflaredProc && cloudflaredProc.exitCode === null) {
      try {
        cloudflaredProc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }
  cloudflaredProc = null;
  try {
    await execFileAsync("pkill", [
      "-f",
      "cloudflared tunnel --url https://127.0.0.1:3443",
    ]);
  } catch {
    /* none */
  }
  await sleep(400);
}

function waitForUrlOrFail(timeoutMs = 50_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      try {
        const text = readFileSync(CF_LOG, "utf8");
        if (
          /failed to request quick Tunnel|context deadline exceeded/i.test(
            text,
          )
        ) {
          clearInterval(timer);
          reject(new Error("cloudflared failed to create quick tunnel"));
          return;
        }
        if (spawnExitCode !== null) {
          clearInterval(timer);
          reject(new Error(`cloudflared exited early (code ${spawnExitCode})`));
          return;
        }
        const match = text.match(
          /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi,
        );
        if (match?.length && /Registered tunnel connection/i.test(text)) {
          clearInterval(timer);
          resolve(match[match.length - 1]);
          return;
        }
        if (match?.length) {
          // URL printed; accept even before "Registered" if process still alive
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
    }, 400);
  });
}

function spawnCloudflared() {
  try {
    writeFileSync(CF_LOG, "");
  } catch {
    /* ignore */
  }

  spawnExitCode = null;
  const child = spawn(
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
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
  cloudflaredProc = child;
  child.on("exit", (code) => {
    spawnExitCode = code;
    log(`cloudflared exited code=${code}`);
    if (cloudflaredProc === child) cloudflaredProc = null;
    publicUrl = null;
    saveState();
  });
  return child;
}

/**
 * Bring tunnel up with automatic retries. No Cursor/AI involvement.
 * Password only required when called from dashboard Start (authorization gate).
 */
async function ensureTunnelUp({ requirePassword, password } = {}) {
  if (starting) {
    log("start already in progress");
    return;
  }
  starting = true;
  try {
    if (requirePassword) {
      const ok = await verifySudoPassword(password || "");
      if (!ok) throw new Error("PC password rejected by sudo");
    }

    desiredUp = true;
    saveState();

    if (tunnelUp()) {
      publicUrl = readLatestUrl() || publicUrl;
      if (publicUrl) {
        lastError = null;
        lastResult = `Tunnel already up at ${publicUrl}`;
        saveState();
        return;
      }
      // Running but no URL yet — kill and retry fresh
      await killCloudflared();
    }

    let lastFail = "unknown";
    for (let attempt = 1; attempt <= START_MAX_ATTEMPTS; attempt += 1) {
      log(`cloudflared start attempt ${attempt}/${START_MAX_ATTEMPTS}`);
      lastResult = `Starting tunnel (attempt ${attempt}/${START_MAX_ATTEMPTS})…`;
      lastError = null;
      try {
        await heartbeat();
      } catch {
        /* continue */
      }

      await killCloudflared();
      spawnCloudflared();

      try {
        publicUrl = await waitForUrlOrFail(50_000);
        lastError = null;
        lastResult = `Tunnel started: ${publicUrl}`;
        saveState();
        log("tunnel started", publicUrl);
        await heartbeat();
        return;
      } catch (error) {
        lastFail = error instanceof Error ? error.message : String(error);
        lastError = `${lastFail} — retrying…`;
        log("start attempt failed", lastFail);
        await killCloudflared();
        if (attempt < START_MAX_ATTEMPTS) {
          await sleep(START_RETRY_MS);
        }
      }
    }

    desiredUp = true; // keep wanting up; watchdog will keep trying
    lastError = `Start failed after ${START_MAX_ATTEMPTS} attempts: ${lastFail}`;
    lastResult = null;
    saveState();
    throw new Error(lastError);
  } finally {
    starting = false;
  }
}

async function stopTunnel(password) {
  const ok = await verifySudoPassword(password);
  if (!ok) throw new Error("PC password rejected by sudo");

  desiredUp = false;
  await killCloudflared();
  publicUrl = null;
  lastError = null;
  lastResult =
    "Tunnel stopped. Public URL is offline until Start (new URL next time).";
  saveState();
  log("tunnel stopped");
}

async function handleCommand(command) {
  const payload = await openSealed(command.sealedPassword);
  if (!payload?.password) throw new Error("Missing password in command");
  if (payload.exp && Date.now() > payload.exp) {
    throw new Error("Command expired");
  }

  if (command.action === "start") {
    await ensureTunnelUp({ requirePassword: true, password: payload.password });
  } else if (command.action === "stop") {
    await stopTunnel(payload.password);
  } else {
    throw new Error(`Unknown action ${command.action}`);
  }
}

/** If tunnel should be up but died, restart automatically (no password, no AI). */
async function watchdog() {
  if (!desiredUp || starting) return;
  if (tunnelUp()) {
    if (!publicUrl) publicUrl = readLatestUrl();
    return;
  }
  log("watchdog: desiredUp but tunnel down — auto-restarting");
  lastResult = "Auto-restarting tunnel…";
  try {
    await ensureTunnelUp({ requirePassword: false });
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    log("watchdog restart failed", lastError);
  }
}

async function main() {
  loadState();
  log("agent starting", DASHBOARD_URL, `desiredUp=${desiredUp}`);

  // Resume previous desired state without waiting for dashboard/AI
  if (desiredUp && !tunnelUp()) {
    log("resuming desired tunnel state with auto-retry");
    try {
      await ensureTunnelUp({ requirePassword: false });
    } catch (error) {
      log(
        "initial resume failed (will keep retrying via watchdog)",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  for (;;) {
    try {
      await watchdog();
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
