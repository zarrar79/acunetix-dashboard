import { NextResponse } from "next/server";
import { listAllScans, summarizeScans } from "@/lib/acunetix";
import { toErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const data = await listAllScans(100);
    const scans = data.scans ?? [];
    const summary = summarizeScans(scans);
    return NextResponse.json({
      summary,
      scans,
      pagination: {
        ...data.pagination,
        count: scans.length,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const mapped = toErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
