import { NextResponse } from "next/server";
import { assertAgentAuth } from "@/lib/tunnel-auth";
import { clearTunnelCommand, getTunnelCommand } from "@/lib/tunnel-store";

export async function GET(request: Request) {
  try {
    assertAgentAuth(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const command = await getTunnelCommand();
  if (!command) {
    return NextResponse.json({ command: null });
  }

  if (command.expiresAt < Date.now()) {
    await clearTunnelCommand(command.id);
    return NextResponse.json({ command: null });
  }

  // Deliver once
  await clearTunnelCommand(command.id);
  return NextResponse.json({ command });
}
