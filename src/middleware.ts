import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const authed = await verifySessionToken(token, process.env.AUTH_SECRET);

  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/scans") ||
    pathname.startsWith("/api/targets")
  ) {
    if (!authed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === "/login" && authed) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/scans",
    "/api/scans/:path*",
    "/api/targets",
    "/api/targets/:path*",
    "/login",
  ],
};
