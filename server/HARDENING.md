# VPS Hardening (Hetzner + Coolify)

Baseline security for the Ubuntu 24.04 box that runs Coolify. Do this **before**
exposing anything. Order matters — follow it top to bottom.

> Golden rule: never close your working SSH session until you've confirmed, in a
> **second** terminal, that you can still get in. Every lockdown step below is
> reversible only while you still have a way in.

## 1. Run the baseline script (`harden.sh`)

On the fresh server, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/agarassino/rioparana-app/main/server/harden.sh -o harden.sh
bash harden.sh deploy
```

It creates a `deploy` sudo user with your SSH key, disables SSH password login,
disables root password login, enables `ufw` (default-deny inbound; allows 22, 80,
443, and the Tailscale interface), installs `fail2ban`, and turns on automatic
security updates.

**Verify before continuing** — in a new terminal:
```bash
ssh deploy@178.105.89.240
ssh root@178.105.89.240   # key-based; password login should now be refused
```

## 2. Tailscale — make SSH invisible to the internet

This is the single biggest win: SSH stops being reachable from the public
internet at all.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
Authenticate in the browser link it prints. Note the server's Tailscale IP
(`tailscale ip -4`, e.g. `100.x.y.z`). From now on you SSH via that IP:
`ssh deploy@100.x.y.z`.

Then **close public SSH**:
```bash
sudo ufw delete allow OpenSSH
```
SSH (port 22) is now only reachable over Tailscale. `ufw allow in on tailscale0`
(set by the script) keeps SSH — and the Coolify UI on :8000 — reachable over the
mesh.

## 3. Coolify dashboard — private only

Never expose the Coolify UI (port 8000) to the public. The firewall already does
NOT open 8000 publicly. Reach it over Tailscale:
```
http://100.x.y.z:8000
```
(Do the initial Coolify admin setup through this Tailscale URL, not the public IP.)

## 4. Cloudflare in front of the public sites

Put every public site/domain (the SEO sites and the rioparana API domain) behind
Cloudflare with the orange-cloud (proxied) DNS records. Benefits: hides the origin
IP, WAF, DDoS protection, CDN for the static/SEO sites (kills the EU→AR latency).

Two ways to lock the origin so only Cloudflare can reach it:

- **Simple:** allow inbound 80/443 only from Cloudflare's published IP ranges
  (see step 5). Caveat: Coolify's Let's Encrypt HTTP-01 challenge validates from
  Let's Encrypt's own IPs, not Cloudflare's — so with a Cloudflare-only 80/443
  lockdown, use **Cloudflare "Full (strict)" TLS with a Cloudflare Origin
  Certificate** on the origin (not Coolify's Let's Encrypt), or switch Coolify to
  a **DNS-01** challenge.
- **Strictest (recommended long-term): Cloudflare Tunnel (`cloudflared`).** The
  server makes an *outbound* connection to Cloudflare, so you open **no inbound
  ports at all** (not even 443). Nothing to portscan. More setup, best posture.

## 5. Hetzner Cloud Firewall (edge — set in the Hetzner console)

A second layer at the network edge, before traffic reaches the VM (free). Under
your server → Firewalls, create rules:

| Direction | Port | Source | Purpose |
|-----------|------|--------|---------|
| Inbound | (none for SSH) | — | SSH goes over Tailscale; do NOT open 22 publicly |
| Inbound | 80/tcp, 443/tcp | Cloudflare IPv4 + IPv6 ranges | web, Cloudflare-only |
| Outbound | all | any | app needs to reach news/weather sources, Tailscale, etc. |

Tailscale needs no inbound rule (it does NAT traversal over outbound UDP). If you
adopt Cloudflare Tunnel, you can drop the 80/443 inbound rules entirely.

Cloudflare's current IP ranges: https://www.cloudflare.com/ips/ (they change —
don't hardcode a stale list; some people automate this with a cron that syncs the
list into the firewall).

## 6. Databases — never public

Coolify keeps managed Postgres on the internal Docker network by default — keep it
that way. **Never** map a database/Redis port to the host's public interface.
(This is exactly how people get a Redis cryptominer within minutes of exposing
6379.) If you need remote DB access, tunnel it over Tailscale.

## 7. Backups

- Coolify → scheduled Postgres backups → Hetzner Storage Box or an S3 bucket.
- Enable Hetzner's server snapshots/backups in the console.
- Test a restore once. An untested backup is not a backup.

## Summary of the end state
- SSH: key-only, over Tailscale, no public port 22.
- Coolify UI: Tailscale-only.
- Public web: 80/443 via Cloudflare only (or Cloudflare Tunnel — no open ports).
- Databases: internal network only.
- Auto security updates + fail2ban + edge firewall on.
