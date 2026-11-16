import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/session";
import { SECURITY_HEADERS } from "@/lib/security";

function withSecurityHeaders(response: NextResponse) {
  for (const header of SECURITY_HEADERS) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const authed = await verifySessionToken(token, process.env.AUTH_SECRET);

  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/scans") ||
    pathname === "/api/targets" ||
    pathname.startsWith("/api/targets/")
  ) {
    if (!authed) {
      if (pathname.startsWith("/api/")) {
        return withSecurityHeaders(
          NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        );
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return withSecurityHeaders(NextResponse.redirect(loginUrl));
    }
  }

  if (pathname === "/login" && authed) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/dashboard", request.url)),
    );
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/scans",
    "/api/scans/:path*",
    "/api/targets",
    "/api/targets/:path*",
    "/api/auth/login",
    "/api/health",
    "/login",
    "/",
  ],
};
