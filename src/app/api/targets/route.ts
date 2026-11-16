import { NextResponse } from "next/server";
import { createTargetWithDefaults } from "@/lib/acunetix";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string };
    const address = body.address?.trim() ?? "";

    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 },
      );
    }

    const result = await createTargetWithDefaults(address);
    return NextResponse.json({
      ok: true,
      ...result,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add target";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
