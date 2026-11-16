import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  MAX_AGE_SECONDS,
  createSessionToken as createToken,
  verifySessionToken,
} from "@/lib/session";

export { AUTH_COOKIE };

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET environment variable.");
  }
  return secret;
}

export async function createSessionToken() {
  return createToken(getSecret());
}

export function checkDashboardPassword(password: string) {
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  if (!expected || !password) return false;
  if (expected.length !== password.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function isAuthenticated() {
  const jar = await cookies();
  return verifySessionToken(jar.get(AUTH_COOKIE)?.value, process.env.AUTH_SECRET);
}

export async function sessionCookieOptions() {
  const token = await createSessionToken();
  return {
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}
