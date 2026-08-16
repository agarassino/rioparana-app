# rioparana-app — Paraná Info (rioparana.com.ar)

App + landing del río Paraná: mapa con ~1000 puntos de pesca/navegación, nivel
del agua en tiempo real (10 estaciones de la Prefectura) y guías de pesca.
Disponible en Google Play.

## Stack

- **App**: React Native + Expo (`App.tsx`, `app/`, `src/`)
- **Landing**: HTML estático autocontenido (`landing/index.html`, fuentes embebidas
  data-URI, sin dependencias externas) servida por **nginx** vía `landing/Dockerfile`
- **Backend**: `server/` (Node, scrapeo de nivel del río cada 15 min vía GitHub
  Actions `refresh.yml`), Postgres en Render (`render.yaml`)
- Repo: `github.com/agarassino/rioparana-app` (rama main)

## Landing — capa GEO (2026-08-16)

- JSON-LD: WebSite + MobileApplication + FAQPage (4 Q&A, schema = contenido visible)
- FAQ acordeón visible (`details/summary`) + meta description
- `llms.txt` (entidad + respuestas AEO + índice de guías + emergencia 106)
- `robots.txt` con Content-Signals (`search=yes, ai-train=no`) + bots de training
  bloqueados (GPTBot, ClaudeBot, CCBot, Bytespider, Amazonbot, Applebot-Extended)
- sitemap.xml (4 URLs, lastmod honesto)

## Deploy (Coolify)

- App: `rkg6wbf01f9vxejoogulbt1n` (fqdn rioparana.com.ar)
- Build: Dockerfile en `landing/`, puerto 80
- **El webhook NO auto-deploya**: tras push a main, disparar manual:
  `~/.hermes/scripts/deploy-coolify.sh rkg6wbf01f9vxejoogulbt1n --watch`
- **Pitfall**: archivos nuevos en `landing/` deben tener permisos 644 (nginx 403
  con 600) y agregarse al `COPY` del Dockerfile (copia explícita, no `COPY .`)

## Verificación local

```bash
cd landing && docker build -t rp-test -f Dockerfile . && docker run --rm -p 3219:80 rp-test
# → 200 en /, /llms.txt; 3 bloques ld+json; FAQ visible
```

## Notas

- Guías de pesca: `landing/guias/*.html` (FansFishing, Careca Pesca, La Paz)
- El server API (nivel del río) vive en `api.rioparana.com.ar` (Render)
- Emergencia náutica: 106 (Prefectura) — dato presente en la landing y llms.txt
