#!/usr/bin/env bash
# Install the hardcoded PC tunnel controller as a user systemd service.
# No Cursor / AI involved after this.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DST="$HOME/.config/systemd/user/daybreak-tunnel-agent.service"
ENV_FILE="$ROOT/.env.tunnel-agent"
NODE_BIN="$(command -v node)"
CTL="$ROOT/scripts/tunnel-ctl.mjs"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE (needs DASHBOARD_URL + TUNNEL_AGENT_TOKEN)"
  exit 1
fi
chmod +x "$CTL" "$ROOT/scripts/tunnel-agent.mjs" || true

mkdir -p "$HOME/.config/systemd/user"
cat > "$UNIT_DST" <<EOF
[Unit]
Description=Daybreak tunnel controller (PC script — no AI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${CTL} agent
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now daybreak-tunnel-agent.service
loginctl enable-linger "$(whoami)" 2>/dev/null || true
systemctl --user status daybreak-tunnel-agent.service --no-pager || true
echo
echo "Installed. Control from this PC:"
echo "  node scripts/tunnel-ctl.mjs start"
echo "  node scripts/tunnel-ctl.mjs stop"
echo "  node scripts/tunnel-ctl.mjs status"
echo "Or use Start/Stop on the Vercel dashboard (same script verifies your PC password)."
