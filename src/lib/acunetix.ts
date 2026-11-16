export type SeverityCounts = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};

export type ScanSession = {
  event_level?: number;
  progress: number;
  scan_session_id: string;
  severity_counts: SeverityCounts;
  start_date: string;
  status: string;
  threat?: number;
};

export type AcunetixScan = {
  scan_id: string;
  profile_name: string;
  criticality: number;
  current_session: ScanSession;
  target: {
    address: string;
    criticality: number;
    description: string;
    type: string;
  };
  target_id: string;
};

export type ScansResponse = {
  pagination: {
    count: number;
    cursors: Array<string | null>;
  };
  scans: AcunetixScan[];
};

export type AcunetixVulnerability = {
  vuln_id: string;
  vt_id: string;
  vt_name: string;
  severity: number;
  criticality: number;
  confidence: number;
  status: string;
  affects_url: string;
  affects_detail: string;
  tags: string[];
  target_id: string;
  app?: string;
};

export type AcunetixVulnerabilityDetail = AcunetixVulnerability & {
  description?: string;
  details?: string;
  impact?: string;
  recommendation?: string;
  long_description?: string;
  cvss2?: string;
  cvss3?: string;
  cvss4?: string;
  cvss_score?: number;
  cvss4_score?: number;
  comment?: string | null;
  request?: string;
  response_info?: string;
  issue_url?: string;
  references?: Array<{ rel?: string; href?: string } | string>;
  highlights?: unknown;
};

export type VulnerabilitiesResponse = {
  pagination: {
    count: number;
    cursors: Array<string | null>;
  };
  vulnerabilities: AcunetixVulnerability[];
};

export {
  SEVERITY_LABELS,
  THREAT_LABELS,
  severityLabel,
  threatLabel,
  criticalityLabel,
} from "@/lib/labels";

function getConfig() {
  const baseUrl = process.env.ACUNETIX_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.ACUNETIX_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Missing ACUNETIX_BASE_URL or ACUNETIX_API_KEY environment variables.",
    );
  }

  return { baseUrl, apiKey };
}

export async function acunetixFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-Auth": apiKey,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Acunetix API ${response.status}: ${body || response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

export async function listScans(limit = 50): Promise<ScansResponse> {
  return acunetixFetch<ScansResponse>(`/api/v1/scans?l=${limit}`);
}

export async function getScan(scanId: string): Promise<AcunetixScan> {
  return acunetixFetch<AcunetixScan>(`/api/v1/scans/${scanId}`);
}

export async function listScanVulnerabilities(
  scanId: string,
  sessionId: string,
  limit = 100,
): Promise<VulnerabilitiesResponse> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return acunetixFetch<VulnerabilitiesResponse>(
    `/api/v1/scans/${scanId}/results/${sessionId}/vulnerabilities?l=${safeLimit}`,
  );
}

export async function getVulnerabilityDetail(
  scanId: string,
  sessionId: string,
  vulnId: string,
): Promise<AcunetixVulnerabilityDetail> {
  return acunetixFetch<AcunetixVulnerabilityDetail>(
    `/api/v1/scans/${scanId}/results/${sessionId}/vulnerabilities/${vulnId}`,
  );
}

export function summarizeFindings(vulns: AcunetixVulnerability[]) {
  const severity: SeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const vuln of vulns) {
    switch (vuln.severity) {
      case 4:
        severity.critical += 1;
        break;
      case 3:
        severity.high += 1;
        break;
      case 2:
        severity.medium += 1;
        break;
      case 1:
        severity.low += 1;
        break;
      default:
        severity.info += 1;
    }
  }

  return {
    total: vulns.length,
    severity,
    open: vulns.filter((v) => v.status === "open").length,
  };
}

export function summarizeScans(scans: AcunetixScan[]) {
  const runningStatuses = new Set([
    "processing",
    "scheduled",
    "queued",
    "starting",
    "pausing",
    "resuming",
  ]);

  let running = 0;
  let completed = 0;
  let failed = 0;
  const severity: SeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const scan of scans) {
    const status = scan.current_session?.status?.toLowerCase?.() ?? "";
    if (runningStatuses.has(status) || status === "scanning") running += 1;
    else if (status === "completed" || status === "complete") completed += 1;
    else if (status === "failed" || status === "aborted" || status === "error")
      failed += 1;

    const counts = scan.current_session?.severity_counts;
    if (counts) {
      severity.critical += counts.critical ?? 0;
      severity.high += counts.high ?? 0;
      severity.medium += counts.medium ?? 0;
      severity.low += counts.low ?? 0;
      severity.info += counts.info ?? 0;
    }
  }

  return {
    total: scans.length,
    running,
    completed,
    failed,
    severity,
  };
}
