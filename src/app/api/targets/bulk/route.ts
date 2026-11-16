import { NextResponse } from "next/server";
import { createTargetsBulk } from "@/lib/acunetix";
import { AppError, toErrorResponse } from "@/lib/errors";

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
        throw new AppError(
          "VALIDATION",
          "Upload a .txt or .csv file of URLs (one URL per line).",
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
    const mapped = toErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
