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

El default branch del repositorio es `gh-pages`, una rama con un solo
`index.html` viejo. Los workflows `on: push` funcionan igual, pero los
`on: schedule` solo corren desde el default branch — por eso el cron de refresco
nunca disparó. Conviene cambiarlo a `main` en algún momento.
