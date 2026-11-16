import { NextResponse } from "next/server";
import { listScans, summarizeScans } from "@/lib/acunetix";
import { toErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const data = await listScans(50);
    const summary = summarizeScans(data.scans ?? []);
    return NextResponse.json({
      summary,
      scans: data.scans ?? [],
      pagination: data.pagination,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const mapped = toErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
