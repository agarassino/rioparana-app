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

## Directorio de localidades

Las páginas bajo `/rio/`, los índices por tipo de servicio y el `sitemap.xml` se
generan. No se editan a mano.

```bash
node scripts/build-directory.mjs
```

Fuente de verdad: `data/localidades.json` y `data/servicios.json`. Para agregar
un lodge o una escuela, se agrega una línea a `servicios.json` —y la localidad a
`localidades.json` si todavía no está— y se corre el generador.

Reglas que aplica el script:

- Una localidad genera página solo si tiene estación hidrométrica o al menos un
  servicio. Nunca por existir: las páginas vacías perjudican al sitio entero.
- Una localidad sin hidrómetro toma la lectura de la estación más cercana, y la
  página dice cuál es y a qué distancia. Nunca se presenta como propia.
- El `intro` se arma con datos reales y distintos por localidad. Si se escribe
  un `intro` a mano en `localidades.json`, ese tiene precedencia y conviene:
  las páginas escritas a mano rankean mejor.
- Los servicios se enlazan a su contacto público. No se copian descripciones,
  teléfonos ni fotos. Cada ficha guarda su `fuente` para poder auditarla.

Las alturas de alerta y evacuación viven en `localidades.json` porque son
valores de referencia estables, y así quedan en el HTML para los buscadores. La
altura del día la pinta el navegador contra `/public/river`.

### Comprobar los enlaces

```bash
./scripts/check-links.sh
```

Recorre `data/servicios.json` y verifica que cada contacto responda. Prueba cada
URL con user-agent de navegador y sin él, porque varios sitios devuelven 403 o
406 a un agente que no reconocen y 200 a un navegador: eso es un firewall, no un
sitio caído.

Conviene correrlo antes de regenerar. Ante un enlace caído, reintentar más tarde
antes de dar de baja la ficha: una caída puede ser pasajera.
