import {
  AppError,
  createTraceId,
  mapAcunetixHttpError,
  mapFetchFailure,
} from "@/lib/errors";
import {
  assertAcunetixBaseUrl,
  cloudflareAccessHeaders,
} from "@/lib/security";

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

async function getConfig() {
  const apiKey = process.env.ACUNETIX_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "CONFIG",
      "Scanner configuration is missing. Set ACUNETIX_API_KEY.",
    );
  }

  const { getRuntimeTunnelUrl } = await import("@/lib/tunnel-store");
  const runtimeUrl = await getRuntimeTunnelUrl();
  const rawBase = runtimeUrl || process.env.ACUNETIX_BASE_URL;

  if (!rawBase) {
    throw new AppError(
      "CONFIG",
      "Scanner URL missing. Start the tunnel from the dashboard or set ACUNETIX_BASE_URL.",
    );
  }

  let baseUrl: string;
  try {
    baseUrl = assertAcunetixBaseUrl(rawBase);
  } catch (error) {
    throw new AppError(
      "CONFIG",
      error instanceof Error
        ? error.message
        : "ACUNETIX_BASE_URL failed validation.",
    );
  }

  return { baseUrl, apiKey };
}

export async function acunetixFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const traceId = createTraceId();
  const { baseUrl, apiKey } = await getConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "X-Auth": apiKey,
        ...cloudflareAccessHeaders(),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    throw mapFetchFailure(error, traceId);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw mapAcunetixHttpError(response.status, body, path, traceId);
  }

  if (
    response.status === 204 ||
    response.headers.get("content-length") === "0"
  ) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new AppError(
      "ACUNETIX",
      "Acunetix returned an unreadable response.",
      { traceId, details: { path, preview: text.slice(0, 200) }, cause: error },
    );
  }
}

export const FULL_SCAN_PROFILE_ID = "11111111-1111-1111-1111-111111111111";
export const COMPREHENSIVE_NEW_REPORT_ID =
  "11111111-1111-1111-1111-111111111126";
export const BUSINESS_CRITICALITY_CRITICAL = 30;

export type CreatedTarget = {
  target_id: string;
  address: string;
  criticality: number;
  description?: string;
  fqdn?: string;
};

export async function listScans(limit = 50): Promise<ScansResponse> {
  return acunetixFetch<ScansResponse>(`/api/v1/scans?l=${limit}`);
}

type TargetDetails = CreatedTarget & {
  continuous_mode?: boolean;
  criticality: number;
};

type TargetConfiguration = {
  scan_speed?: string;
  default_scanning_profile_id?: string | null;
};

type ContinuousScanSetting = {
  enabled?: boolean;
};

type CreatedScan = {
  scan_id: string;
  profile_id?: string;
  report_template_id?: string;
};

function assertStrict(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new AppError("VALIDATION", message);
  }
}

/**
 * Strict defaults for every new target:
 * - Address: provided by user
 * - Scan speed: slow
 * - Business criticality: Critical (30)
 * - Continuous scanning: enabled
 * - Report: Comprehensive (new)
 */
