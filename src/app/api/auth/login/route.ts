import { NextResponse } from "next/server";
import { checkDashboardPassword, sessionCookieOptions } from "@/lib/auth";
import { clientIpFromRequest, consumeRateLimit } from "@/lib/rate-limit";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const ip = clientIpFromRequest(request);
    const limited = consumeRateLimit(
      `login:${ip}`,
      LOGIN_LIMIT,
      LOGIN_WINDOW_MS,
    );

    if (!limited.ok) {
      return NextResponse.json(
        {
          error: "Too many login attempts. Try again later.",
          code: "RATE_LIMIT",
          retryAfterSeconds: limited.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(limited.retryAfterSeconds),
          },
        },
      );
    }

    const body = (await request.json()) as { password?: string };
    const password = body.password ?? "";

    if (!(await checkDashboardPassword(password))) {
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
