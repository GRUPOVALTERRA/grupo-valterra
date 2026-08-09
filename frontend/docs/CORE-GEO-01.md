# CORE-GEO-01 — Geolocation Core (S18 PR1)

Módulo geográfico reutilizable. Vive en `src/lib/geo/` y es **puro**:
sin Supabase, sin Next, sin dominio inmobiliario.

## Archivos

| Archivo | Contenido |
|---|---|
| `geo/types.ts` | `GeoPoint`, `PublicLocationMode`, `PublicLocation`, límites de radio |
| `geo/validate.ts` | Validadores puros; espejan los CHECKs de la migración 0013 |
| `geo/public-location.ts` | `resolvePublicLocation()` (fail-closed) y `googleMapsLink()` |
| `geo/geocoding.ts` | Interfaz `GeocodingProvider` — sin adaptadores en PR1 |
| `e2e/geo-core-unit.spec.ts` | Unitarios puros en el runner Playwright existente (sin browser) |
| `supabase/migrations/0013_geo_core.sql` | Columnas + constraints. **NO aplicada** (gate directivo) |

## Modelo de datos (0013)

- `lat` / `lng` (existentes desde 0002, `numeric(10,7)`): ubicación
  **interna** exacta. Solo admin/service_role. *Desviación documentada:*
  se adoptan en lugar de crear `latitude/longitude` duplicadas; el
  rename rompería el código hoy desplegado (hazard 0009).
- `public_location_mode`: `exact | approximate | hidden` (default
  `approximate`).
- `public_latitude` / `public_longitude` (`numeric(9,6)`): centro
  **deliberadamente** publicable. Nunca derivado de la interna.
- `public_radius_m` (default 300, CHECK 50–5000): radio del círculo.

## Reglas de privacidad (Valterra)

1. Ninguna query pública selecciona `lat`/`lng`. El leak histórico en
   `COLUMNS_BASE` + mapper se eliminó en este PR; las guardas de
   `e2e/geo-core-unit.spec.ts` impiden la regresión.
2. `resolvePublicLocation()` solo acepta campos `public_*` — la
   ubicación interna no tiene parámetro de entrada (imposible por
   tipos). Fail-closed: modo inválido o centro ausente ⇒ `hidden`.
3. Prohibido el offset "aproximado" derivado de `property_id` u otro
   dato de la fila: es reversible. El centro aproximado se carga a
   propósito (admin, S18-PR2).
4. Viviendas ocupadas ⇒ `approximate` (círculo). Terrenos/locales
   pueden usar `exact` deliberado.

## Geocoding

`GeocodingProvider` desacopla el dominio del proveedor. Nominatim/OSM
será *un* adaptador (PR4, solo si demuestra valor). Antes de
implementarlo: verificar política de uso vigente, rate limit,
User-Agent identificable, atribución. Sin geocodificación masiva, sin
scraping.

## Reutilización

Consumidores futuros: **Grupo Valterra** (propiedades, demanda) y
**Pati Feliz** (mascotas perdidas/encontradas, refugios, veterinarias,
áreas aproximadas). Se comparten tipos, validación y contrato de
geocoding. **Las políticas de privacidad NO se comparten**: cada
producto define sus modos/radios/reglas.

## VRE — DemandGeoProfile (solo diseño, NO implementar)

Pertenece al diseño del Revenue Engine y por decisión directiva **no se
declara en código** hasta que arranque VRE. Contrato conceptual: tipo +
operación + zona/radio (`GeoPoint` + radio) + presupuesto + dormitorios
+ timeframe ⇒ detección futura de demanda sin inventario y captación
dirigida de inventario en la zona requerida.

## División S18

- **PR1 (este):** fundación de datos + tipos + tests. Sin UI.
- **PR2:** editor admin (pin en mapa + inputs manuales).
- **PR3:** mapa público Leaflet/OSM (`PublicLocation` como único input).
- **PR4:** geocoding asistido, solo si demuestra valor.