async function applyStrictDefaultsAndScan(targetId: string, address: string) {
  // Enforce Critical business criticality
  await acunetixFetch(`/api/v1/targets/${targetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      criticality: BUSINESS_CRITICALITY_CRITICAL,
    }),
  });

  // Scan speed: slow
  await acunetixFetch(`/api/v1/targets/${targetId}/configuration`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scan_speed: "slow",
      default_scanning_profile_id: FULL_SCAN_PROFILE_ID,
    }),
  });

  // Continuous scanning: checked/enabled
  await acunetixFetch(`/api/v1/targets/${targetId}/continuous_scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });

  // Start scan with Comprehensive (new) report
  const scan = await acunetixFetch<CreatedScan>("/api/v1/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_id: targetId,
      profile_id: FULL_SCAN_PROFILE_ID,
      report_template_id: COMPREHENSIVE_NEW_REPORT_ID,
      schedule: {
        disable: false,
        start_date: null,
        time_sensitive: false,
      },
    }),
  });

  const [targetDetails, configuration, continuous, scanDetails] =
    await Promise.all([
      acunetixFetch<TargetDetails>(`/api/v1/targets/${targetId}`),
      acunetixFetch<TargetConfiguration>(
        `/api/v1/targets/${targetId}/configuration`,
      ),
      acunetixFetch<ContinuousScanSetting>(
        `/api/v1/targets/${targetId}/continuous_scan`,
      ),
      acunetixFetch<CreatedScan>(`/api/v1/scans/${scan.scan_id}`),
    ]);

  assertStrict(
    targetDetails.criticality === BUSINESS_CRITICALITY_CRITICAL,
    `Business criticality must be Critical, got ${targetDetails.criticality}`,
  );
  assertStrict(
    configuration.scan_speed === "slow",
    `Scan speed must be slow, got ${configuration.scan_speed}`,
  );
  assertStrict(
    continuous.enabled === true && targetDetails.continuous_mode === true,
    "Continuous scanning must be enabled",
  );
  assertStrict(
    scanDetails.report_template_id === COMPREHENSIVE_NEW_REPORT_ID,
    `Report must be Comprehensive (new), got ${scanDetails.report_template_id}`,
  );

  return {
    target: targetDetails,
    scanId: scan.scan_id,
    settings: {
      address,
      scanSpeed: "slow" as const,
      businessCriticality: "Critical" as const,
      continuousScanning: true as const,
      report: "Comprehensive (new)" as const,
    },
  };
}

export function normalizeTargetAddresses(rawAddresses: string[]) {
  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const raw of rawAddresses) {
    const value = raw
      .replace(/^\uFEFF/, "")
      .split(",")[0]
      ?.trim()
      .replace(/^["']|["']$/g, "");
    if (!value) continue;
    if (/^address$/i.test(value) || /^url$/i.test(value)) continue;

    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(normalized);
  }

  return addresses;
}

export async function retryFailedScan(scanId: string) {
  if (!scanId) {
    throw new AppError("VALIDATION", "Scan id is required to retry.");
  }

  const scan = await getScan(scanId);
  const status = scan.current_session?.status?.toLowerCase?.() ?? "";
  const failed = ["failed", "aborted", "error"].includes(status);

  if (!failed) {
    throw new AppError(
      "CONFLICT",
      `Only failed scans can be retried. Current status is "${status || "unknown"}".`,
      { details: { scanId, status } },
    );
  }

  if (!scan.target_id) {
    throw new AppError(
      "NOT_FOUND",
      "This failed scan has no target id, so it cannot be retried.",
      { details: { scanId } },
    );
  }

  const address = scan.target?.address || scan.target_id;
  return applyStrictDefaultsAndScan(scan.target_id, address);
}

export async function createTargetWithDefaults(address: string) {
  const [trimmed] = normalizeTargetAddresses([address]);
  if (!trimmed) {
    throw new AppError("VALIDATION", "Address is required");
  }

  const created = await acunetixFetch<{ targets: CreatedTarget[] }>(
    "/api/v1/targets/add",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targets: [
          {
            address: trimmed,
            description: "",
            type: "default",
            criticality: BUSINESS_CRITICALITY_CRITICAL,
          },
        ],
      }),
    },
  );

  const target = created.targets?.[0];
  if (!target?.target_id) {
    throw new AppError("ACUNETIX", "Acunetix did not return a target id");
  }

  return applyStrictDefaultsAndScan(target.target_id, trimmed);
}

export type BulkTargetResult = {
  address: string;
  ok: boolean;
  targetId?: string;
  scanId?: string;
  error?: string;
};

