export type TunnelAction = "start" | "stop";

export type TunnelCommand = {
  id: string;
  action: TunnelAction;
  /** AES-sealed blob containing { password, exp } — agent decrypts on PC */
  sealedPassword: string;
  createdAt: number;
  expiresAt: number;
};

export type TunnelStatus = {
  tunnelUp: boolean;
  agentOnline: boolean;
  publicUrl: string | null;
  lastHeartbeatAt: number | null;
  lastError: string | null;
  lastResult: string | null;
  pendingAction: TunnelAction | null;
};

type Heartbeat = {
  tunnelUp: boolean;
  publicUrl: string | null;
  at: number;
  error?: string | null;
  result?: string | null;
};

const memory = {
  command: null as TunnelCommand | null,
  heartbeat: null as Heartbeat | null,
};

function agentOnline(at: number | null) {
  if (!at) return false;
  return Date.now() - at < 20_000;
}

async function redisEnabled() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

async function redisFetch(path: string, body: unknown) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return null;
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as { result?: unknown };
}

export async function setTunnelCommand(command: TunnelCommand) {
  memory.command = command;
  if (await redisEnabled()) {
    await redisFetch("/set", [
      "daybreak:tunnel:command",
      JSON.stringify(command),
      "EX",
      "120",
    ]);
  }
}

export async function getTunnelCommand() {
  if (await redisEnabled()) {
    const data = await redisFetch("/get", ["daybreak:tunnel:command"]);
    const raw = data?.result;
    if (typeof raw === "string" && raw) {
      try {
        return JSON.parse(raw) as TunnelCommand;
      } catch {
        return null;
      }
    }
  }
  const cmd = memory.command;
  if (!cmd) return null;
  if (cmd.expiresAt < Date.now()) {
    memory.command = null;
    return null;
  }
  return cmd;
}

export async function clearTunnelCommand(id?: string) {
  const current = await getTunnelCommand();
  if (id && current && current.id !== id) return;
  memory.command = null;
  if (await redisEnabled()) {
    await redisFetch("/del", ["daybreak:tunnel:command"]);
  }
}

export async function setTunnelHeartbeat(heartbeat: Heartbeat) {
  memory.heartbeat = heartbeat;
  if (await redisEnabled()) {
    await redisFetch("/set", [
      "daybreak:tunnel:heartbeat",
      JSON.stringify(heartbeat),
      "EX",
      "60",
    ]);
  }
}

export async function getTunnelHeartbeat() {
  if (await redisEnabled()) {
    const data = await redisFetch("/get", ["daybreak:tunnel:heartbeat"]);
    const raw = data?.result;
    if (typeof raw === "string" && raw) {
      try {
        return JSON.parse(raw) as Heartbeat;
      } catch {
        /* fall through */
      }
    }
  }
  return memory.heartbeat;
}

export async function getTunnelStatus(): Promise<TunnelStatus> {
  const heartbeat = await getTunnelHeartbeat();
  const command = await getTunnelCommand();
  const lastHeartbeatAt = heartbeat?.at ?? null;
  return {
    tunnelUp: Boolean(heartbeat?.tunnelUp && agentOnline(lastHeartbeatAt)),
    agentOnline: agentOnline(lastHeartbeatAt),
    publicUrl: heartbeat?.publicUrl ?? null,
    lastHeartbeatAt,
    lastError: heartbeat?.error ?? null,
    lastResult: heartbeat?.result ?? null,
    pendingAction: command?.action ?? null,
  };
}

export async function getRuntimeTunnelUrl() {
  const heartbeat = await getTunnelHeartbeat();
  if (
    heartbeat?.publicUrl &&
    heartbeat.tunnelUp &&
    agentOnline(heartbeat.at)
  ) {
    return heartbeat.publicUrl.replace(/\/$/, "");
  }
  return null;
}
