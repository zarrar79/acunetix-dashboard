import type {
  AcunetixScan,
  AcunetixVulnerabilityDetail,
  SeverityCounts,
} from "@/lib/acunetix";
import { criticalityLabel, severityLabel, threatLabel } from "@/lib/labels";

function stripHtml(value?: string) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hostFromTarget(address?: string) {
  if (!address) return "unknown-target";
  try {
    const url = address.includes("://")
      ? new URL(address)
      : new URL(`https://${address}`);
    return url.hostname || address;
  } catch {
    return address.replace(/^https?:\/\//i, "").split("/")[0] || "unknown-target";
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "report";
}

function formatStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}`;
}

export function buildReportFilename(scan: AcunetixScan) {
  const host = slugify(hostFromTarget(scan.target?.address));
  return `Daybreak-Acunetix-Report_${host}_${formatStamp()}.html`;
}

export function buildFindingFilename(
  finding: AcunetixVulnerabilityDetail,
  scan?: AcunetixScan,
) {
  const severity = slugify(severityLabel(finding.severity));
  const title = slugify(finding.vt_name || "finding");
  const host = slugify(
    hostFromTarget(scan?.target?.address || finding.affects_url),
  );
  return `Daybreak-Finding-${severity}-${title}_${host}_${formatStamp()}.html`;
}

function triggerHtmlDownload(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
}

function section(label: string, body: string, mono = false) {
  if (!body.trim()) return "";
  return `
    <div class="block">
      <div class="label">${escapeHtml(label)}</div>
      <pre class="${mono ? "mono" : "text"}">${escapeHtml(body)}</pre>
    </div>`;
}

function findingHtml(finding: AcunetixVulnerabilityDetail, index: number) {
  const description = stripHtml(
    finding.description || finding.long_description || finding.details,
  );
  const impact = stripHtml(finding.impact);
  const recommendation = stripHtml(finding.recommendation);
  const references = (finding.references ?? [])
    .map((ref) => (typeof ref === "string" ? ref : ref.href || ref.rel || ""))
    .filter(Boolean)
    .join("\n");

  const severity = severityLabel(finding.severity);
  const sevClass =
    finding.severity >= 4
      ? "sev-critical"
      : finding.severity === 3
        ? "sev-high"
        : finding.severity === 2
          ? "sev-medium"
          : finding.severity === 1
            ? "sev-low"
            : "sev-info";

  return `
  <article class="finding">
    <header>
      <div class="finding-top">
        <span class="badge ${sevClass}">${escapeHtml(severity)}</span>
        <span class="muted">#${index + 1} · ${escapeHtml(finding.status)} · confidence ${finding.confidence ?? 0}%</span>
      </div>
      <h3>${escapeHtml(finding.vt_name || "Finding")}</h3>
      <p class="muted">${escapeHtml(finding.affects_url || "No affected URL")}${
        finding.affects_detail
          ? ` · ${escapeHtml(finding.affects_detail)}`
          : ""
      }</p>
    </header>
    ${section("Severity", severity)}
    ${section("Target criticality", criticalityLabel(finding.criticality))}
    ${finding.cvss_score != null ? section("CVSS score", String(finding.cvss_score)) : ""}
    ${finding.cvss3 ? section("CVSS v3 vector", finding.cvss3, true) : ""}
    ${finding.cvss4 ? section("CVSS v4 vector", finding.cvss4, true) : ""}
    ${finding.cvss4_score != null ? section("CVSS v4 score", String(finding.cvss4_score)) : ""}
    ${section("Description", description)}
    ${section("Impact", impact)}
    ${section("Recommendation", recommendation)}
    ${finding.request ? section("Request", finding.request, true) : ""}
    ${finding.response_info ? section("Response info", stripHtml(finding.response_info) || finding.response_info, true) : ""}
    ${finding.issue_url ? section("Issue URL", finding.issue_url) : ""}
    ${references ? section("References", references) : ""}
  </article>`;
}

export function buildFindingsReportHtml({
  scan,
  findings,
  summary,
  generatedAt = new Date(),
}: {
  scan: AcunetixScan;
  findings: AcunetixVulnerabilityDetail[];
  summary: { total: number; open: number; severity: SeverityCounts };
  generatedAt?: Date;
}) {
  const target = scan.target?.address || "Unknown target";
  const ordered = [...findings]
    .filter((f) => (f.severity ?? 0) > 0)
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Daybreak Acunetix Report — ${escapeHtml(target)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #14201b;
      --muted: #5b6b64;
      --line: #d7e0db;
      --bg: #f4f7f5;
      --card: #ffffff;
      --accent: #0f766e;
      --critical: #b91c1c;
      --high: #c2410c;
      --medium: #a16207;
      --low: #15803d;
      --info: #0369a1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--ink);
      background: var(--bg);
      line-height: 1.5;
    }
    .wrap { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
    header.report {
      background: linear-gradient(135deg, #0f766e, #134e4a);
      color: #ecfdf5;
      border-radius: 18px;
      padding: 28px 28px 24px;
      margin-bottom: 24px;
    }
    header.report h1 { margin: 0 0 6px; font-size: 1.65rem; }
    header.report p { margin: 0; opacity: 0.9; }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .meta div {
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .meta .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.8; }
    .meta .v { font-weight: 600; margin-top: 2px; word-break: break-word; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 24px;
    }
    @media (max-width: 640px) {
      .summary { grid-template-columns: repeat(2, 1fr); }
    }
    .summary .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
    }
    .summary .card .k { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .summary .card .v { font-size: 1.4rem; font-weight: 700; margin-top: 4px; }
    .sev-critical { color: var(--critical); }
    .sev-high { color: var(--high); }
    .sev-medium { color: var(--medium); }
    .sev-low { color: var(--low); }
    .finding {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 18px 18px 8px;
      margin-bottom: 14px;
      break-inside: avoid;
    }
    .finding h3 { margin: 8px 0 4px; font-size: 1.05rem; }
    .finding-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .badge {
      display: inline-flex;
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: #ecfdf5;
    }
    .badge.sev-critical { background: #fee2e2; color: var(--critical); }
    .badge.sev-high { background: #ffedd5; color: var(--high); }
    .badge.sev-medium { background: #fef3c7; color: var(--medium); }
    .badge.sev-low { background: #dcfce7; color: var(--low); }
    .badge.sev-info { background: #e0f2fe; color: var(--info); }
    .muted { color: var(--muted); font-size: 0.92rem; }
    .block { margin: 12px 0; }
    .label {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
    }
    pre.text, pre.mono {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
      font-size: 0.95rem;
    }
    pre.mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.82rem;
      background: #f8faf9;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
    }
    footer {
      margin-top: 28px;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }
    @media print {
      body { background: white; }
      header.report { break-after: avoid; }
      .finding { break-inside: avoid; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="report">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">Daybreak Scan Desk</p>
      <h1>Acunetix vulnerability report</h1>
      <p>${escapeHtml(target)}</p>
      <div class="meta">
        <div><div class="k">Profile</div><div class="v">${escapeHtml(scan.profile_name || "—")}</div></div>
        <div><div class="k">Started</div><div class="v">${escapeHtml(scan.current_session?.start_date || "—")}</div></div>
        <div><div class="k">Status</div><div class="v">${escapeHtml(scan.current_session?.status || "—")}</div></div>
        <div><div class="k">Risk</div><div class="v">${escapeHtml(threatLabel(scan.current_session?.threat))}</div></div>
        <div><div class="k">Target criticality</div><div class="v">${escapeHtml(criticalityLabel(scan.criticality))}</div></div>
        <div><div class="k">Generated</div><div class="v">${escapeHtml(generatedAt.toISOString())}</div></div>
      </div>
    </header>

    <section class="summary">
      <div class="card"><div class="k">Critical</div><div class="v sev-critical">${summary.severity.critical}</div></div>
      <div class="card"><div class="k">High</div><div class="v sev-high">${summary.severity.high}</div></div>
      <div class="card"><div class="k">Medium</div><div class="v sev-medium">${summary.severity.medium}</div></div>
      <div class="card"><div class="k">Low</div><div class="v sev-low">${summary.severity.low}</div></div>
    </section>

    <p class="muted" style="margin:0 0 16px;">
      ${summary.total} findings · ${summary.open} open · ${ordered.length} detailed below
    </p>

    ${ordered.map((finding, index) => findingHtml(finding, index)).join("\n")}

    <footer>
      Generated by Daybreak Scan Desk · Acunetix findings export
    </footer>
  </div>
</body>
</html>`;
}

