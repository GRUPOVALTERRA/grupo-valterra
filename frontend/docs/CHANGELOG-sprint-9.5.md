# Sprint 9.5 · Production Hardening · CHANGELOG técnico

> Pre-Sprint 10 hardening: OG image real + security headers + Sentry + Resend email + naming consolidado.

## Tabla resumen A+B

| Categoría | Cantidad |
|---|---|
| Archivos creados | 7 |
| Archivos modificados | 7 |
| Líneas nuevas (created) | ~349 (excluyendo binario OG) |
| Líneas tocadas (modified, neto) | ~80 |
| Nuevas migrations | 1 (`0003_rename_leads_agency_id.sql`) |
| Nuevos npm deps | 2 (`@sentry/nextjs ^9.0.0`, `resend ^4.0.0`) |
| Nuevas env vars | 4 (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `RESEND_API_KEY`, `NOTIFICATION_EMAIL`) |
| Breaking changes | 0 |

## Bloque A — Quick wins deployables

### Item 1 · OG image branded 1200×630

- **Creado**: `public/brand/og-default.jpg` (61 KB · JPG progresivo, quality 88, gradient navy → navy_deep + isotipo VT + título Patrimonio/Confianza/Futuro + tagline + URL pill + regiones del litoral).
- **Modificado**: `src/app/layout.tsx` apunta `ogImage` al nuevo JPG con dimensions `1200×630` (antes era SVG 1200×320 — share previews rotos en WhatsApp/Slack/FB).
- **Modificado**: `src/app/propiedades/[slug]/page.tsx` fallback OG → `og-default.jpg`.

### Item 2 · Security headers en `next.config.ts`

- **Modificado**: `next.config.ts` (era 7 líneas → 69 líneas).
- Headers globales aplicados a `/:path*`:
  - `Content-Security-Policy-Report-Only` (modo observación, enforce post 48h sin violations)
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
  - `X-DNS-Prefetch-Control: on`
- Suma `images.remotePatterns` para Unsplash + Supabase (preparación Sprint 11 next/image).
- Wrap final con `withSentryConfig` para sourcemaps silent.

### Item 3 · Sentry SDK minimal MVP

- **Creados**: `sentry.server.config.ts` (37), `sentry.edge.config.ts` (17), `instrumentation.ts` (14), `instrumentation-client.ts` (22).
- Perfil minimal: `tracesSampleRate: 0`, sin replays, sin profiling.
- `enabled` derivado de presencia de DSN — sin DSN el SDK queda en no-op.
- `beforeSend` filtra warnings esperados de fallback memoria (no son errores).
- `release` se setea automático con `VERCEL_GIT_COMMIT_SHA` short.
- Captura: server errors, API failures, production exceptions, client unhandled.

### Item 4 · `/api/health` enriquecido

- **Modificado**: `src/app/api/health/route.ts` (113 líneas).
- Agregados al payload: `commit` (7-char SHA), `region` (Vercel), `deploy_id`, `checks.sentry` (`active` / `disabled`).
- Backward compat: todos opcionales, los consumers existentes (UptimeRobot) siguen funcionando.
- `env` ahora prefiere `VERCEL_ENV` sobre `NODE_ENV` (más preciso: production / preview / development).

## Bloque B — Feature crítica + naming

### Item 5 · Resend email notifications

- **Creado**: `src/lib/notifications.ts` (220 líneas).
  - `notifyNewLead(lead)`: fire-and-forget, never throws, retorna `{ok, skipped?, id?, error?}`.
  - `parseRecipients(csv)`: split por coma, trim, filtra inválidos. Multi-email ready.
  - Templates HTML + text con branding Valterra (navy + dorado + isotipo).
  - Sender por defecto `Grupo Valterra <onboarding@resend.dev>` (sandbox).
  - Idempotency: header `Idempotency-Key: lead-<id>` — reintentos no duplican.
  - Tags Resend para analytics: `type=lead_notification`, `source=<lead.source>`.
- **Modificado**: `src/app/api/contact/route.ts` invoca `notifyNewLead(lead).catch(...)` después de `addLead` exitoso. **No bloquea la respuesta 201 al usuario**.
- Failure mode: si Resend falla, el lead ya está persistido en Supabase — el equipo lo ve igual en `/admin/leads`.

### Item 6 · Rename `inmobiliaria_id` → `agency_id`

- **Creado**: `supabase/migrations/0003_rename_leads_agency_id.sql` (39 líneas).
- Operación: `ALTER TABLE ... RENAME COLUMN` atómica, sin downtime, sin reescritura.
- Re-creación de índice `leads_inmob_idx` → `leads_agency_idx`.
- Verificación cero impacto: 0 referencias TS a `inmobiliaria_id` en `src/` (confirmado con grep).
- Rollback documentado en cabecera del archivo.

## Decisiones arquitectónicas confirmadas

1. **CSP empieza en Report-Only**: 48h observación. Si el dashboard Sentry/Vercel no reporta violations, se mueve a `Content-Security-Policy` (enforce).
2. **Sentry sin tracing**: `tracesSampleRate: 0`. MVP: solo errores. Sprint 11+ evalúa habilitar perf monitoring.
3. **Resend sandbox**: `onboarding@resend.dev` mientras dura el sandbox. Cuando exista `valterra.com.ar` verificado en Resend, se cambia sender a `leads@valterra.com.ar` via `RESEND_SENDER` env.
4. **Multi-email destinatario**: ya soportado vía CSV en `NOTIFICATION_EMAIL`. Hoy se usa 1 email; agregar más es solo cambiar la env, sin redeploy.
5. **Naming agency_id consolidado**: tanto `leads.agency_id` como `properties.agency_id`. Sprint 10 puede crear FK contra `agencies` con consistencia total.
6. **Sentry sin SENTRY_AUTH_TOKEN en MVP**: el wrap captura errores. Sin auth token, los stack traces vienen minificados (legibles pero no symbolicados). Activar en Sprint 11.

## Deuda aceptada Sprint 9.5

| Deuda | Razón | Resuelve |
|---|---|---|
| Sentry sin source map symbolication | Requiere `SENTRY_AUTH_TOKEN` + integration Vercel ↔ Sentry | Sprint 11 |
| CSP en Report-Only por 48h | Ventana de observación necesaria antes de enforce | 48h post-deploy |
| Email sender en sandbox `onresend.dev` | Sin dominio propio aún | Cuando compres `valterra.com.ar` |
| Rate limit sigue in-memory | Bloque B no incluía Upstash | Sprint 10 |

## Validation report

| Check | Resultado |
|---|---|
| Typecheck source code | ✅ 0 errors |
| Lint | ✅ 0 errors · 3 warnings `<img>` pre-existentes |
| Null bytes en archivos modificados | ✅ 0 en 8 archivos chequeados |
| File integrity | ✅ 14/14 archivos íntegros |
| Sentry config sintaxis | ✅ Valid (verifica con npm install) |
| Migration SQL sintaxis | ✅ Valid PG (ALTER + DROP INDEX + CREATE INDEX + COMMENT) |
| Breaking risk producción | ✅ LOW · todos los cambios aditivos/no-op friendly |
