# Sprint 9.5 · Deploy Checklist Producción

> Pre-flight, deploy, post-flight + rollback. Orden estricto.

## 0 · Pre-flight local (en tu PC, antes de pushear)

```
cd C:\Users\gust\Downloads\grupo-valterra-repo\frontend
npm install
npm run typecheck
npm run lint
```

**Resultado esperado:**
- `npm install` baja `@sentry/nextjs` y `resend` (más deps transitivas, ~30 paquetes nuevos).
- `npm run typecheck` → **0 errors**.
- `npm run lint` → **0 errors · 3 warnings** (los 3 `<img>` pre-existentes, intencionales).

Si typecheck falla por algo de Sentry/Resend, borrá `node_modules` y `package-lock.json` y volvé a correr `npm install`.

## 1 · Configurar cuenta Sentry (5 min)

1. https://sentry.io/signup/ (free tier alcanza)
2. **Create project** → Platform = **Next.js** → nombre `grupo-valterra`
3. Copiar el DSN que aparece en la pantalla de setup (formato `https://abc@o123.ingest.us.sentry.io/456`)
4. En `.env.local` agregar:
   ```
   SENTRY_DSN=<DSN copiado>
   NEXT_PUBLIC_SENTRY_DSN=<MISMO DSN>
   ```
5. `npm run dev` y abrí `http://localhost:3000/api/health` → buscás `"sentry":"active"`.

## 2 · Configurar cuenta Resend (3 min)

1. https://resend.com/signup
2. **API Keys** → **Create API Key** → permission **Full access** (o **Sending access** para más seguridad), nombre `valterra-prod`
3. Copiar la API key (formato `re_abc123...`)
4. En `.env.local`:
   ```
   RESEND_API_KEY=re_<key>
   NOTIFICATION_EMAIL=gustavo210277@gmail.com
   ```
   (cuando quieras múltiples: `NOTIFICATION_EMAIL=uno@x.com,dos@y.com`)

## 3 · Smoke test local

```
npm run dev
```

Abrí http://localhost:3000 y enviá un lead de prueba desde el formulario de contacto.

**Validar:**
- Lead aparece en `/admin/leads` (Supabase persistencia OK).
- Recibís el email en `gustavo210277@gmail.com` con branding Valterra.
- En la terminal NO ves error en logs (`{"level":"error","ctx":"notifications"...}`).
- En Sentry dashboard → **Issues** no debería aparecer ningún evento si todo está OK.

**Test negativo (opcional):**
- Quitá temporalmente `RESEND_API_KEY` del `.env.local`, restart dev, enviá otro lead.
- El lead debería persistir igual, pero en la terminal verás: `{"level":"warn","msg":"RESEND_API_KEY no configurado - email skipped"}`.
- Volvé a poner la key.

## 4 · Aplicar migration 0003 en Supabase

**Supabase Studio** → SQL Editor → New query → pegar contenido de `supabase/migrations/0003_rename_leads_agency_id.sql` → **Run**.

Esperado: `Success. No rows returned`.

**Verificar:**
1. Table Editor → `leads` → la columna ya no se llama `inmobiliaria_id` sino `agency_id`.
2. Database → Indexes → buscar `leads_agency_idx` (existe), `leads_inmob_idx` (no existe).

## 5 · Configurar env vars en Vercel

Settings → Environment Variables. Agregar para **Production + Preview**:

| Variable | Valor | Sensitive |
|---|---|---|
| `SENTRY_DSN` | tu DSN | NO (es público por diseño) |
| `NEXT_PUBLIC_SENTRY_DSN` | tu DSN | NO |
| `RESEND_API_KEY` | tu Resend key | **SÍ** |
| `NOTIFICATION_EMAIL` | `gustavo210277@gmail.com` | NO |

Ya deberían estar de antes:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Sensitive), `ADMIN_PASSWORD` (Sensitive), `ADMIN_TOKEN` (Sensitive)

## 6 · Commit + push

