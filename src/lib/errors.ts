export type AppErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "LIMIT_REACHED"
  | "CONNECTION"
  | "TIMEOUT"
  | "ACUNETIX"
  | "CONFIG"
  | "INTERNAL";

export class AppError extends Error {
  code: AppErrorCode;
  status: number;
  traceId: string;
  details?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: {
      status?: number;
      details?: unknown;
      traceId?: string;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? statusForCode(code);
    this.traceId = options?.traceId ?? createTraceId();
    this.details = options?.details;
  }
}

export function createTraceId() {
  return `ax-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusForCode(code: AppErrorCode) {
  switch (code) {
    case "VALIDATION":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "LIMIT_REACHED":
      return 409;
    case "TIMEOUT":
      return 504;
    case "CONNECTION":
      return 502;
    case "CONFIG":
      return 500;
    default:
      return 500;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

function extractAcunetixMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      details?: unknown;
      code?: number | string;
    };
    return {
      message: parsed.message || body,
      details: parsed.details ?? parsed,
      code: parsed.code,
    };
  } catch {
    return { message: body, details: body, code: undefined };
  }
}

export function mapFetchFailure(error: unknown, traceId?: string): AppError {
  const id = traceId ?? createTraceId();
  if (isAppError(error)) return error;

  if (error instanceof TypeError) {
    return new AppError(
      "CONNECTION",
      "Cannot reach Acunetix. Check that Acunetix and the Cloudflare tunnel are running on your PC.",
      { traceId: id, cause: error, details: String(error.message) },
    );
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new AppError(
      "TIMEOUT",
      "The request to Acunetix timed out. The tunnel or scanner may be overloaded.",
      { traceId: id, cause: error },
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("fetch failed") || message.includes("econnrefused")) {
      return new AppError(
        "CONNECTION",
        "Connection to Acunetix failed. Verify tunnel URL and that the scanner service is online.",
        { traceId: id, cause: error, details: error.message },
      );
    }
    if (message.includes("timed out") || message.includes("timeout")) {
      return new AppError(
        "TIMEOUT",
        "Acunetix did not respond in time. Try again in a moment.",
        { traceId: id, cause: error, details: error.message },
      );
    }
    return new AppError("INTERNAL", error.message, {
      traceId: id,
      cause: error,
    });
  }

  return new AppError("INTERNAL", "Unexpected application error", {
    traceId: id,
    details: error,
  });
}

export function mapAcunetixHttpError(
  status: number,
  body: string,
  path: string,
  traceId?: string,
) {
  const id = traceId ?? createTraceId();
  const parsed = extractAcunetixMessage(body);
  const lower = `${parsed.message} ${body}`.toLowerCase();

  if (status === 401 || status === 403) {
    return new AppError(
      "UNAUTHORIZED",
      "Acunetix rejected the API key. Check ACUNETIX_API_KEY in Vercel env vars.",
      { status, traceId: id, details: { path, ...parsed } },
    );
  }

  if (status === 404) {
    return new AppError(
      "NOT_FOUND",
      `Acunetix resource not found (${path}). The scan or target may have been deleted.`,
      { status, traceId: id, details: { path, ...parsed } },
    );
  }

  if (
    status === 409 ||
    lower.includes("limit") ||
    lower.includes("license") ||
    lower.includes("quota") ||
    lower.includes("maximum") ||
    lower.includes("too many")
  ) {
    return new AppError(
      "LIMIT_REACHED",
      parsed.message ||
        "Acunetix scan/target limit reached. Free a license slot or wait for running scans to finish.",
      { status: 409, traceId: id, details: { path, ...parsed } },
    );
  }

  if (status === 400 || status === 422) {
    return new AppError(
      "VALIDATION",
      parsed.message || "Acunetix rejected the request as invalid.",
      { status: 400, traceId: id, details: { path, ...parsed } },
    );
  }

  if (status >= 500) {
    return new AppError(
      "ACUNETIX",
      "Acunetix returned a server error. Check the scanner service logs on your PC.",
      { status, traceId: id, details: { path, ...parsed } },
    );
  }

  return new AppError(
    "ACUNETIX",
    parsed.message || `Acunetix request failed with HTTP ${status}`,
    { status, traceId: id, details: { path, ...parsed } },
  );
}

export function toErrorResponse(error: unknown) {
  const appError = isAppError(error)
    ? error
    : mapFetchFailure(error);

  console.error("[DaybreakError]", {
    traceId: appError.traceId,
    code: appError.code,
    message: appError.message,
    details: appError.details,
  });

  return {
    body: {
      ok: false,
      error: appError.message,
      code: appError.code,
      traceId: appError.traceId,
      details: appError.details ?? null,
    },
    status: appError.status,
  };
}
