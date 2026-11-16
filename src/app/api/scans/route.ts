import { NextResponse } from "next/server";
import { listScans, summarizeScans } from "@/lib/acunetix";

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
    const message =
      error instanceof Error ? error.message : "Failed to fetch scans";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
