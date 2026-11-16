import { timingSafeEqualHex } from "@/lib/session";

export function getTunnelAgentToken() {
  const token = process.env.TUNNEL_AGENT_TOKEN;
  if (!token || token.length < 24) {
    throw new Error("TUNNEL_AGENT_TOKEN is missing or too short");
  }
  return token;
}

function toHex(value: string) {
  return Array.from(new TextEncoder().encode(value))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function assertAgentAuth(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const provided = match?.[1]?.trim() || "";
  const expected = getTunnelAgentToken();
  const a = toHex(provided);
  const b = toHex(expected);
  if (a.length !== b.length || !timingSafeEqualHex(a, b)) {
    throw new Error("Unauthorized agent");
  }
}
