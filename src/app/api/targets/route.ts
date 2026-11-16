import { NextResponse } from "next/server";
import { createTargetWithDefaults } from "@/lib/acunetix";
import { AppError, toErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string };
    const address = body.address?.trim() ?? "";

    if (!address) {
      throw new AppError("VALIDATION", "Address is required");
    }

    const result = await createTargetWithDefaults(address);
    return NextResponse.json({
      ok: true,
      ...result,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const mapped = toErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
