# Named Cloudflare Tunnel + Access (recommended)

Quick `trycloudflare.com` URLs are public and change when the process restarts.
Use a named tunnel and Cloudflare Access so only your dashboard (or you) can reach Acunetix.

## 1. Login once on this PC

```bash
cloudflared tunnel login
```

## 2. Create a named tunnel

```bash
cloudflared tunnel create daybreak-acunetix
cloudflared tunnel route dns daybreak-acunetix ax.yourdomain.com
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/YOU/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: ax.yourdomain.com
    service: https://127.0.0.1:3443
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

Run:

```bash
cloudflared tunnel run daybreak-acunetix
```

## 3. Cloudflare Access (service token for Vercel)

1. Zero Trust → Access → Applications → Self-hosted for `ax.yourdomain.com`
2. Create a Service Auth token
3. In Vercel set:
   - `ACUNETIX_BASE_URL=https://ax.yourdomain.com`
   - `ACUNETIX_ALLOWED_HOSTS=ax.yourdomain.com`
   - `CF_ACCESS_CLIENT_ID=...`
   - `CF_ACCESS_CLIENT_SECRET=...`

The dashboard already sends `CF-Access-Client-Id` / `CF-Access-Client-Secret` when those env vars exist.