export async function createTargetsBulk(rawAddresses: string[]) {
  const addresses = normalizeTargetAddresses(rawAddresses);
  if (addresses.length === 0) {
    throw new AppError(
      "VALIDATION",
      "No valid URLs found in the upload. Use one URL per line in a .txt or .csv file.",
    );
  }
  if (addresses.length > 50) {
    throw new AppError(
      "LIMIT_REACHED",
      "Bulk upload is limited to 50 URLs at a time. Split the file and try again.",
      { details: { provided: addresses.length, max: 50 } },
    );
  }

  const created = await acunetixFetch<{ targets: CreatedTarget[] }>(
    "/api/v1/targets/add",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targets: addresses.map((address) => ({
          address,
          description: "",
          type: "default",
          criticality: BUSINESS_CRITICALITY_CRITICAL,
        })),
      }),
    },
  );

  const createdTargets = created.targets ?? [];
  const byAddress = new Map(
    createdTargets.map((target) => [target.address.toLowerCase(), target]),
  );

  const results: BulkTargetResult[] = [];

  for (const address of addresses) {
    const target =
      byAddress.get(address.toLowerCase()) ||
      createdTargets.find(
        (item) =>
          item.address.toLowerCase().replace(/\/$/, "") ===
          address.toLowerCase().replace(/\/$/, ""),
      );

    if (!target?.target_id) {
      results.push({
        address,
        ok: false,
        error: "Target was not created in Acunetix",
      });
      continue;
    }

    try {
      const configured = await applyStrictDefaultsAndScan(
        target.target_id,
        address,
      );
      results.push({
        address,
        ok: true,
        targetId: configured.target.target_id,
        scanId: configured.scanId,
      });
    } catch (error) {
      results.push({
        address,
        ok: false,
        targetId: target.target_id,
        error: error instanceof Error ? error.message : "Failed to configure",
      });
    }
  }

  return {
    total: addresses.length,
    succeeded: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}

export async function getScan(scanId: string): Promise<AcunetixScan> {
  return acunetixFetch<AcunetixScan>(`/api/v1/scans/${scanId}`);
}

export async function listAllScans(pageSize = 100): Promise<ScansResponse> {
  const safeSize = Math.min(Math.max(pageSize, 1), 100);
  const scans: AcunetixScan[] = [];
  let cursor: string | null = null;
  let guard = 0;
  let lastPagination: ScansResponse["pagination"] = {
    count: 0,
    cursors: [null],
  };

  while (guard < 50) {
    guard += 1;
    const path: string = cursor
      ? `/api/v1/scans?l=${safeSize}&c=${encodeURIComponent(cursor)}`
      : `/api/v1/scans?l=${safeSize}`;
    const page: ScansResponse = await acunetixFetch<ScansResponse>(path);
    const batch = page.scans ?? [];
    scans.push(...batch);
    lastPagination = page.pagination ?? lastPagination;

    const cursors: Array<string | null> = page.pagination?.cursors ?? [];
    const next: string | null =
      cursors.length > 1 ? cursors[cursors.length - 1] : null;
    if (!next || batch.length === 0) break;
    cursor = next;
  }

  return {
    pagination: {
      ...lastPagination,
      count: scans.length,
    },
    scans,
  };
}

export type ScanControlAction = "pause" | "resume" | "stop" | "delete";

export async function controlScan(scanId: string, action: ScanControlAction) {
  if (!scanId) {
    throw new AppError("VALIDATION", "Scan id is required");
  }

  const scan = await getScan(scanId);
  const status = scan.current_session?.status?.toLowerCase?.() ?? "";

  if (action === "pause") {
    if (!["processing", "scanning", "starting", "queued", "resuming"].includes(status)) {
      throw new AppError(
        "CONFLICT",
        `Cannot pause a scan with status "${status || "unknown"}".`,
        { details: { scanId, status, action } },
      );
    }
    await acunetixFetch(`/api/v1/scans/${scanId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { ok: true, action, scanId };
  }

  if (action === "resume") {
    if (status !== "paused") {
      throw new AppError(
        "CONFLICT",
        `Cannot resume a scan with status "${status || "unknown"}".`,
        { details: { scanId, status, action } },
      );
    }
    await acunetixFetch(`/api/v1/scans/${scanId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { ok: true, action, scanId };
  }

  if (action === "stop") {
    if (
      ["completed", "failed", "aborted", "error"].includes(status)
    ) {
      throw new AppError(
        "CONFLICT",
        `Scan is already finished with status "${status}".`,
        { details: { scanId, status, action } },
      );
    }
    await acunetixFetch(`/api/v1/scans/${scanId}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { ok: true, action, scanId };
  }

  // delete
  const active = [
    "processing",
    "scanning",
    "starting",
    "queued",
    "pausing",
    "resuming",
    "paused",
    "scheduled",
  ].includes(status);

  if (active) {
    try {
      await acunetixFetch(`/api/v1/scans/${scanId}/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // continue to delete attempt
    }
  }

  await acunetixFetch(`/api/v1/scans/${scanId}`, {
    method: "DELETE",
  });

  return { ok: true, action, scanId };
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
