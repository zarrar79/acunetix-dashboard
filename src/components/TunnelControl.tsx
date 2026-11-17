"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type TunnelStatus = {
  tunnelUp: boolean;
  agentOnline: boolean;
  publicUrl: string | null;
  lastHeartbeatAt: number | null;
  lastError: string | null;
  lastResult: string | null;
  pendingAction: "start" | "stop" | null;
};

type ModalMode = "start" | "stop" | null;

export function TunnelControl() {
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [modal]);

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
  ) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const latest = await refresh();
      if (latest && predicate(latest)) return latest;
      await new Promise((r) => window.setTimeout(r, 2000));
    }
    return null;
  }

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    if (!modal) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/tunnel/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: modal, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error || "Tunnel control failed");
        setBusy(false);
        return;
      }

      setPassword("");
      const action = modal;

      if (action === "start") {
        const ready = await waitForState(
          (s) => Boolean(s.tunnelUp && s.publicUrl),
          90_000,
        );
        if (!ready?.publicUrl) {
          setError("Start timed out. Check tunnel-ctl on the PC.");
          setBusy(false);
          return;
        }
      } else {
        const down = await waitForState((s) => !s.tunnelUp, 60_000);
        if (!down || down.tunnelUp) {
          setError("Stop timed out. Check tunnel-ctl on the PC.");
          setBusy(false);
          return;
        }
      }

      setModal(null);
    } catch {
      setError("Could not reach tunnel control API");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  const tunnelUp = status?.tunnelUp ?? false;
  const agentOnline = status?.agentOnline ?? false;

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className={`tunnel-blink inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
            tunnelUp
              ? "bg-[var(--ok)]"
              : agentOnline
                ? "bg-[var(--warn)]"
                : "bg-[var(--danger)]"
          }`}
          title={
            tunnelUp
              ? "Tunnel running"
              : agentOnline
                ? "Tunnel stopped"
                : "PC tunnel script offline"
          }
          aria-label={tunnelUp ? "Tunnel up" : "Tunnel down"}
        />
        <button
          type="button"
          disabled={!agentOnline || busy}
          onClick={() => {
            setError("");
            setPassword("");
            setModal(tunnelUp ? "stop" : "start");
          }}
          className={`rounded-md border px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs tracking-wide uppercase transition disabled:opacity-40 ${
            tunnelUp
              ? "border-[color-mix(in_srgb,var(--danger)_45%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_12%,var(--panel-solid))] text-[var(--danger)] hover:border-[var(--danger)]"
              : "border-[var(--line)] bg-[var(--panel-solid)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          }`}
        >
          {tunnelUp ? "Stop tunnel" : "Start tunnel"}
        </button>
      </div>

      {mounted && modal
        ? createPortal(
            <div
              className="tunnel-password-overlay flex items-center justify-center bg-black/65 px-4 backdrop-blur-md"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 2147483000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tunnel-modal-title"
              onClick={() => {
                if (!busy) setModal(null);
              }}
            >
              <form
                onSubmit={(event) => void onConfirm(event)}
                onClick={(event) => event.stopPropagation()}
                className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                style={{
                  position: "relative",
                  zIndex: 2147483001,
                  margin: "auto",
                }}
              >
                <div
                  className={`tunnel-blink mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2 ${
                    modal === "start"
                      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]"
                      : "border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-[var(--danger)]"
                  }`}
                  aria-hidden
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <circle cx="12" cy="8" r="3.2" />
                    <path d="M5.5 19c1.6-3.2 4-4.8 6.5-4.8S16.9 15.8 18.5 19" />
                  </svg>
                </div>

                <h2
                  id="tunnel-modal-title"
                  className="text-center font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]"
                >
                  {modal === "start" ? "Start tunnel" : "Stop tunnel"}
                </h2>
                <p className="mt-1 text-center text-xs text-[var(--muted)]">
                  Password is checked on your PC only.
                </p>

                <label className="mt-6 flex w-full flex-col gap-2 text-center text-sm text-[var(--muted)]">
                  Enter root password
                  <input
                    type="password"
                    autoFocus
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter root password"
                    className="field w-full px-3 py-2.5 text-center text-sm"
                  />
                </label>

                {error ? (
                  <p className="mt-3 w-full text-center text-xs text-[var(--danger)]">
                    {error}
                  </p>
                ) : null}

                <div className="mt-6 flex w-full gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--muted)] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !password.trim()}
                    className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${
                      modal === "start"
                        ? "bg-[var(--accent)] text-[#06261c]"
                        : "bg-[var(--danger)] text-white"
                    }`}
                  >
                    {busy
                      ? modal === "start"
                        ? "Starting…"
                        : "Stopping…"
                      : modal === "start"
                        ? "Start"
                        : "Stop"}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
