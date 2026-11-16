"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type TunnelStatus = {
  tunnelUp: boolean;
  agentOnline: boolean;
  publicUrl: string | null;
  lastHeartbeatAt: number | null;
  lastError: string | null;
  lastResult: string | null;
  pendingAction: "start" | "stop" | null;
};

export function TunnelControl() {
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/tunnel/status", { cache: "no-store" });
      const data = (await response.json()) as TunnelStatus;
      if (response.ok) setStatus(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function waitForState(
    predicate: (s: TunnelStatus) => boolean,
    timeoutMs: number,
    pendingMsg: string,
  ) {
    setMessage(pendingMsg);
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const latest = await refresh();
      if (latest && predicate(latest)) return latest;
      await new Promise((r) => window.setTimeout(r, 2000));
    }
    return null;
  }

  async function onSubmit(event: FormEvent, action: "start" | "stop") {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/tunnel/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, password }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(data.error || "Tunnel control failed");
        setBusy(false);
        return;
      }

      setPassword("");

      if (action === "start") {
        const ready = await waitForState(
          (s) => Boolean(s.tunnelUp && s.publicUrl),
          90_000,
          "Starting tunnel… waiting for new public URL…",
        );
        if (ready?.publicUrl) {
          setMessage(`Tunnel up: ${ready.publicUrl}`);
        } else {
          setError(
            "Tunnel start timed out. Check the PC agent / cloudflared logs.",
          );
        }
      } else {
        const down = await waitForState(
          (s) => !s.tunnelUp,
          60_000,
          "Stopping tunnel…",
        );
        if (down && !down.tunnelUp) {
          setMessage(
            "Tunnel down. Public URL is offline until you Start again (a new URL will be created).",
          );
        } else {
          setError("Stop timed out. Check the PC agent.");
        }
      }
    } catch {
      setError("Could not reach tunnel control API");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  const agentOnline = status?.agentOnline ?? false;
  const tunnelUp = status?.tunnelUp ?? false;

  return (
    <section className="rise rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--ink)]">
            Cloudflare tunnel
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Start creates a new public URL (PC agent auto-retries if Cloudflare
            fails). Stop kills it. Sudo password is checked only on your PC.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-wide">
          <span
            className={`rounded-full border px-2 py-1 ${
              agentOnline
                ? "border-[color-mix(in_srgb,var(--ok)_45%,var(--line))] text-[var(--ok)]"
                : "border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            Agent {agentOnline ? "online" : "offline"}
          </span>
          <span
            className={`rounded-full border px-2 py-1 ${
              tunnelUp
                ? "border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] text-[var(--accent)]"
                : "border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            Tunnel {tunnelUp ? "up" : "down"}
          </span>
        </div>
      </div>

      {tunnelUp && status?.publicUrl ? (
        <p className="mt-2 break-all font-[family-name:var(--font-mono)] text-[11px] text-[var(--accent)]">
          Live URL: {status.publicUrl}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          No live public URL right now.
        </p>
      )}

      <form className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="PC sudo / root password"
          aria-label="PC sudo password"
          className="field w-full px-2.5 py-1.5 text-sm sm:max-w-xs"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !agentOnline || !password}
            onClick={(event) => void onSubmit(event, "start")}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[#06261c] disabled:opacity-50"
          >
            {busy ? "Working…" : "Start"}
          </button>
          <button
            type="button"
            disabled={busy || !agentOnline || !password}
            onClick={(event) => void onSubmit(event, "stop")}
            className="rounded-md border border-[color-mix(in_srgb,var(--danger)_45%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_12%,var(--panel-solid))] px-3 py-1.5 text-xs font-semibold text-[var(--danger)] disabled:opacity-50"
          >
            Stop
          </button>
        </div>
      </form>

      {!agentOnline ? (
        <p className="mt-2 text-[11px] text-[var(--warn)]">
          Start the PC agent first:{" "}
          <code className="text-[var(--ink)]">node scripts/tunnel-agent.mjs</code>
        </p>
      ) : null}
      {status?.pendingAction ? (
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Pending: {status.pendingAction}…
        </p>
      ) : null}
      {status?.lastResult ? (
        <p className="mt-2 text-[11px] text-[var(--ok)]">{status.lastResult}</p>
      ) : null}
      {message ? (
        <p className="mt-2 text-[11px] text-[var(--ok)]">{message}</p>
      ) : null}
      {error || status?.lastError ? (
        <p className="mt-2 text-[11px] text-[var(--danger)]">
          {error || status?.lastError}
        </p>
      ) : null}
    </section>
  );
}
