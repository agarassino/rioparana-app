# Ficha de Play Store — es-AR

Fuente única para el texto y los gráficos de la ficha.

Cada afirmación está verificada contra lo que realmente shipea. Los números de
esta versión se comprobaron el 2026-09-15 contra `GET /public/river`
(38 estaciones), `landing/parana-map.geojson` (997 puntos) y el build 2.1.0
(versionCode 13).

**Regla de la casa**: ningún número entra acá de memoria. Se verifica contra el
artefacto antes de escribirlo. La ficha ya fue rechazada una vez por una
afirmación que el código no sostenía.

---

## Historial de correcciones

### "en tiempo real" — corregido
Decía "Consultá el nivel del río Paraná **en tiempo real**". El nivel viene de
un caché que se refresca cuando Prefectura publica, dos veces por día. Sacado
de la ficha en septiembre 2026.

### "Condiciones actuales de pesca" — corregido
La ficha lo prometía bajo 🎣 PARA PESCADORES. `FEATURES.FISHING_ENABLED` está
en `false`, así que la pestaña, el badge y el consejo de pesca **no aparecen**.
Prometer una función detrás de un flag apagado es el mismo tipo de error que
causó el rechazo anterior. Sacado en septiembre 2026.

> Si algún día se enciende `FISHING_ENABLED`, este bullet puede volver.

### Rechazo: falta el enlace a la fuente gubernamental — corregido
Google rechazó la 2.1.0 (16 de septiembre de 2026) por la política de
afirmaciones engañosas: *"Tu aplicación proporciona información gubernamental,
pero no incluye una o varias URLs o enlaces claros y accesibles a las fuentes
originales"*.

La descripción tenía el descargo pero **ninguna URL**. La app sí las tenía, en
Perfil → Fuentes de datos, pero la política exige que estén también en la
descripción.

Corregido poniendo el descargo en el primer párrafo y las tres URLs en un
bloque propio, antes de cualquier texto de venta.

> Lección: una app que muestra datos de un organismo público necesita la fuente
> enlazada **en la ficha**, no solo dentro de la app.

### Segundo rechazo: enlace de fuente roto o inaccesible — corregido
Play volvió a rechazar el 17 de septiembre de 2026, ahora por *"The provided
URL/link for the source of government information is not working or is
inaccessible"*.

La URL de alturas estaba **sin barra final**, y así el host responde **301**.
Un verificador que no sigue redirecciones lo lee como roto.

Además, el host de alturas no siempre es alcanzable desde un centro de datos
— es exactamente la razón por la que el backend no puede scrapearlo y existe
el crowd-push. Los revisores de Google chequean desde infraestructura de
Google.

Corregido con la barra final, con el portal nacional como primera fuente (que
sí responde desde cualquier lado), y con cada URL sola en su renglón.

> Hipótesis descartadas antes de escribir el fix: el certificado TLS verifica
> bien en ambos hosts, y la página carga desde fuera de Argentina. Conviene
> medir antes de creerse la explicación cómoda.

### "+10 estaciones" — corregido
Quedó de cuando el config tenía 10. Desde `37e4027` son 38, y las estadísticas
de uso muestran que **16 de las 26 estaciones más consultadas no existían** en
aquella versión. Subestimarlo dejaba valor sin contar.

---

## Título y subtítulo

```
Paraná Info — Altura del río
```

```
Altura del río Paraná en 38 estaciones, con clima y pronóstico a 7 días.
```

## Descripción

> **Segundo rechazo, 17 de septiembre de 2026: "Broken or Inaccessible Source
> Link".** Tres cosas cambiaron respecto de la versión que rechazaron, y cada
> una atiende una causa posible, porque desde afuera no se puede saber cuál fue:
>
> 1. **El portal nacional va primero.** `www.argentina.gob.ar/prefecturanaval`
>    responde desde cualquier lado y enlaza él mismo a la página de alturas.
>    Verificado desde infraestructura fuera de Argentina.
> 2. **Barra final en la URL de alturas.** Sin ella el host devuelve **301**, y
>    un verificador que no sigue redirecciones lo lee como roto. La ficha
>    rechazada tenía la versión sin barra.
> 3. **Cada URL sola en su renglón**, sin viñeta ni guión delante, para que
>    cualquier parser la tome entera.
>
> Lo que **no** era: el certificado TLS verifica correctamente en ambos hosts, y
> la página carga desde fuera de Argentina. Las dos hipótesis se probaron y se
> descartaron antes de escribir esto.

