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

> **La corrección del rechazo de septiembre 2026 está en los dos bloques de
> abajo.** El descargo va arriba de todo, no al final, y cada fuente lleva su
> URL. Google rechazó la versión anterior por "Falta el enlace a la fuente de
> información gubernamental": tenía el descargo pero ninguna URL.

```
Paraná Info es una aplicación independiente. NO representa, ni está afiliada
ni autorizada por la Prefectura Naval Argentina ni por ningún otro organismo
público.

📋 FUENTES OFICIALES DE LOS DATOS
• Altura del río — Prefectura Naval Argentina:
  https://contenidosweb.prefecturanaval.gob.ar/alturas
• Noticias — Portal oficial del Gobierno de Argentina:
  https://www.argentina.gob.ar/prefecturanaval/noticias-pna
• Clima — Open-Meteo:
  https://open-meteo.com

Toda la información de altura del río es información pública publicada por la
Prefectura Naval Argentina, que la actualiza dos veces por día. Esta
aplicación la muestra sin modificarla. Las mismas fuentes están enlazadas
dentro de la app, en la sección Perfil.

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

### Si hay ficha en inglés

El rechazo citó la descripción **en inglés**. Si existe una ficha en-US cargada
a mano, necesita la misma corrección: el descargo arriba y las URLs. Una
traducción automática de Google hereda el texto corregido; una ficha cargada a
mano, no.

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
