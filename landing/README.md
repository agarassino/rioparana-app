# Paraná Info — Landing

Static, self-contained landing page (`index.html`) + the privacy policy
(`privacy-policy.html`). Served by nginx via the `Dockerfile`. Fonts, icon and
screenshots are embedded as data URIs — no external requests.

## Deploy on Coolify (Hetzner)

1. Coolify → the project → **+ New Resource → Application**.
2. Source: this repo (private repo → deploy key), branch `main`.
3. **Build Pack: Dockerfile**, **Base Directory: `/landing`**, **Port: `80`**.
4. Deploy.
5. Add your domain (e.g. `paranainfo.com` / `www.`) → Coolify auto-provisions
   TLS (Let's Encrypt).
   - Point the domain's DNS A record at the server IP `178.105.89.240` first,
     then let Coolify issue the cert.

After it's live at your domain:
- The privacy policy is served at `https://<domain>/privacy-policy.html`.
- Update the privacy-policy URL in Play Console to that address (optional — you
  can keep GitHub Pages, but consolidating on your domain is cleaner).

## Editing

Source generator: `/tmp/.../build_landing.py` (regenerates `index.html` with the
embedded assets). To change copy/colors, edit the generator and re-copy the
output here, or edit `index.html` directly for small text tweaks.
