import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  MAX_AGE_SECONDS,
  createSessionToken as createToken,
  verifySessionToken,
} from "@/lib/session";
import { isPasswordHash, verifyPassword } from "@/lib/password";

export { AUTH_COOKIE };

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET environment variable.");
  }
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters.");
  }
  return secret;
}

export async function createSessionToken() {
  return createToken(getSecret());
}

/**
 * Prefer DASHBOARD_PASSWORD_HASH (pbkdf2$...).
 * Plain DASHBOARD_PASSWORD is only accepted in non-production for local bootstrapping.
 */
export async function checkDashboardPassword(password: string) {
  if (!password) return false;

  const hash = process.env.DASHBOARD_PASSWORD_HASH;
  if (isPasswordHash(hash)) {
    return verifyPassword(password, hash);
  }

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  if (!expected || expected.length !== password.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function isAuthenticated() {
  const jar = await cookies();
  return verifySessionToken(
    jar.get(AUTH_COOKIE)?.value,
    process.env.AUTH_SECRET,
  );
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
