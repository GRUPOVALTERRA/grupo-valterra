# Sprint 9 · CHANGELOG técnico — Grupo Valterra

> Foundations Real · Pasar de mocks a propiedades reales sin tocar producción.

## Tabla resumen

| Categoría | Cantidad |
|---|---|
| Archivos creados | 7 |
| Archivos modificados | 3 |
| Líneas nuevas (created) | 767 |
| Líneas tocadas (modified, neto) | ~30 |
| Migrations SQL | 1 (`0002_create_properties.sql`) |
| Seeds SQL | 1 (`seed-properties.sql`) |
| Nuevas rutas Next | 3 (`/api/properties`, `/api/properties/[slug]`, `/propiedades/[slug]`) |
| Nuevos services | 1 (`properties.ts` hybrid) |
| Breaking changes | 0 |

## Archivos creados (7)

| Archivo | Líneas | Propósito |
|---|---|---|
| `supabase/migrations/0002_create_properties.sql` | 101 | Tabla `properties` con 31 columnas (geo + business + multi-tenant hook) · 4 índices · RLS bloqueado · trigger updated_at reusado |
| `supabase/seed-properties.sql` | 88 | INSERT idempotente de las 6 properties de mock como seed inicial |
| `src/services/properties.ts` | 215 | Service hybrid Supabase + fallback memoria · espejo de `mock-leads.ts` · `rowToProperty()` strict types |
| `src/app/api/properties/route.ts` | 77 | `GET /api/properties` con query params `featured`, `limit`, `city`, `operation_type`, `property_type` · sin overfetch |
| `src/app/api/properties/[slug]/route.ts` | 29 | `GET /api/properties/[slug]` · 404 controlado |
| `src/app/propiedades/[slug]/page.tsx` | 230 | SSR detalle con `generateMetadata` dinámica (title/description/OG/Twitter) · breadcrumb · galería hero · specs · CTA WhatsApp |
| `src/app/propiedades/[slug]/not-found.tsx` | 27 | 404 branded con link a destacadas |

## Archivos modificados (3)

| Archivo | Cambio | Por qué |
|---|---|---|
| `src/services/mock-properties.ts` | +4 props opcionales al type `Property`: `agentName`, `agentPhone`, `lat`, `lng` | Backward-compat 100% · habilita SSR detalle y mapa Sprint 11 |
| `src/app/page.tsx` | Convertido a async server component · `await getFeaturedProperties(6)` · `export const revalidate = 60` · pasa props | Data fetching separado de presentación · ISR estabiliza TTFB |
| `src/components/home/FeaturedProperties.tsx` | Firma cambia: recibe `properties: Property[]` como prop · quitó import de `mock-properties` | Dumb component · JSX intacto |

## Guardrails aplicados

| # | Guardrail | Implementación |
|---|---|---|
| 1 | SEO / marketplace ready | `generateMetadata()` async en `/propiedades/[slug]/page.tsx` genera title `"<title> · <city>"`, description con precio + operación + ubicación, openGraph + twitter con imagen de portada |
| 2 | Performance | Homepage llama `getFeaturedProperties(6)` con límite server-side · API route soporta los 5 query params · `select` lista de columnas explícita |
| 3 | Observability | Logger oficial usado para los 3 eventos: supabase fetch fail (`log.error`), fallback memoria activado (`log.warn`, una vez por proceso), slug no encontrado (`log.info`). Sin `console.log`. |
| 4 | Types strict | Cero `any` en código nuevo · `rowToProperty(row: PropertyRow): Property` strict · cast `as unknown as PropertyRow` solo en boundary Supabase (estándar v2 SDK) |
| 5 | Execution discipline | 7 micro-fases secuenciales · typecheck + lint corridos al final · 0 errors typecheck · 0 errors lint · 3 warnings pre-existentes (no introducidas en Sprint 9) |

## Decisiones arquitectónicas

1. **DB snake_case → mapper → camelCase UI**: `PropertyRow` interface privada en service, `rowToProperty()` proyecta a `Property` (camelCase ya existente). Contrato UI intacto.
2. **Fallback memoria transparente**: cualquier fallo (Supabase no configurado, timeout, error, tabla vacía) cae a `MOCK_PROPERTIES`. UI siempre tiene contenido.
3. **ISR 60s en homepage**: refresh suave al sumar properties, sin sacrificar TTFB.
4. **404 controlado en detalle**: `notFound()` + `not-found.tsx` branded, sin caer al 404 default de Next.
5. **Multi-tenant silencioso**: `agency_id uuid nullable` en DB · sin FK · Sprint 10 lo activa.
6. **Geo preparado**: `lat`, `lng`, `country` ya en DB y en type `Property` (opcional) · Sprint 11 los enciende.

## Deuda Sprint 9 (heredada, no introducida)

| Deuda | Razón | Resuelve en |
|---|---|---|
| `ContactSection.tsx` sigue leyendo `MOCK_PROPERTIES` para el `<select>` | Es client component · refactor a fetch async agrega complejidad sin valor MVP | Sprint 10 |
| Sin admin CRUD properties | No bloquea visualización pública | Sprint 10 |
| Sin upload de imágenes (URLs estáticas Unsplash) | Cobertura MVP suficiente | Sprint 11 |
| RLS sin policy permisiva para `anon` | API GET corre con SERVICE_ROLE | Sprint 10+ si se expone a realtime |

## Pasos producción

Para activar Sprint 9 en Vercel:

```bash
# 1. Aplicar migración (Supabase Studio · SQL editor)
\i supabase/migrations/0002_create_properties.sql

# 2. Aplicar seed (opcional · solo si querés las 6 props iniciales)
\i supabase/seed-properties.sql

# 3. Deploy
git add .
git commit -m "feat(sprint-9): properties reales con hybrid service + SSR detalle"
git push origin main
```

Sin migración aplicada → fallback memoria sirve los 6 mocks. UI idéntica.
Con migración aplicada + seed → DB sirve los 6 properties reales.

## Validation report

| Check | Resultado |
|---|---|
| `tsc --noEmit` | ✓ 0 errors |
| `eslint src --max-warnings=10` | ✓ 0 errors · 3 warnings (`<img>` pre-existentes) |
| `next build` (Vercel runner) | Esperado verde — build local sandbox falla por SWC binary missing (entorno Linux sin SWC instalado, no por código) |
| Breaking risk | LOW · fallback memoria garantiza UI con datos en cualquier escenario |
