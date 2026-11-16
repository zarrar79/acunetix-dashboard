import { NextResponse } from "next/server";
import { createTargetsBulk } from "@/lib/acunetix";

export const maxDuration = 300;

function parseUploadedText(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let addresses: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Upload a .txt or .csv file of URLs" },
          { status: 400 },
        );
      }
      const text = await file.text();
      addresses = parseUploadedText(text);
    } else {
      const body = (await request.json()) as { addresses?: string[] };
      addresses = body.addresses ?? [];
    }

    const result = await createTargetsBulk(addresses);
    return NextResponse.json({
      ok: true,
      ...result,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to bulk-add targets";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
