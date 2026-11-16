const encoder = new TextEncoder();

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const AUTH_COOKIE = "ax_dash_session";
/** 24 hours — short enough for a shared-password ops desk. */
export const MAX_AGE_SECONDS = 60 * 60 * 24;

export async function createSessionToken(secret: string) {
  const issuedAt = Date.now().toString();
  const signature = await hmacHex(secret, issuedAt);
  return `${issuedAt}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string | undefined,
  maxAgeSeconds = MAX_AGE_SECONDS,
) {
  if (!token || !secret) return false;
  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const expected = await hmacHex(secret, issuedAt);
  if (!timingSafeEqualHex(signature, expected)) return false;

  const ageMs = Date.now() - Number(issuedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeSeconds * 1000) {
    return false;
  }

  return true;
}