```
Paraná Info es una aplicación independiente. NO representa, ni está afiliada
ni autorizada por la Prefectura Naval Argentina ni por ningún otro organismo
público. No facilita trámites ni servicios gubernamentales.

FUENTES OFICIALES DE LA INFORMACIÓN

Portal oficial de la Prefectura Naval Argentina:
https://www.argentina.gob.ar/prefecturanaval

Altura de los ríos (publicada por la Prefectura Naval Argentina):
https://contenidosweb.prefecturanaval.gob.ar/alturas/

Noticias oficiales (Portal del Gobierno de Argentina):
https://www.argentina.gob.ar/prefecturanaval/noticias-pna

Clima (Open-Meteo, servicio meteorológico abierto):
https://open-meteo.com

Toda la información de altura del río es información pública publicada por la
Prefectura Naval Argentina, que la actualiza dos veces por día. Esta
aplicación la muestra sin modificarla ni interpretarla. Las mismas fuentes
están enlazadas dentro de la app, en Perfil → Fuentes de datos.

—

🌊 ¿A cuánto está el río hoy? Consultá la altura del Paraná en 38 estaciones,
del Alto Paraná al Delta.

Ideal para pescadores, navegantes y amantes del río.

📍 38 ESTACIONES
• Posadas, Ituzaingó, Corrientes, Goya, La Paz, Santa Fe, Paraná, Diamante,
  Victoria, Rosario, San Nicolás, Zárate, Tigre y 25 más

📊 CÓMO VIENE EL RÍO
• La altura contra los niveles de alerta y evacuación que publica Prefectura
• Los últimos 7 días
• Cuánto subió o bajó desde ayer

🔔 NOTIFICACIONES
• Cada mañana, la altura en la estación que más consultás
• Todas las anteriores quedan guardadas en la app

📤 COMPARTIR
• Mandá la altura por WhatsApp, con el dato ya escrito

🌤️ CLIMA
• Temperatura actual, viento y humedad
• Pronóstico de 7 días

🗺️ MAPA
• Casi 1.000 puntos de pesca y navegación

Emergencia náutica: 106 (Prefectura Naval Argentina)
```

### Antes de volver a enviar, probá los enlaces

```bash
for u in \
  "https://www.argentina.gob.ar/prefecturanaval" \
  "https://contenidosweb.prefecturanaval.gob.ar/alturas/" \
  "https://www.argentina.gob.ar/prefecturanaval/noticias-pna" \
  "https://open-meteo.com"; do
  printf "%-62s %s\n" "$u" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -A 'Mozilla/5.0' "$u")"
done
```

Cualquier cosa que no sea **200** vuelve a hacer que rechacen la ficha. Un 301
cuenta como roto.

### Si hay ficha en inglés

El primer rechazo citó la descripción en inglés. Una ficha en-US cargada a mano
necesita la misma corrección; una traducción automática hereda el texto.

## Novedades — 2.1.0 (versionCode 13)

```
Recibí cada mañana la altura del río en la estación que más consultás, y
revisá las anteriores desde la campana en el inicio.

Ahora también ves la altura en una barra contra los niveles de alerta y
evacuación, cómo viene la última semana, y podés compartir el dato por
WhatsApp.
```

---

## Seguridad de los datos

Lo que declara el formulario, y por qué:

| Dato | Se recolecta | Motivo |
|---|---|---|
| Identificador de dispositivo | Sí | Contar dispositivos y qué estaciones se consultan |
| Token de push | Sí | Entregar la notificación diaria |
| Ubicación | No se almacena | Se usa en el teléfono para la estación más cercana |

Ninguno se comparte con terceros. Expo aparece solo como transporte de entrega
de la notificación, no como destinatario de datos.

La casilla "Otro" en la sección de creación de cuenta queda **sin marcar**: la
app no tiene cuentas.

---

## Antes de tocar la ficha

Editar la descripción reinicia la revisión. Si hay un binario en revisión y
lleva varios días, conviene esperar. Si se subió el mismo día, el costo es
bajo y no vale la pena demorar una corrección.
