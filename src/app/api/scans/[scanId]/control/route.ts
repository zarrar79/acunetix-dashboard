import { NextResponse } from "next/server";
import { controlScan, type ScanControlAction } from "@/lib/acunetix";
import { AppError, toErrorResponse } from "@/lib/errors";

type Params = { params: Promise<{ scanId: string }> };

const ACTIONS = new Set<ScanControlAction>([
  "pause",
  "resume",
  "stop",
  "delete",
]);

export async function POST(request: Request, { params }: Params) {
  try {
    const { scanId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
    };
    const action = body.action as ScanControlAction | undefined;

    if (!action || !ACTIONS.has(action)) {
      throw new AppError(
        "VALIDATION",
        'Action must be one of: pause, resume, stop, delete',
      );
    }

    const result = await controlScan(scanId, action);
    return NextResponse.json({
      ...result,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const mapped = toErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
