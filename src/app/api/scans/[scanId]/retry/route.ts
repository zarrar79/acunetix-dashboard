import { NextResponse } from "next/server";
import { retryFailedScan } from "@/lib/acunetix";
import { toErrorResponse } from "@/lib/errors";

type Params = { params: Promise<{ scanId: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { scanId } = await params;
    const result = await retryFailedScan(scanId);
    return NextResponse.json({
      ok: true,
      ...result,
      retriedFromScanId: scanId,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const mapped = toErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