export function downloadFindingsReport({
  scan,
  findings,
  summary,
}: {
  scan: AcunetixScan;
  findings: AcunetixVulnerabilityDetail[];
  summary: { total: number; open: number; severity: SeverityCounts };
}) {
  const html = buildFindingsReportHtml({ scan, findings, summary });
  return triggerHtmlDownload(html, buildReportFilename(scan));
}

export function buildSingleFindingReportHtml({
  finding,
  scan,
  generatedAt = new Date(),
}: {
  finding: AcunetixVulnerabilityDetail;
  scan?: AcunetixScan;
  generatedAt?: Date;
}) {
  const target =
    scan?.target?.address || finding.affects_url || "Unknown target";
  const severity = severityLabel(finding.severity);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(severity)} — ${escapeHtml(finding.vt_name || "Finding")}</title>
  <style>
    :root {
      --ink: #14201b; --muted: #5b6b64; --line: #d7e0db; --bg: #f4f7f5;
      --card: #fff; --critical: #b91c1c; --high: #c2410c; --medium: #a16207;
      --low: #15803d; --info: #0369a1;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); background: var(--bg); line-height: 1.5; }
    .wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
    header.report {
      background: linear-gradient(135deg, #0f766e, #134e4a); color: #ecfdf5;
      border-radius: 18px; padding: 28px; margin-bottom: 20px;
    }
    header.report h1 { margin: 8px 0 6px; font-size: 1.5rem; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 16px; }
    .meta div { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; padding: 10px 12px; }
    .meta .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.8; }
    .meta .v { font-weight: 600; margin-top: 2px; word-break: break-word; }
    .badge { display: inline-flex; border-radius: 999px; padding: 3px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #fee2e2; color: var(--critical); }
    .badge.sev-high { background: #ffedd5; color: var(--high); }
    .badge.sev-medium { background: #fef3c7; color: var(--medium); }
    .badge.sev-low { background: #dcfce7; color: var(--low); }
    .badge.sev-info { background: #e0f2fe; color: var(--info); }
    .finding { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; }
    .block { margin: 14px 0; }
    .label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
    pre.text, pre.mono { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; }
    pre.mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.82rem; background: #f8faf9; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
    footer { margin-top: 24px; color: var(--muted); font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="report">
      <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">Daybreak Scan Desk · Finding report</p>
      <span class="badge ${
        finding.severity >= 4
          ? ""
          : finding.severity === 3
            ? "sev-high"
            : finding.severity === 2
              ? "sev-medium"
              : finding.severity === 1
                ? "sev-low"
                : "sev-info"
      }">${escapeHtml(severity)}</span>
      <h1>${escapeHtml(finding.vt_name || "Finding")}</h1>
      <p style="margin:0;opacity:0.9;">${escapeHtml(target)}</p>
      <div class="meta">
        <div><div class="k">Affected URL</div><div class="v">${escapeHtml(finding.affects_url || "—")}</div></div>
        <div><div class="k">Status</div><div class="v">${escapeHtml(finding.status || "—")}</div></div>
        <div><div class="k">Confidence</div><div class="v">${finding.confidence ?? 0}%</div></div>
        <div><div class="k">Generated</div><div class="v">${escapeHtml(generatedAt.toISOString())}</div></div>
      </div>
    </header>
    ${findingHtml(finding, 0)}
    <footer>Generated by Daybreak Scan Desk · Single finding export</footer>
  </div>
</body>
</html>`;
}

export function downloadFindingReport({
  finding,
  scan,
}: {
  finding: AcunetixVulnerabilityDetail;
  scan: AcunetixScan;
}) {
  const html = buildSingleFindingReportHtml({ finding, scan });
  return triggerHtmlDownload(html, buildFindingFilename(finding, scan));
}
