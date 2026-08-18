# Directorio de localidades del Paraná — diseño

Fecha: 2026-08-18

## Problema

La landing no tiene contenido propio indexable. Es una página de marketing con
un mapa y tres guías de pesca. Google no tiene motivo para mandarle tráfico, y
la app no tiene usuarios: hace falta romper ese círculo desde afuera.

## Qué construimos

Un directorio de servicios sobre el Paraná —guías de pesca, lodges, escuelas de
kayak, paddle surf y navegación— organizado **por localidad**, generado a partir
de archivos de datos versionados.

## Decisiones y por qué

### Unidad de página: la localidad

Descartadas: página por tipo de servicio (poco long tail, competencia frontal) y
página por tipo × localidad (~190 páginas, la mayoría vacías, que es el patrón
que Google penaliza como *scaled content abuse*).

Una localidad genera página **solo si tiene al menos un servicio o una estación
hidrométrica**. Nunca por existir.

### El diferencial es el río, no el directorio

Un directorio de servicios es copiable. La altura del río en 38 estaciones con
su nivel de alerta, no. Cada página de localidad muestra el río primero: es lo
que justifica que la página exista aunque tenga un solo listado.

Las localidades sin hidrómetro muestran la estación más cercana, con el nombre y
la distancia dichos explícitamente. Nunca se presenta un dato de otra estación
como si fuera local.

### Intro generado de datos reales

El intro se arma con hechos verificables y distintos en cada localidad: posición
en el río, niveles de alerta y evacuación, distancia a la estación, servicios
listados. No es prosa spineada: es descripción a partir de datos, y se actualiza
sola.

El campo `intro` manual queda **opcional** y tiene precedencia cuando está. Las
páginas escritas a mano van a rankear mejor; no bloquean el lanzamiento.

Esto es una apuesta razonable, no una garantía. Un directorio automático con
datos reales y frescos está por encima de lo que Google castiga y por debajo de
lo que premia.

### Linkear, no republicar

Cada ficha lleva nombre, tipo, localidad y **un link al contacto público**. No se
copian descripciones, teléfonos ni fotos al dominio propio. Cada ficha guarda su
`fuente` para poder auditarla y darla de baja.

### Generador estático propio

Descartadas: un generador de sitios completo (mete Node y un pipeline donde hoy
hay un Dockerfile que sirve archivos) y renderizado dinámico desde el backend
(mezcla SEO con la disponibilidad de la API).

Un script sin dependencias lee los datos y escribe HTML, sitemap y JSON-LD. El
sitio sigue siendo archivos estáticos. El río lo pinta el cliente contra
`/public/river`, así que está fresco sin regenerar.

## Modelo de datos

`landing/data/localidades.json`:
`slug`, `nombre`, `provincia`, `lat`, `lon`, `estacion?`, `intro?`

`landing/data/servicios.json`:
`id`, `nombre`, `tipo`, `localidad`, `contacto`, `fuente`

`tipo` ∈ `guia-pesca` | `lodge` | `escuela-kayak` | `escuela-paddle` | `escuela-navegacion`

## Anatomía de la página

1. El río: altura, tendencia, margen hasta alerta. Origen del dato explícito.
2. Intro generado.
3. Servicios agrupados por tipo. Las secciones sin servicios no se emiten.
4. Navegación: localidades río arriba y río abajo, e índices por tipo.
5. JSON-LD: `Place`, `BreadcrumbList`, y `LocalBusiness` por servicio.

No se generan FAQ automáticas. Las FAQ existentes de las guías están escritas a
mano y así se quedan.

## Fuera de alcance

- Alta de negocios por formulario (requiere backend y moderación).
- Fotos propias.
- Páginas de tipo × localidad.
