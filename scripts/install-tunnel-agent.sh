#!/usr/bin/env bash
# Install Daybreak tunnel agent as a user systemd service (runs without Cursor).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/scripts/tunnel-agent.service"
UNIT_DST="$HOME/.config/systemd/user/daybreak-tunnel-agent.service"
ENV_FILE="$ROOT/.env.tunnel-agent"
NODE_BIN="$(command -v node)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — create it with DASHBOARD_URL and TUNNEL_AGENT_TOKEN"
  exit 1
fi

mkdir -p "$HOME/.config/systemd/user"
# Rewrite ExecStart to this machine's node path
sed "s|^ExecStart=.*|ExecStart=${NODE_BIN} ${ROOT}/scripts/tunnel-agent.mjs|" \
  "$UNIT_SRC" > "$UNIT_DST"
# Ensure WorkingDirectory / EnvironmentFile match this checkout
sed -i "s|^WorkingDirectory=.*|WorkingDirectory=${ROOT}|" "$UNIT_DST"
sed -i "s|^EnvironmentFile=.*|EnvironmentFile=${ENV_FILE}|" "$UNIT_DST"

systemctl --user daemon-reload
systemctl --user enable --now daybreak-tunnel-agent.service
systemctl --user status daybreak-tunnel-agent.service --no-pager || true
echo
echo "Installed. Agent auto-restarts and auto-retries cloudflared."
echo "Logs: journalctl --user -u daybreak-tunnel-agent -f"
echo "Also: tail -f /tmp/daybreak-tunnel-agent.log"
