import { NextResponse } from "next/server";
import { getTunnelStatus } from "@/lib/tunnel-store";

export async function GET() {
  const status = await getTunnelStatus();
  return NextResponse.json({
    ...status,
    checkedAt: new Date().toISOString(),
  });
}
