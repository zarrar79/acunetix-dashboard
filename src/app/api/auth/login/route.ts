import { NextResponse } from "next/server";
import { checkDashboardPassword, sessionCookieOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = body.password ?? "";

    if (!checkDashboardPassword(password)) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(await sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
