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

const GH_PATH_HEARTBEAT = ".data/tunnel-heartbeat.json";
const GH_PATH_COMMAND = ".data/tunnel-command.json";
const GH_BRANCH = "tunnel-runtime";

function agentOnline(at: number | null) {
  if (!at) return false;
  return Date.now() - at < 45_000;
}

function githubConfig() {
  const token =
    process.env.TUNNEL_STATE_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const repo =
    process.env.TUNNEL_STATE_GITHUB_REPO || "zarrar79/acunetix-dashboard";
  if (!token) return null;
  return { token, repo };
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

async function githubGetJson<T>(path: string): Promise<{
  value: T | null;
  sha: string | null;
}> {
  const cfg = githubConfig();
  if (!cfg) return { value: null, sha: null };
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${path}?ref=${GH_BRANCH}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (response.status === 404) return { value: null, sha: null };
  if (!response.ok) return { value: null, sha: null };
  const data = (await response.json()) as { content?: string; sha?: string };
  if (!data.content || !data.sha) return { value: null, sha: null };
  try {
    const json = Buffer.from(data.content, "base64").toString("utf8");
    return { value: JSON.parse(json) as T, sha: data.sha };
  } catch {
    return { value: null, sha: data.sha };
  }
}

async function githubEnsureBranch() {
  const cfg = githubConfig();
  if (!cfg) return;
  const refUrl = `https://api.github.com/repos/${cfg.repo}/git/ref/heads/${GH_BRANCH}`;
  const existing = await fetch(refUrl, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });
  if (existing.ok) return;

  const mainRef = await fetch(
    `https://api.github.com/repos/${cfg.repo}/git/ref/heads/main`,
    {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    },
  );
  if (!mainRef.ok) return;
  const main = (await mainRef.json()) as { object?: { sha?: string } };
  const sha = main.object?.sha;
  if (!sha) return;
  await fetch(`https://api.github.com/repos/${cfg.repo}/git/refs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: `refs/heads/${GH_BRANCH}`, sha }),
  });
}

async function githubPutJson(path: string, value: unknown, message: string) {
  const cfg = githubConfig();
  if (!cfg) return false;
  await githubEnsureBranch();
  const current = await githubGetJson<unknown>(path);
  const content = Buffer.from(JSON.stringify(value, null, 2), "utf8").toString(
    "base64",
  );
  const response = await fetch(
    `https://api.github.com/repos/${cfg.repo}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        message,
        content,
        branch: GH_BRANCH,
        ...(current.sha ? { sha: current.sha } : {}),
      }),
    },
  );
  return response.ok;
}

async function githubDelete(path: string, message: string) {
  const cfg = githubConfig();
  if (!cfg) return;
  const current = await githubGetJson<unknown>(path);
  if (!current.sha) return;
  await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      branch: GH_BRANCH,
      sha: current.sha,
    }),
  });
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
  await githubPutJson(
    GH_PATH_COMMAND,
    command,
    `tunnel: queue ${command.action} ${command.id}`,
  );
}

export async function getTunnelCommand() {
  if (await redisEnabled()) {
    const data = await redisFetch("/get", ["daybreak:tunnel:command"]);
    const raw = data?.result;
    if (typeof raw === "string" && raw) {
      try {
        return JSON.parse(raw) as TunnelCommand;
      } catch {
        /* continue */
      }
    }
  }

  const fromGh = await githubGetJson<TunnelCommand>(GH_PATH_COMMAND);
  if (fromGh.value) {
    if (fromGh.value.expiresAt < Date.now()) {
      await clearTunnelCommand(fromGh.value.id);
      return null;
    }
    memory.command = fromGh.value;
    return fromGh.value;
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
  await githubDelete(GH_PATH_COMMAND, "tunnel: clear command");
}

export async function setTunnelHeartbeat(heartbeat: Heartbeat) {
  memory.heartbeat = heartbeat;
  if (await redisEnabled()) {
    await redisFetch("/set", [
      "daybreak:tunnel:heartbeat",
      JSON.stringify(heartbeat),
      "EX",
      "120",
    ]);
  }
  await githubPutJson(
    GH_PATH_HEARTBEAT,
    heartbeat,
    heartbeat.tunnelUp
      ? `tunnel: up ${heartbeat.publicUrl || ""}`.trim()
      : "tunnel: down",
  );
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

  const fromGh = await githubGetJson<Heartbeat>(GH_PATH_HEARTBEAT);
  if (fromGh.value) {
    memory.heartbeat = fromGh.value;
    return fromGh.value;
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
    publicUrl: heartbeat?.tunnelUp ? heartbeat.publicUrl ?? null : null,
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

/** True when agent recently reported the tunnel as down (or offline). */
export async function isTunnelKnownDown() {
  const heartbeat = await getTunnelHeartbeat();
  if (!heartbeat) return false;
  if (!agentOnline(heartbeat.at)) return true;
  return !heartbeat.tunnelUp;
}
