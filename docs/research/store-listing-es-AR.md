# Ficha de Play Store — es-AR

Texto listo para pegar en Google Play Console. Reemplaza el listing detectado el 2026-08-08.

Cada afirmación de este texto está verificada contra el código: 10 estaciones en
`server/src/config/stations.ts`, campos de clima en `src/types/index.ts`, y las
pantallas del build 2.0.1.

---

## Título (máx. 30 caracteres)

**Recomendado — 27 caracteres**

```
Paraná Info: altura del río
```

Alternativa sin marca, si se prioriza intención de búsqueda pura — 29 caracteres:

```
Altura y nivel del Río Paraná
```

El título anterior, `Río Paraná App - Info del rio`, gastaba 18 de sus 29 caracteres
en `App - Info del rio`, que no aporta valor de búsqueda y además llevaba `rio` sin tilde.

---

## Descripción corta (máx. 80 caracteres)

**74 caracteres**

```
Altura del río en 10 estaciones, clima y pronóstico para navegar y pescar.
```

---

## Descripción completa (máx. 4000 caracteres)

```
¿A cuánto está el río hoy? Consultá la altura del Paraná en 10 estaciones, desde Corrientes hasta San Lorenzo, con la tendencia de las últimas horas.

Paraná Info reúne en una sola pantalla lo que necesitás antes de salir: nivel del río, clima actual y pronóstico a 7 días.

La app detecta la estación más cercana a tu ubicación y te muestra su altura apenas la abrís.

QUÉ ENCONTRÁS

• Altura del río en 10 estaciones: Corrientes, Barranqueras, Goya, Reconquista, Santa Fe, Paraná, Rosario, San Nicolás, Villa Constitución y San Lorenzo.
• Tendencia del nivel: si el río viene subiendo, bajando o estable.
• Estación más cercana según tu ubicación, sin buscarla a mano.
• Clima actual: temperatura, sensación térmica, viento y humedad.
• Pronóstico a 7 días para planificar la salida.
• Noticias de Prefectura Naval Argentina.
• Acceso directo al 106, el número de emergencias náuticas.

PARA QUIÉNES

Si vivís sobre el río, navegás o pescás, la altura del Paraná te cambia el día. Una bajante deja bancos de arena donde antes pasabas tranquilo; una creciente te cambia las orillas y las condiciones. Saber a cuánto está el río antes de salir es la diferencia entre una jornada tranquila y un problema.

También sirve si seguís la evolución del río por trabajo: actividad portuaria, tareas ribereñas, turismo, o simplemente porque te interesa cómo viene.

DE DÓNDE SALEN LOS DATOS

• Alturas hidrométricas: información pública de Prefectura Naval Argentina.
• Clima y pronóstico: Open-Meteo.

Paraná Info es una aplicación independiente. No pertenece a Prefectura Naval Argentina ni a ningún organismo público, ni está afiliada o respaldada por ellos. Los datos se muestran con fines informativos y pueden tener demoras o interrupciones según la disponibilidad de las fuentes. No reemplazan a la información oficial ni a los canales oficiales de emergencia.
```

---

## Orden de screenshots

Los capturados en `screenshots/aso/raw-16pro/` alcanzan para las 5 pantallas que
recomienda el research. El orden importa: Play muestra las primeras dos en el
resultado de búsqueda, así que ahí va el valor principal, no el splash.

| # | Archivo | Por qué va ahí |
|---|---------|----------------|
| 1 | `01-home-full.png` | Nivel + clima + pronóstico en una sola vista. Es la app entera en una imagen. |
| 2 | `03-station-detail-rosario.png` | El detalle de estación, que es la razón por la que alguien busca la app. |
| 3 | `02-stations.png` | Muestra cobertura: son 10 estaciones, no una. |
| 4 | `05-noticias-emergencia.png` | Noticias y el acceso al 106. |
| 5 | `04-profile.png` | Fuentes de datos y aclaración de independencia. |

`06-splash.png` y `play-ready/01-splash.png` quedan afuera: un splash no comunica
utilidad y ocuparía un lugar en las primeras posiciones.

---

## Qué NO poner

Motivos del rechazo previo por misleading claims:

- Nada que sugiera app oficial de Prefectura o de un organismo público, ni en
  texto ni en los visuales.
- Sin claims promocionales: `#1`, `la mejor`, `gratis`, `sin anuncios`.
- Sin exagerar precisión o autoridad del dato. Las alturas son información
  pública reproducida, con demoras posibles.
- Sin listas de keywords repetidas al final de la descripción.
