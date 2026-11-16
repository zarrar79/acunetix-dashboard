"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AcunetixScan, SeverityCounts } from "@/lib/acunetix";

type DashboardPayload = {
  summary: {
    total: number;
    running: number;
    completed: number;
    failed: number;
    severity: SeverityCounts;
  };
  scans: AcunetixScan[];
  fetchedAt: string;
  error?: string;
};

const RUNNING = new Set([
  "processing",
  "scanning",
  "scheduled",
  "queued",
  "starting",
  "pausing",
  "resuming",
]);

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (RUNNING.has(value)) return "running";
  if (value === "completed" || value === "complete") return "ok";
  if (value === "failed" || value === "aborted" || value === "error")
    return "danger";
  return "muted";
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/scans", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      const payload = (await response.json()) as DashboardPayload;
      if (!response.ok) {
        setError(payload.error || "Failed to load scans");
        setData(null);
      } else {
        setData(payload);
        setError("");
      }
    } catch {
      setError("Could not reach Acunetix through the tunnel");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), 20000);
    return () => window.clearInterval(id);
  }, [load]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const runningScans = useMemo(
    () =>
      (data?.scans ?? []).filter((scan) =>
        RUNNING.has(scan.current_session?.status?.toLowerCase?.() ?? ""),
      ),
    [data],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rise flex items-start justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.18em] text-[var(--accent-deep)] uppercase">
            Daybreak Scan Desk
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
            Acunetix stats
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)] sm:text-base">
            Live scan progress and severity totals from your local Acunetix
            instance.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1.5 text-sm text-[var(--ink)] transition hover:border-[var(--accent)]"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm text-[var(--muted)] underline-offset-2 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      {loading ? (
        <div className="rise rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-8 text-[var(--muted)] backdrop-blur">
          Loading scans…
        </div>
      ) : null}

      {error ? (
        <div className="rise rounded-2xl border border-[#f0c2bc] bg-[#fff5f3] p-4 text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="rise rise-delay-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={data.summary.total} />
            <Stat
              label="Running"
              value={data.summary.running}
              accent="running"
              live={data.summary.running > 0}
            />
            <Stat label="Completed" value={data.summary.completed} accent="ok" />
            <Stat label="Failed" value={data.summary.failed} accent="danger" />
          </section>

          <section className="rise rise-delay-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 backdrop-blur sm:p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Severity across listed scans
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SeverityChip label="Critical" value={data.summary.severity.critical} tone="danger" />
              <SeverityChip label="High" value={data.summary.severity.high} tone="warn" />
              <SeverityChip label="Medium" value={data.summary.severity.medium} tone="warn" />
              <SeverityChip label="Low" value={data.summary.severity.low} tone="ok" />
              <SeverityChip label="Info" value={data.summary.severity.info} tone="info" />
            </div>
          </section>

          {runningScans.length > 0 ? (
            <section className="rise rise-delay-2 flex flex-col gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                Running now
              </h2>
              {runningScans.map((scan) => (
                <ScanRow key={scan.scan_id} scan={scan} highlight />
              ))}
            </section>
          ) : null}

          <section className="rise rise-delay-3 flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                All scans
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Updated {formatDate(data.fetchedAt)}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {data.scans.map((scan) => (
                <ScanRow key={scan.scan_id} scan={scan} />
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  live,
}: {
  label: string;
  value: number;
  accent?: "running" | "ok" | "danger";
  live?: boolean;
}) {
  const color =
    accent === "running"
      ? "text-[var(--accent-deep)]"
      : accent === "ok"
        ? "text-[var(--ok)]"
        : accent === "danger"
          ? "text-[var(--danger)]"
          : "text-[var(--ink)]";

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-xs tracking-wide text-[var(--muted)] uppercase">
        {live ? (
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
        ) : null}
        {label}
      </div>
      <div
        className={`mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold ${color}`}
      >
        {value}
      </div>
    </div>
  );
}

function SeverityChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warn" | "ok" | "info";
}) {
  const color =
    tone === "danger"
      ? "text-[var(--danger)]"
      : tone === "warn"
        ? "text-[var(--warn)]"
        : tone === "ok"
          ? "text-[var(--ok)]"
          : "text-[var(--info)]";

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/70 px-3 py-3">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function ScanRow({
  scan,
  highlight,
}: {
  scan: AcunetixScan;
  highlight?: boolean;
}) {
  const status = scan.current_session?.status ?? "unknown";
  const tone = statusTone(status);
  const progress = Math.max(
    0,
    Math.min(100, Number(scan.current_session?.progress ?? 0)),
  );
  const counts = scan.current_session?.severity_counts;

  return (
    <article
      className={`rounded-2xl border bg-[var(--panel)] p-4 backdrop-blur transition ${
        highlight
          ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] shadow-[0_10px_30px_rgba(15,143,108,0.08)]"
          : "border-[var(--line)]"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold">
            {scan.target?.address || "Unknown target"}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {scan.profile_name} · started{" "}
            {formatDate(scan.current_session?.start_date)}
          </p>
        </div>
        <StatusBadge status={status} tone={tone} />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted)]">
          <span>Progress</span>
          <span className="font-[family-name:var(--font-mono)]">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--line)_70%,white)]">
          <div
            className="progress-fill h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {counts ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Pill label="Crit" value={counts.critical} />
          <Pill label="High" value={counts.high} />
          <Pill label="Med" value={counts.medium} />
          <Pill label="Low" value={counts.low} />
          <Pill label="Info" value={counts.info} />
        </div>
      ) : null}
    </article>
  );
}

function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone: string;
}) {
  const styles =
    tone === "running"
      ? "bg-[#e6f7f0] text-[var(--accent-deep)]"
      : tone === "ok"
        ? "bg-[#e8f6ee] text-[var(--ok)]"
        : tone === "danger"
          ? "bg-[#fdecea] text-[var(--danger)]"
          : "bg-[#eef1ef] text-[var(--muted)]";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase ${styles}`}
    >
      {tone === "running" ? (
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
      ) : null}
      {status}
    </span>
  );
}

function Pill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-[var(--line)] bg-white/80 px-2.5 py-1 text-[var(--muted)]">
      {label}{" "}
      <strong className="font-[family-name:var(--font-mono)] text-[var(--ink)]">
        {value}
      </strong>
    </span>
  );
}