```
cd C:\Users\gust\Downloads\grupo-valterra-repo
git status
git diff --stat
git add .
git commit -m "feat(sprint-9.5): production hardening · OG image + security headers + Sentry + Resend + agency_id rename

Bloque A (deployable hardening):
- public/brand/og-default.jpg: OG real 1200x630 branded Valterra
- next.config.ts: CSP Report-Only + HSTS + X-Frame + Permissions-Policy + remotePatterns + withSentryConfig
- sentry.{server,edge,client} configs: minimal MVP, tracesSampleRate=0, no replays
- /api/health: enriquecido con commit SHA, region, deploy_id, checks.sentry

Bloque B (feature crítica + naming):
- src/lib/notifications.ts: notifyNewLead vía Resend, multi-email CSV, idempotency
- /api/contact: fire-and-forget notification post-addLead (no bloquea respuesta)
- supabase/migrations/0003: rename leads.inmobiliaria_id → leads.agency_id (consistencia con properties)

Deps: +@sentry/nextjs ^9.0.0, +resend ^4.0.0
Env nuevas: SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, RESEND_API_KEY, NOTIFICATION_EMAIL
Breaking changes: 0
Validation: typecheck PASS · lint PASS (3 warnings pre-existentes)"

git push origin main
```

## 7 · Validar deploy en Vercel

1. Abrir https://vercel.com/<tu-team>/grupo-valterra → ver build en progreso.
2. Esperar status **Ready** (~2-3 min con las deps nuevas).
3. Si build **Failed**: screenshot del log y revisar (lo más probable: env var faltante).

## 8 · Post-deploy validation producción

Abrí en orden:

| # | URL | Validación |
|---|---|---|
| 1 | `https://grupo-valterra.vercel.app/api/health` | JSON con `status: ok`, `db: connected`, **`commit: 7chars`**, **`region`**, **`deploy_id`**, **`checks.sentry: active`** |
| 2 | `https://grupo-valterra.vercel.app/` | Home premium, 6 properties destacadas |
| 3 | DevTools → Network → `/` request → Headers | Buscar `content-security-policy-report-only`, `strict-transport-security: max-age=63072000`, `x-frame-options: DENY`, `permissions-policy: camera=(), microphone=()...` |
| 4 | View source → `<head>` | `<meta property="og:image" content="/brand/og-default.jpg">`, `og:image:width: 1200`, `og:image:height: 630` |
| 5 | https://opengraph.dev → pegar tu URL pública | Preview se ve con el banner Valterra navy + dorado |
| 6 | Enviar lead desde el form en producción | Aparece email en tu inbox + aparece en `/admin/leads` |
| 7 | Sentry dashboard → Issues | Sin errores nuevos. Para probar SDK: tirá una excepción fake desde `/admin/leads` (login fail repetido) y vé si aparece. |

## 9 · 48h post-deploy → CSP enforce

Pasadas 48h sin reportes de violation:
- Editar `next.config.ts`
- Cambiar key `"Content-Security-Policy-Report-Only"` → `"Content-Security-Policy"`
- Commit `chore(security): enforce CSP after 48h observation`
- Push

Si SÍ aparecieron violations:
- Identificar dominios faltantes en los reportes
- Agregar a `CSP_DIRECTIVES` whitelist (típicamente nuevos hosts de Sentry o algún CDN faltante)
- Re-deploy y observar 24h más

## 10 · Rollback plan (si producción se rompe)

### Si el deploy queda en Failed:
- Vercel mantiene el deploy anterior activo. Sin impacto en usuarios.
- Identificar el error en logs.
- Fix + re-push.

### Si el deploy queda Ready pero algo se rompe:
- Vercel dashboard → Deployments → buscar el deploy anterior verde → **Promote to Production**.
- Tarda 5s y rollback hecho.

### Rollback de migration 0003 (si rompe queries del admin):
```sql
alter table public.leads rename column agency_id to inmobiliaria_id;
drop index if exists public.leads_agency_idx;
create index leads_inmob_idx on public.leads (inmobiliaria_id);
```

### Si Resend está spammeando o no funciona:
- Vercel env vars → quitar `RESEND_API_KEY`.
- Redeploy (o esperar al próximo ISR de 60s).
- Sin la key, el SDK no-opea con warn — leads siguen entrando OK.

### Si Sentry está spammeando:
- Sentry dashboard → Settings → Quotas → spike protection ON.
- O Vercel env vars → quitar `SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN`.

## 11 · Cierre

- Mark Sprint 9.5 como CLOSED en tu tracking.
- Decidir si arrancás Sprint 10 (Multi-Tenant Foundation) o hacés un break.
- Considerar dominio propio `valterra.com.ar` antes de Sprint 10 (mejora share previews + Resend sender custom).
