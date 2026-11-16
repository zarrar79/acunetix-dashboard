"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
};

type FindingsPayload = {
  summary: {
    total: number;
    open: number;
    severity: SeverityCounts;
  };
  findings: AcunetixVulnerabilityDetail[];
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
            Open any scan for critical / high / medium / low / informational
            findings, risk, CVSS, and remediation detail.
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

      <AddTargetForm onCreated={() => void load(true)} />

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
                />
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
                <ScanRow
                  key={scan.scan_id}
                  scan={scan}
                  expanded={expandedId === scan.scan_id}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === scan.scan_id ? null : scan.scan_id,
                    )
                  }
                />
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
  expanded,
  onToggle,
}: {
  scan: AcunetixScan;
  highlight?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = scan.current_session?.status ?? "unknown";
  const tone = statusTone(status);
  const progress = Math.max(
    0,
    Math.min(100, Number(scan.current_session?.progress ?? 0)),
  );
  const counts = scan.current_session?.severity_counts;
  const threat = scan.current_session?.threat;

  return (
    <article
      className={`rounded-2xl border bg-[var(--panel)] p-4 backdrop-blur transition ${
        highlight
          ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] shadow-[0_10px_30px_rgba(15,143,108,0.08)]"
          : "border-[var(--line)]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0">
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
        </div>
        <div className="flex items-center gap-2 self-start">
          <StatusBadge status={status} tone={tone} />
          <span className="rounded-full border border-[var(--line)] bg-white/80 px-2.5 py-1 text-xs text-[var(--muted)]">
            {expanded ? "Hide details" : "View details"}
          </span>
        </div>
      </button>

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
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <MiniCount label="Critical" value={counts.critical} tone="danger" />
          <MiniCount label="High" value={counts.high} tone="warn" />
          <MiniCount label="Medium" value={counts.medium} tone="warn" />
          <MiniCount label="Low" value={counts.low} tone="ok" />
          <MiniCount label="Info" value={counts.info} tone="info" />
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
    <div className="rounded-xl border border-[var(--line)] bg-white/75 px-3 py-2">
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
  const [filter, setFilter] = useState<"all" | 0 | 1 | 2 | 3 | 4>("all");

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
          setError(data.error || "Failed to load findings");
          setPayload(null);
        } else {
          setPayload(data);
        }
      } catch {
        if (!cancelled) setError("Could not load scan findings");
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
    const findings = payload?.findings ?? [];
    if (filter === "all") return findings;
    return findings.filter((finding) => finding.severity === filter);
  }, [payload, filter]);

  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-[var(--line)] bg-white/70 p-4 text-sm text-[var(--muted)]">
        Loading every finding for this scan…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-xl border border-[#f0c2bc] bg-[#fff5f3] p-4 text-sm text-[var(--danger)]">
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
            {payload.summary.severity.low} · Info{" "}
            {payload.summary.severity.info}
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
              [0, "Info"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === value
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-white/80 text-[var(--muted)]"
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
    <div className="rounded-xl border border-[var(--line)] bg-white/80 p-3 sm:p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-2 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge level={finding.severity ?? 0} tone={tone} />
          <span className="rounded-full bg-[#eef1ef] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">
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
      ? "bg-[#fdecea] text-[var(--danger)]"
      : tone === "warn"
        ? "bg-[#fff4e5] text-[var(--warn)]"
        : tone === "ok"
          ? "bg-[#e8f6ee] text-[var(--ok)]"
          : "bg-[#eaf1ff] text-[var(--info)]";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${styles}`}
    >
      {severityLabel(level)}
    </span>
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
