# Ficha de Play Store — es-AR

Fuente única para el texto y los gráficos de la ficha.

Cada afirmación está verificada contra el código: 10 estaciones en
`server/src/config/stations.ts`, campos de clima en `src/types/index.ts`, y las
pantallas del build 2.0.2 (versionCode 8).

---

## Corrección bloqueante: "en tiempo real"

El texto cargado en Console el 2026-08-14 dice, en la descripción completa:

> Consultá el nivel del río Paraná **en tiempo real** desde las estaciones de
> Prefectura Naval Argentina.

**Esa frase hay que sacarla antes de enviar a revisión.** Medido ese mismo día
contra la API de producción: Rosario y Paraná tenían timestamp del 31 de julio,
y Barranqueras estaba vacía (`no data yet`). La captura `02-tendencia.png`
muestra en pantalla "Actualizado: 31 de julio".

Prometer tiempo real con un screenshot que exhibe un dato de dos semanas atrás
es exactamente el patrón que motivó el rechazo por misleading claims. Reemplazo:

```
Consultá la altura del río Paraná en 10 estaciones, con la información pública de Prefectura Naval Argentina.
```

Se puede volver a "tiempo real" cuando el caché del río se mantenga fresco, que
depende de resolver el crowd-push sin usuarios.

---

## Título (máx. 30 caracteres)

Cargado en Console — 25 caracteres, correcto, no es necesario tocarlo:

```
Río Paraná: nivel y clima
```

Refinamiento opcional — 26 caracteres. `altura del río paraná` tiene más volumen
de búsqueda que `nivel`, pero la ganancia es marginal:

```
Río Paraná: altura y clima
```

El título original, `Río Paraná App - Info del rio`, gastaba 18 de sus 29
caracteres en `App - Info del rio`, que no aporta valor de búsqueda y además
llevaba `rio` sin tilde.

---

## Descripción corta (máx. 80 caracteres)

El texto cargado dice `...clima y pronóstico por estación para pesca y
navegación`. **`por estación` se lee como estación del año**, sobre todo pegado a
`pronóstico`. La intención era estación de monitoreo.

**Reemplazo — 72 caracteres**

```
Altura del río Paraná en 10 estaciones, con clima y pronóstico a 7 días.
```

El número concreto además es verificable y da confianza; `por estación` no
comunica nada.

---

## Descripción completa (máx. 4000 caracteres)

El texto de abajo es el recomendado completo. Si se conserva el que ya está
cargado, las correcciones mínimas son tres:

1. Sacar `en tiempo real` (ver arriba).
2. Reemplazar la apertura `🌊 RÍO PARANÁ - Tu app para el río` por la pregunta
   que el usuario ya tiene en la cabeza: Google pondera las primeras líneas y
   son las únicas visibles sin desplegar "Más".
3. Verificar que el descargo de independencia esté presente. Es obligatorio para
   apps que comunican información gubernamental y es el antecedente directo del
   rechazo anterior.


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

Los assets listos para subir están en `screenshots/aso/play-ready/`, generados
por `screenshots/aso/build-play-assets.sh`. Subilos en este orden: Play muestra
las primeras dos en el resultado de búsqueda, así que ahí va el valor principal.

| # | Archivo | Por qué va ahí |
|---|---------|----------------|
| 1 | `01-nivel-y-clima.png` | Nivel + clima + pronóstico en una sola vista. Es la app entera en una imagen. |
| 2 | `02-tendencia.png` | El detalle de estación, que es la razón por la que alguien busca la app. |
| 3 | `03-estaciones.png` | Muestra cobertura: son 10 estaciones, no una. |
| 4 | `04-noticias-106.png` | Noticias y el acceso al 106. |
| 5 | `05-fuentes.png` | Fuentes de datos y aclaración de independencia. |

Más `feature-graphic.png` (1024x500), que Play pide para la ficha.

El splash queda afuera: no comunica utilidad y ocuparía una de las primeras
posiciones.

### Por qué no se suben las capturas crudas

Play exige que el lado más largo no supere el doble del más corto. Las capturas
del simulador son 1206x2622, o sea ratio 2.17, y las viejas de Android 1080x2400,
ratio 2.22. **Ninguna de las dos se puede subir.** El script las compone sobre un
lienzo de 1080x1920 (ratio 1.77), que además cumple el mínimo que Play pide para
ser elegible en ubicaciones destacadas.

### Pendiente en las imágenes

`02-tendencia.png` muestra `Actualizado: 31 de julio` porque el caché del río
sigue desactualizado para Rosario. Conviene regenerarla cuando el dato esté
fresco: una ficha con una fecha vieja a la vista sugiere app abandonada.

---

## Qué NO poner

Motivos del rechazo previo por misleading claims:

- Nada que sugiera app oficial de Prefectura o de un organismo público, ni en
  texto ni en los visuales.
- Sin claims promocionales: `#1`, `la mejor`, `gratis`, `sin anuncios`.
- Sin exagerar precisión o autoridad del dato. Las alturas son información
  pública reproducida, con demoras posibles.
- Sin listas de keywords repetidas al final de la descripción.
