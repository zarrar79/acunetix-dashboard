"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import type {
  AcunetixScan,
  AcunetixVulnerabilityDetail,
  SeverityCounts,
} from "@/lib/acunetix";
import {
  criticalityLabel,
  severityLabel,
  threatLabel,
} from "@/lib/labels";
import { AddTargetForm } from "@/components/AddTargetForm";

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
  code?: string;
  traceId?: string;
};

type FindingsPayload = {
  summary: {
    total: number;
    open: number;
    severity: SeverityCounts;
  };
  findings: AcunetixVulnerabilityDetail[];
  error?: string;
  code?: string;
  traceId?: string;
};

function formatApiError(
  payload: { error?: string; code?: string; traceId?: string } | null,
  fallback: string,
) {
  const base = payload?.error || fallback;
  if (payload?.code && payload?.traceId) {
    return `${base} [${payload.code} · ${payload.traceId}]`;
  }
  if (payload?.traceId) return `${base} [${payload.traceId}]`;
  return base;
}

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

function severityTone(level: number) {
  if (level >= 4) return "danger";
  if (level === 3) return "warn";
  if (level === 2) return "warn";
  if (level === 1) return "ok";
  return "info";
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

function stripHtml(value?: string) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const load = useCallback(
    async (silent = false) => {
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
        setError(
          formatApiError(
            payload,
            "Failed to load scans from Acunetix",
          ),
        );
        setData(null);
      } else {
        setData(payload);
        setError("");
      }
    } catch {
      setError(
        "Connection problem while loading scans. Check Acunetix and the Cloudflare tunnel on your PC.",
      );
    } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

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

  const filteredScans = useMemo(() => {
    const scans = data?.scans ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return scans;
    return scans.filter((scan) => {
      const haystack = [
        scan.target?.address,
        scan.profile_name,
        scan.current_session?.status,
        threatLabel(scan.current_session?.threat),
        scan.scan_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data, search]);

  const totalPages = Math.max(1, Math.ceil(filteredScans.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pagedScans = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredScans.slice(start, start + PAGE_SIZE);
  }, [filteredScans, currentPage, PAGE_SIZE]);

  const runningScans = useMemo(
    () =>
      filteredScans.filter((scan) =>
        RUNNING.has(scan.current_session?.status?.toLowerCase?.() ?? "") ||
        (scan.current_session?.status?.toLowerCase?.() ?? "") === "paused" ||
        (scan.current_session?.status?.toLowerCase?.() ?? "") === "scanning",
      ),
    [filteredScans],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="rise flex items-start justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
            Daybreak Scan Desk
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
            Acunetix stats
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            className="rounded-md border border-[var(--line)] bg-[var(--panel-solid)] px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs tracking-wide text-[var(--ink)] uppercase transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
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
        <div className="rise rounded-2xl border border-[color-mix(in_srgb,var(--danger)_45%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_12%,var(--panel))] p-4 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <section className="rise toolbar-card grid grid-cols-1 gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-2 backdrop-blur md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
        <AddTargetForm onCreated={() => void load(true)} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search scans…"
          aria-label="Search scanned targets"
          className="field w-full px-2.5 py-1.5 text-sm"
        />
      </section>

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
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                  Severity across listed scans
                </h2>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SeverityChip label="Critical" value={data.summary.severity.critical} tone="danger" />
              <SeverityChip label="High" value={data.summary.severity.high} tone="warn" />
              <SeverityChip label="Medium" value={data.summary.severity.medium} tone="warn" />
              <SeverityChip label="Low" value={data.summary.severity.low} tone="ok" />
            </div>
          </section>

          {runningScans.length > 0 ? (
            <section className="rise rise-delay-2 flex flex-col gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                Running now
              </h2>
              {runningScans.map((scan) => (
                <ScanRow
                  key={scan.scan_id}
                  scan={scan}
                  highlight
                  expanded={expandedId === scan.scan_id}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === scan.scan_id ? null : scan.scan_id,
                    )
                  }
                  onChanged={() => void load(true)}
                />
              ))}
            </section>
          ) : null}

          <section className="rise rise-delay-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
                All scans
                <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                  ({filteredScans.length} of {data.scans.length}
                  {search.trim() ? " matching" : ""} · 15/page)
                </span>
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Updated {formatDate(data.fetchedAt)}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {filteredScans.length === 0 ? (
                <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
                  {search.trim()
                    ? `No scanned targets match “${search.trim()}”.`
                    : "No scans found."}
                </p>
              ) : (
                pagedScans.map((scan) => (
                  <ScanRow
                    key={scan.scan_id}
                    scan={scan}
                    expanded={expandedId === scan.scan_id}
                    onToggle={() =>
                      setExpandedId((current) =>
                        current === scan.scan_id ? null : scan.scan_id,
                      )
                    }
                    onChanged={() => void load(true)}
                  />
                ))
              )}
            </div>

            {filteredScans.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
                <p className="text-xs text-[var(--muted)]">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                  {Math.min(currentPage * PAGE_SIZE, filteredScans.length)} of{" "}
                  {filteredScans.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel-solid)] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-[var(--muted)]">
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel-solid)] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
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

  const shell =
    accent === "danger"
      ? "stat-shell stat-shell-danger"
      : accent === "ok"
        ? "stat-shell stat-shell-ok"
        : "stat-shell";

  return (
    <div
      className={`rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 backdrop-blur ${shell}`}
    >
      <div className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.16em] text-[var(--muted)] uppercase">
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
  const hot = tone === "danger" && value > 0;

  return (
    <div
      className={`severity-chip rounded-xl border border-[var(--line)] bg-[var(--panel-solid)] px-3 py-3 ${
        hot ? "severity-chip-hot" : ""
      }`}
    >
      <div className="font-[family-name:var(--font-mono)] text-[10px] tracking-wide text-[var(--muted)] uppercase">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function ScanRow({
  scan,
  highlight,
  expanded,
  onToggle,
  onChanged,
}: {
  scan: AcunetixScan;
  highlight?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChanged?: () => void;
}) {
  const status = scan.current_session?.status ?? "unknown";
  const statusLower = status.toLowerCase();
  const tone = statusTone(status);
  const isFailed = ["failed", "aborted", "error"].includes(statusLower);
  const canPause = [
    "processing",
    "scanning",
    "starting",
    "queued",
    "resuming",
  ].includes(statusLower);
  const canResume = statusLower === "paused";
  const canStop = ![
    "completed",
    "failed",
    "aborted",
    "error",
  ].includes(statusLower);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const progress = Math.max(
    0,
    Math.min(100, Number(scan.current_session?.progress ?? 0)),
  );
  const counts = scan.current_session?.severity_counts;
  const threat = scan.current_session?.threat;

  async function runAction(
    event: MouseEvent,
    action: "pause" | "resume" | "stop" | "delete" | "retry",
  ) {
    event.preventDefault();
    event.stopPropagation();
    setActionLoading(action);
    setActionError("");
    try {
      const response =
        action === "retry"
          ? await fetch(`/api/scans/${scan.scan_id}/retry`, { method: "POST" })
          : await fetch(`/api/scans/${scan.scan_id}/control`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        traceId?: string;
      };
      if (!response.ok) {
        setActionError(
          formatApiError(payload, `Could not ${action} this scan.`),
        );
        setActionLoading(null);
        return;
      }
      onChanged?.();
    } catch {
      setActionError(
        `Connection problem while trying to ${action}. Check Acunetix/tunnel.`,
      );
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <article
      className={`rounded-2xl border bg-[var(--panel)] p-4 backdrop-blur transition ${
        highlight
          ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] shadow-[0_10px_30px_rgba(45,212,168,0.12)]"
          : "border-[var(--line)]"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 flex-1 text-left"
        >
          <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold">
            {scan.target?.address || "Unknown target"}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {scan.profile_name} · started{" "}
            {formatDate(scan.current_session?.start_date)} · risk{" "}
            <strong className="text-[var(--ink)]">{threatLabel(threat)}</strong>{" "}
            · target criticality{" "}
            <strong className="text-[var(--ink)]">
              {criticalityLabel(scan.criticality)}
            </strong>
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <StatusBadge status={status} tone={tone} />
          {canPause ? (
            <ActionChip
              label={actionLoading === "pause" ? "Pausing…" : "Pause"}
              disabled={!!actionLoading}
              onClick={(event) => void runAction(event, "pause")}
            />
          ) : null}
          {canResume ? (
            <ActionChip
              label={actionLoading === "resume" ? "Resuming…" : "Resume"}
              disabled={!!actionLoading}
              onClick={(event) => void runAction(event, "resume")}
            />
          ) : null}
          {canStop ? (
            <ActionChip
              label={actionLoading === "stop" ? "Stopping…" : "Stop"}
              tone="warn"
              disabled={!!actionLoading}
              onClick={(event) => void runAction(event, "stop")}
            />
          ) : null}
          {isFailed ? (
            <ActionChip
              label={actionLoading === "retry" ? "Retrying…" : "Retry"}
              tone="danger"
              disabled={!!actionLoading}
              onClick={(event) => void runAction(event, "retry")}
            />
          ) : null}
          <ActionChip
            label={actionLoading === "delete" ? "Deleting…" : "Delete"}
            tone="danger"
            disabled={!!actionLoading}
            onClick={(event) => {
              if (
                !window.confirm(
                  `Delete scan for ${scan.target?.address || "this target"}?`,
                )
              ) {
                return;
              }
              void runAction(event, "delete");
            }}
          />
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full border border-[var(--line)] bg-[var(--panel-solid)] px-2.5 py-1 text-xs text-[var(--muted)]"
          >
            {expanded ? "Hide details" : "View details"}
          </button>
        </div>
      </div>
      {actionError ? (
        <p className="mt-2 text-xs text-[var(--danger)]">{actionError}</p>
      ) : null}

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
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniCount label="Critical" value={counts.critical} tone="danger" />
          <MiniCount label="High" value={counts.high} tone="warn" />
          <MiniCount label="Medium" value={counts.medium} tone="warn" />
          <MiniCount label="Low" value={counts.low} tone="ok" />
        </div>
      ) : null}

      {expanded ? <ScanFindingsPanel scanId={scan.scan_id} /> : null}
    </article>
  );
}

function MiniCount({
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
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-solid)] px-3 py-2">
      <div className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
        {label}
      </div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function ScanFindingsPanel({ scanId }: { scanId: string }) {
  const [payload, setPayload] = useState<FindingsPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openFindingId, setOpenFindingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | 1 | 2 | 3 | 4>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadFindings() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/scans/${scanId}/findings?details=1`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as FindingsPayload;
        if (cancelled) return;
        if (!response.ok) {
          setError(
            formatApiError(data, "Failed to load findings for this scan"),
          );
          setPayload(null);
        } else {
          setPayload(data);
        }
      } catch {
        if (!cancelled) {
          setError(
            "Connection problem while loading findings. Check Acunetix/tunnel.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadFindings();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  const filtered = useMemo(() => {
    const findings = (payload?.findings ?? []).filter(
      (finding) => finding.severity > 0,
    );
    if (filter === "all") return findings;
    return findings.filter((finding) => finding.severity === filter);
  }, [payload, filter]);

  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel-solid)] p-4 text-sm text-[var(--muted)]">
        Loading every finding for this scan…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--danger)_45%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_12%,var(--panel))] p-4 text-sm text-[var(--danger)]">
        {error}
      </div>
    );
  }

  if (!payload) return null;

  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4 className="font-[family-name:var(--font-display)] text-base font-semibold">
            Findings ({payload.summary.total})
          </h4>
          <p className="text-sm text-[var(--muted)]">
            {payload.summary.open} open · Critical{" "}
            {payload.summary.severity.critical} · High{" "}
            {payload.summary.severity.high} · Medium{" "}
            {payload.summary.severity.medium} · Low{" "}
            {payload.summary.severity.low}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              [4, "Critical"],
              [3, "High"],
              [2, "Medium"],
              [1, "Low"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === value
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-[var(--panel-solid)] text-[var(--muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No findings in this severity filter.
          </p>
        ) : (
          filtered.map((finding) => (
            <FindingCard
              key={finding.vuln_id}
              finding={finding}
              open={openFindingId === finding.vuln_id}
              onToggle={() =>
                setOpenFindingId((current) =>
                  current === finding.vuln_id ? null : finding.vuln_id,
                )
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  open,
  onToggle,
}: {
  finding: AcunetixVulnerabilityDetail;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = severityTone(finding.severity ?? 0);
  const description = stripHtml(
    finding.description || finding.long_description || finding.details,
  );
  const impact = stripHtml(finding.impact);
  const recommendation = stripHtml(finding.recommendation);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-solid)] p-3 sm:p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-2 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge level={finding.severity ?? 0} tone={tone} />
          <span className="rounded-full bg-[color-mix(in_srgb,var(--muted)_18%,var(--panel-solid))] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">
            {finding.status}
          </span>
          <span className="text-[11px] text-[var(--muted)]">
            confidence {finding.confidence ?? 0}%
          </span>
        </div>
        <h5 className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--ink)]">
          {finding.vt_name}
        </h5>
        <p className="truncate text-sm text-[var(--muted)]">
          {finding.affects_url || "No affected URL"}
          {finding.affects_detail ? ` · ${finding.affects_detail}` : ""}
        </p>
        {finding.tags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {finding.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </button>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-[var(--line)] pt-3 text-sm text-[var(--ink)]">
          <DetailBlock label="Severity" value={severityLabel(finding.severity)} />
          <DetailBlock
            label="Target criticality"
            value={criticalityLabel(finding.criticality)}
          />
          {finding.cvss_score != null ? (
            <DetailBlock
              label="CVSS score"
              value={String(finding.cvss_score)}
            />
          ) : null}
          {finding.cvss3 ? (
            <DetailBlock label="CVSS v3 vector" value={finding.cvss3} mono />
          ) : null}
          {finding.cvss4 ? (
            <DetailBlock label="CVSS v4 vector" value={finding.cvss4} mono />
          ) : null}
          {finding.cvss4_score != null ? (
            <DetailBlock
              label="CVSS v4 score"
              value={String(finding.cvss4_score)}
            />
          ) : null}
          {description ? (
            <DetailBlock label="Description" value={description} />
          ) : null}
          {impact ? <DetailBlock label="Impact" value={impact} /> : null}
          {recommendation ? (
            <DetailBlock label="Recommendation" value={recommendation} />
          ) : null}
          {finding.request ? (
            <DetailBlock label="Request" value={finding.request} mono />
          ) : null}
          {finding.response_info ? (
            <DetailBlock
              label="Response info"
              value={stripHtml(finding.response_info) || finding.response_info}
              mono
            />
          ) : null}
          {finding.issue_url ? (
            <DetailBlock label="Issue URL" value={finding.issue_url} />
          ) : null}
          {finding.references?.length ? (
            <DetailBlock
              label="References"
              value={finding.references
                .map((ref) =>
                  typeof ref === "string" ? ref : ref.href || ref.rel || "",
                )
                .filter(Boolean)
                .join("\n")}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DetailBlock({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
        {label}
      </div>
      <p
        className={`mt-1 whitespace-pre-wrap break-words ${
          mono
            ? "font-[family-name:var(--font-mono)] text-xs leading-relaxed"
            : "leading-relaxed"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SeverityBadge({
  level,
  tone,
}: {
  level: number;
  tone: string;
}) {
  const styles =
    tone === "danger"
      ? "bg-[color-mix(in_srgb,var(--danger)_16%,var(--panel-solid))] text-[var(--danger)]"
      : tone === "warn"
        ? "bg-[color-mix(in_srgb,var(--warn)_16%,var(--panel-solid))] text-[var(--warn)]"
        : tone === "ok"
          ? "bg-[color-mix(in_srgb,var(--ok)_16%,var(--panel-solid))] text-[var(--ok)]"
          : "bg-[color-mix(in_srgb,var(--info)_16%,var(--panel-solid))] text-[var(--info)]";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${styles}`}
    >
      {severityLabel(level)}
    </span>
  );
}

function ActionChip({
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  label: string;
  onClick: (event: MouseEvent) => void;
  disabled?: boolean;
  tone?: "default" | "warn" | "danger";
}) {
  const styles =
    tone === "danger"
      ? "border-[color-mix(in_srgb,var(--danger)_45%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_14%,var(--panel-solid))] text-[var(--danger)]"
      : tone === "warn"
        ? "border-[color-mix(in_srgb,var(--warn)_45%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_14%,var(--panel-solid))] text-[var(--warn)]"
        : "border-[var(--line)] bg-[var(--panel-solid)] text-[var(--ink)]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${styles}`}
    >
      {label}
    </button>
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
      ? "bg-[color-mix(in_srgb,var(--accent)_16%,var(--panel-solid))] text-[var(--accent-deep)]"
      : tone === "ok"
        ? "bg-[color-mix(in_srgb,var(--ok)_16%,var(--panel-solid))] text-[var(--ok)]"
        : tone === "danger"
          ? "bg-[color-mix(in_srgb,var(--danger)_16%,var(--panel-solid))] text-[var(--danger)]"
          : "bg-[color-mix(in_srgb,var(--muted)_18%,var(--panel-solid))] text-[var(--muted)]";

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
