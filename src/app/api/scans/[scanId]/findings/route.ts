import { NextResponse } from "next/server";
import {
  getScan,
  getVulnerabilityDetail,
  listScanVulnerabilities,
  summarizeFindings,
  type AcunetixVulnerabilityDetail,
} from "@/lib/acunetix";

type Params = { params: Promise<{ scanId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { scanId } = await params;
    const url = new URL(request.url);
    const includeDetails = url.searchParams.get("details") === "1";
    const vulnId = url.searchParams.get("vulnId");

    const scan = await getScan(scanId);
    const sessionId = scan.current_session?.scan_session_id;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Scan has no active session yet" },
        { status: 404 },
      );
    }

    if (vulnId) {
      const detail = await getVulnerabilityDetail(scanId, sessionId, vulnId);
      return NextResponse.json({
        scan,
        sessionId,
        finding: detail,
        fetchedAt: new Date().toISOString(),
      });
    }

    const data = await listScanVulnerabilities(scanId, sessionId, 100);
    const vulnerabilities = data.vulnerabilities ?? [];

    let detailed: AcunetixVulnerabilityDetail[] = vulnerabilities;
    if (includeDetails && vulnerabilities.length > 0) {
      const capped = vulnerabilities.slice(0, 40);
      detailed = await Promise.all(
        capped.map(async (vuln) => {
          try {
            return await getVulnerabilityDetail(
              scanId,
              sessionId,
              vuln.vuln_id,
            );
          } catch {
            return vuln;
          }
        }),
      );
    }

    // Sort Critical → Informational
    detailed.sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));

    return NextResponse.json({
      scan,
      sessionId,
      summary: summarizeFindings(vulnerabilities),
      findings: detailed,
      pagination: data.pagination,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch findings";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
