import { NextResponse } from "next/server";
import { acunetixFetch } from "@/lib/acunetix";
import { toErrorResponse } from "@/lib/errors";

/**
 * Public liveness for the tunnel path (no secrets returned).
 * Useful for uptime checks / knowing when Acunetix is unreachable.
 */
export async function GET() {
  const started = Date.now();
  try {
    await acunetixFetch("/api/v1/me");
    return NextResponse.json({
      ok: true,
      acunetix: "up",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const mapped = toErrorResponse(error);
    return NextResponse.json(
      {
        ok: false,
        acunetix: "down",
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
        code: mapped.body.code,
        error: mapped.body.error,
        traceId: mapped.body.traceId,
      },
      { status: 503 },
    );
  }
}
