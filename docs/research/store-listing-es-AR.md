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

```
🌊 ¿A cuánto está el río hoy? Consultá la altura del Paraná en 38 estaciones,
del Alto Paraná al Delta, con la información pública de Prefectura Naval
Argentina.

Ideal para pescadores, navegantes y amantes del río.

📍 38 ESTACIONES DE PREFECTURA
• Del Alto Paraná al Delta: Posadas, Ituzaingó, Corrientes, Goya, La Paz,
  Santa Fe, Paraná, Diamante, Victoria, Rosario, San Nicolás, Zárate, Tigre
  y 25 más

📊 CÓMO VIENE EL RÍO
• La altura contra los niveles de alerta y evacuación
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

Los datos de altura son información pública de la Prefectura Naval Argentina.
Paraná Info es una aplicación independiente y no está afiliada a ningún
organismo público.

Emergencia náutica: 106
```

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
