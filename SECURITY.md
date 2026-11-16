# Daybreak Scan Desk — security notes

## Applied controls

- Dashboard password stored as **PBKDF2** hash (`DASHBOARD_PASSWORD_HASH`)
- Login **rate limit**: 5 attempts / IP / 15 minutes
- Session cookie: httpOnly, 24h max age, HMAC-signed with `AUTH_SECRET`
- Acunetix API key used **server-side only**
- `ACUNETIX_ALLOWED_HOSTS` validates the scanner base URL host
- Optional Cloudflare Access service-token headers
- Security headers + CSP
- Error logs redact secrets; API error bodies omit raw upstream details
- `/api/health` for tunnel/Acunetix reachability (no secrets)
- Dashboard **tunnel start/stop** via PC agent; sudo password verified **on the PC** (sealed in transit)

## Tunnel agent

1. Set the same `TUNNEL_AGENT_TOKEN` on Vercel and in `.env.tunnel-agent` on the PC.
2. Run `node scripts/tunnel-agent.mjs` (or install `scripts/tunnel-agent.service`).
3. Use Start/Stop on the dashboard and enter your **PC sudo password**.
4. Password is sealed with the agent token, pulled by the agent, checked with `sudo`, never stored.

## Operator checklist

1. Keep secrets only in Vercel env / local `.env.local` (never commit).
2. Prefer a **named Cloudflare Tunnel + Access** — see `scripts/setup-named-tunnel.md`.
3. Rotate `ACUNETIX_API_KEY` in the Acunetix UI if it may have leaked, then update Vercel.
4. Enable 2FA on GitHub and Vercel; limit who can read project env vars.
5. After rotating the dashboard password, update `.dashboard-credentials.txt` locally only.
6. Keep the tunnel agent running if you want remote start/stop.
