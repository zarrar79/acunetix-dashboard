import { NextResponse } from "next/server";
import { AppError, toErrorResponse } from "@/lib/errors";
import { getTunnelAgentToken } from "@/lib/tunnel-auth";
import { sealJson } from "@/lib/tunnel-crypto";
import {
  getTunnelStatus,
  setTunnelCommand,
  type TunnelAction,
} from "@/lib/tunnel-store";
import { clientIpFromRequest, consumeRateLimit } from "@/lib/rate-limit";

const ACTIONS = new Set<TunnelAction>(["start", "stop"]);

export async function POST(request: Request) {
  try {
    const ip = clientIpFromRequest(request);
    const limited = consumeRateLimit(`tunnel-control:${ip}`, 8, 15 * 60 * 1000);
    if (!limited.ok) {
      throw new AppError(
        "LIMIT_REACHED",
        "Too many tunnel control attempts. Try again later.",
        { status: 429 },
      );
    }

    const body = (await request.json()) as {
      action?: string;
      password?: string;
    };
    const action = body.action as TunnelAction | undefined;
    const password = body.password ?? "";

    if (!action || !ACTIONS.has(action)) {
      throw new AppError("VALIDATION", 'Action must be "start" or "stop"');
    }
    if (!password || password.length < 1) {
      throw new AppError(
        "VALIDATION",
        "PC sudo/root password is required to control the tunnel.",
      );
    }

    let agentToken: string;
    try {
      agentToken = getTunnelAgentToken();
    } catch {
      throw new AppError(
        "CONFIG",
        "Tunnel agent is not configured (TUNNEL_AGENT_TOKEN).",
      );
    }

    const status = await getTunnelStatus();
    if (!status.agentOnline) {
      throw new AppError(
        "CONNECTION",
        "PC tunnel agent is offline. Start scripts/tunnel-agent on your PC first.",
        { status: 503 },
      );
    }

    const id = `tun-${Date.now().toString(36)}`;
    const sealedPassword = await sealJson(agentToken, {
      password,
      exp: Date.now() + 90_000,
      action,
      id,
    });

    await setTunnelCommand({
      id,
      action,
      sealedPassword,
      createdAt: Date.now(),
      expiresAt: Date.now() + 90_000,
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      action,
      id,
      message:
        action === "start"
          ? "Start queued. Agent will verify your PC password and bring the tunnel up."
          : "Stop queued. Agent will verify your PC password and take the tunnel down.",
    });
  } catch (error) {
    const mapped = toErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
