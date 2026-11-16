import { NextResponse } from "next/server";
import { assertAgentAuth } from "@/lib/tunnel-auth";
import { assertAcunetixBaseUrl } from "@/lib/security";
import { setTunnelHeartbeat } from "@/lib/tunnel-store";

export async function POST(request: Request) {
  try {
    assertAgentAuth(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    tunnelUp?: boolean;
    publicUrl?: string | null;
    error?: string | null;
    result?: string | null;
  };

  let publicUrl: string | null = body.publicUrl ?? null;
  if (publicUrl) {
    try {
      publicUrl = assertAcunetixBaseUrl(publicUrl);
    } catch {
      publicUrl = null;
    }
  }

  await setTunnelHeartbeat({
    tunnelUp: Boolean(body.tunnelUp),
    publicUrl,
    at: Date.now(),
    error: body.error ?? null,
    result: body.result ?? null,
  });

  return NextResponse.json({ ok: true });
}