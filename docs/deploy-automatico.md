# Deploy automático en cada push a `main`

## Por qué no es un webhook

Coolify vive en `100.89.213.31:8000`, una dirección de Tailscale. GitHub no
puede alcanzarla, así que el webhook que usaría cualquier proyecto no sirve acá.

En vez de exponer el panel a internet —controla 26 aplicaciones y sería
regalar superficie de ataque— el runner de GitHub se suma a la tailnet y llama a
la API de deploy desde adentro.

## Qué despliega

El workflow mira qué archivos cambió el push:

| Cambios en | Despliega |
|---|---|
| `server/**` | backend (api.rioparana.com.ar) |
| `landing/**` | landing (rioparana.com.ar) |
| ambos | los dos |
| ningún otro | nada |

Un cambio en `src/` —la app móvil— no despliega nada, porque no corre en el
servidor. Tampoco lo hace un cambio en `docs/`.

También se puede correr a mano desde la pestaña Actions, eligiendo qué desplegar.

## Configuración, una sola vez

### 1. OAuth client en Tailscale

En la [consola de Tailscale](https://login.tailscale.com/admin/settings/oauth),
crear un OAuth client con scope **`auth_keys`** de escritura y el tag `tag:ci`.

Antes hay que declarar el tag en las ACL, o el client no se puede crear:

```json
"tagOwners": {
  "tag:ci": ["autogroup:admin"]
}
```

Y darle permiso al tag para llegar a Coolify:

```json
"acls": [
  {
    "action": "accept",
    "src":    ["tag:ci"],
    "dst":    ["100.89.213.31:8000"]
  }
]
```

Sin esa regla el runner entra a la tailnet pero no llega al panel, y el deploy
falla con timeout en vez de con un error claro.

### 2. Token de Coolify

En el panel, un token con scope **Root**. Uno de solo lectura no alcanza: la API
rechaza el deploy con "Missing required permissions".

### 3. Secrets en GitHub

En Settings → Secrets and variables → Actions:

| Secret | De dónde sale |
|---|---|
| `TS_OAUTH_CLIENT_ID` | el OAuth client de Tailscale |
| `TS_OAUTH_SECRET` | el OAuth client de Tailscale |
| `COOLIFY_TOKEN` | el token Root de Coolify |

```bash
gh secret set TS_OAUTH_CLIENT_ID
gh secret set TS_OAUTH_SECRET
gh secret set COOLIFY_TOKEN
```

## Verificar

```bash
gh workflow run deploy.yml -f target=landing
gh run watch
```

## Los UUID de las aplicaciones

Están escritos en el workflow. Si alguna vez se recrean las apps, hay que
actualizarlos:

| App | UUID |
|---|---|
| backend | `t7uqevsj5bex092bqtxqdx86` |
| landing | `rkg6wbf01f9vxejoogulbt1n` |

## Lo que esto no arregla

El default branch del repositorio fue `gh-pages` durante mucho tiempo —una
rama con un solo `index.html` de febrero de 2026, resto de cuando Pages se
servía desde ahí—. Los workflows `on: push` funcionan igual, pero los
`on: schedule` **solo se evalúan desde el default branch**, así que cualquier
cron alojado en `main` nunca disparaba.

Esto no es hipotético, ya costó un workflow: `server/README.md` todavía linkea
a `.github/workflows/refresh.yml`, un cron que el equipo borró porque nunca
corrió por esta misma razón, y ese refresco terminó mudándose a un scheduler
adentro del proceso Node del backend (`server/src/scheduler.ts`).

**Resuelto el 2026-09-18**: el default branch pasó a `main`
(`gh repo edit --default-branch main`), que es donde vive todo el desarrollo y
sobre lo que ya disparaba `deploy.yml`. GitHub Pages no se vio afectado porque
su fuente es `main` con path `/docs`, no la rama `gh-pages` —que quedó sin uso—.
Si alguien vuelve a mover el default branch, `refresh-river.yml` deja de
dispararse solo y no avisa.

## Refresco diario de la altura del río

`landing/rio/<localidad>/index.html` son 39 páginas estáticas con la altura
del río horneada en el HTML por `landing/scripts/build-directory.mjs`. Ese
build lee `https://api.rioparana.com.ar/public/river`, la API propia — y esa
API depende de que alguien corra `scripts/push-river.sh` a mano desde una IP
argentina (Prefectura solo contesta a IPs residenciales del país). Si nadie
lo corre, el número horneado se va quedando viejo sin que nada lo note.

`scripts/refresh-river-landing.mjs` no depende de esa cadena: lee directo del
INA (`alerta.ina.gob.ar`, sin restricción de IP) usando el mapeo de
`scripts/ina-estaciones.json`, y parchea in-place solo lo que cambia día a
día — número, barra, margen, fuente+fecha y meta description — reusando
`landing/scripts/gauge.mjs` para que el estado (`data-state`) y el texto de
margen sean exactamente los que el sitio ya calcula en el navegador y en el
build. No toca nombres, umbrales, servicios ni la navegación entre localidades:
eso sigue siendo trabajo de `build-directory.mjs`.

El workflow [`refresh-river.yml`](../.github/workflows/refresh-river.yml) lo
corre una vez por día (11:00 UTC = 08:00 ART) y, si hubo cambios, commitea y
pushea a `main`.

### Por qué el push no dispara `deploy.yml` solo

Un push hecho con el `GITHUB_TOKEN` por defecto no dispara otros workflows
`on: push` — es la protección de GitHub contra loops infinitos de Actions
(un workflow no puede encadenar otro con su propio token). Sin nada más,
`refresh-river.yml` pushearía a `main` y `deploy.yml` se quedaría sin correr.

La solución que se usó **no** es un Personal Access Token nuevo como secret
—es un secret más para rotar y es la primera cosa que se olvida cuando se
va alguien del equipo—, sino disparar `deploy.yml` explícitamente por
`workflow_dispatch` (`gh workflow run deploy.yml -f target=landing`) con el
mismo `GITHUB_TOKEN`: una llamada a la API de Actions no es un evento push,
así que la protección anti-loop no aplica. `deploy.yml` ya soporta
`workflow_dispatch` con `target=landing` desde antes de esto, así que no hizo
falta tocarlo.

Esto requiere el permiso `actions: write` en el `GITHUB_TOKEN` del workflow
(además de `contents: write` para el commit y push), declarado en su
`permissions:`.

### Verificar

```bash
node scripts/refresh-river-landing.mjs --dry-run   # sin escribir nada
node scripts/refresh-river-landing.mjs --only=rosario
gh workflow run refresh-river.yml
gh run watch
```


## Dónde vive realmente el cron de refresco

`refresh-river.yml` quedó como disparador manual. El cron diario lo corre
**launchd desde la Mac**, no GitHub:

- `~/Library/LaunchAgents/com.syloper.cartera-refresh.plist` (09:30 y 16:00)
- → `~/workspace/seo-geo-mkt/scripts/refresh-cartera-diario.sh`
- Log: `~/Library/Logs/cartera-refresh.log`

El motivo es el mismo que explica todo este archivo, llevado hasta el final: el
runner de GitHub no llega a Coolify sin un OAuth client de Tailscale, y esos
secrets no están cargados. Un cron en Actions commitearía datos frescos que
producción nunca vería — el repo diría una cosa y el sitio otra. Esta máquina ya
está en la tailnet, así que pushea y deploya en el mismo paso, que es como
funcionaba el harness anterior.

Hay un segundo motivo, específico de este repo: Prefectura Naval solo responde a
IPs residenciales argentinas (ver `scripts/push-river.sh`), así que parte del
pipeline de datos no puede correr en un runner de GitHub ni aunque se resuelva
lo de Tailscale.

Precedente: `com.syloper.rioparana.push` ya usa este mismo mecanismo desde hace
tiempo (4 corridas por día, log en `~/Library/Logs/rioparana-push.log`) para
alimentar la cache de la app. El refresco de la landing sigue esa convención.
