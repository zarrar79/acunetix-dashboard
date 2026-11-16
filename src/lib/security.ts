/** Strip secrets / credentials before logging or returning details. */
export function redactSensitive(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value
      .replace(/(X-Auth\s*[:=]\s*)\S+/gi, "$1[redacted]")
      .replace(/(api[_-]?key\s*[:=]\s*)\S+/gi, "$1[redacted]")
      .replace(/(authorization\s*[:=]\s*)\S+/gi, "$1[redacted]")
      .replace(/(bearer\s+)\S+/gi, "$1[redacted]")
      .replace(/(password\s*[:=]\s*)\S+/gi, "$1[redacted]")
      .replace(/(pbkdf2\$)\S+/gi, "$1[redacted]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (
        /secret|password|api[_-]?key|authorization|cookie|token|x-auth/i.test(
          key,
        )
      ) {
        out[key] = "[redacted]";
      } else {
        out[key] = redactSensitive(nested);
      }
    }
    return out;
  }
  return value;
}

export function assertAcunetixBaseUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ACUNETIX_BASE_URL is not a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("ACUNETIX_BASE_URL must use https");
  }

  const allowlist = (process.env.ACUNETIX_ALLOWED_HOSTS || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length > 0) {
    const host = url.hostname.toLowerCase();
    const ok = allowlist.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
    if (!ok) {
      throw new Error(
        `ACUNETIX_BASE_URL host "${host}" is not in ACUNETIX_ALLOWED_HOSTS`,
      );
    }
  }

  return url.toString().replace(/\/$/, "");
}

export function cloudflareAccessHeaders(): Record<string, string> {
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!id || !secret) return {};
  return {
    "CF-Access-Client-Id": id,
    "CF-Access-Client-Secret": secret,
  };
}

export const SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];
