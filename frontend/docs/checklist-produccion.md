# Checklist de producción · Sprint 7

Lista de verificación final antes y después de deployar.

> Marcá cada item con ✓ al completarlo. **No deployar hasta tener todos los `[REQ]` en verde.**

---

## A · Pre-deploy local (15 min)

- [ ] `[REQ]` `npm install` corre sin error
- [ ] `[REQ]` `npm run typecheck` → 0 errores
- [ ] `[REQ]` `npm run lint` → 0 errors (warnings `<img>` aceptables)
- [ ] `[REQ]` `npm run build` → completa sin error
- [ ] `[REQ]` `.env.local` configurado con valores reales
- [ ] `[REQ]` Smoke test local: form → leads → admin → ver lead persistente
- [ ] Brand kit verificado en homepage (logo isotipo + descriptor correcto)
- [ ] Datos comerciales correctos en Footer (Catamarca 1365 · +54 9 379 515-9096)

---

## B · Supabase (10 min)

- [ ] `[REQ]` Proyecto Supabase creado (region São Paulo recomendada)
- [ ] `[REQ]` Migración `supabase/migrations/0001_create_leads.sql` aplicada
- [ ] `[REQ]` Tabla `leads` visible en Table Editor
- [ ] `[REQ]` RLS habilitada (sin policies permisivas)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` copiada (Settings → API)
- [ ] Backups daily verificados activos (Database → Backups)
- [ ] (Opcional) `supabase/seed.sql` aplicado para datos demo

---

## C · GitHub (5 min)

- [ ] `[REQ]` Rama `feature/sprint-7-deploy` con todos los cambios
- [ ] `[REQ]` PR a `dev` abierto
- [ ] `[REQ]` CI verde (GitHub Actions ./github/workflows/ci.yml)
- [ ] Merge a `dev`
- [ ] (Producción) Merge `dev` → `main`

---

## D · Vercel setup (10 min)

- [ ] `[REQ]` Repo importado en Vercel
- [ ] `[REQ]` **Root Directory = `frontend`** ← crítico monorepo
- [ ] `[REQ]` Framework = Next.js auto-detected
- [ ] `[REQ]` Build Command = `npm run build`
- [ ] `[REQ]` Install Command = `npm install`
- [ ] Node version = 20.x
- [ ] **Env vars** (4) cargadas:
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (Sensitive ✓)
  - [ ] `ADMIN_PASSWORD` (Sensitive ✓)
  - [ ] `ADMIN_TOKEN` (Sensitive ✓)
- [ ] (Opcional) `NEXT_PUBLIC_SITE_URL` con la URL del deploy

---

## E · Verificación post-deploy (15 min)

- [ ] `[REQ]` Deploy = **Ready** verde
- [ ] `[REQ]` `https://<dominio>/` → HTTP 200 + homepage premium carga
- [ ] `[REQ]` `https://<dominio>/api/health` → `status: "ok"` + `db: "connected"`
- [ ] `[REQ]` `https://<dominio>/api/health` → `auth_middleware: "active"`
- [ ] `[REQ]` `https://<dominio>/admin/leads` redirige a `/admin/login`
- [ ] `[REQ]` Login con `ADMIN_PASSWORD` → entra al panel
- [ ] `[REQ]` Form de contacto envía lead → aparece en `/admin/leads` (refresh)
- [ ] `[REQ]` Logout → cookie limpia → redirect a login
- [ ] Favicon Valterra visible en pestaña
- [ ] Brand kit consistente (paleta + tipografías)
- [ ] OpenGraph preview funciona (pegar URL en WhatsApp/Slack)
- [ ] Mobile responsive (probar en iPhone Safari)

---

## F · Monitoring (10 min)

- [ ] `[REQ]` UptimeRobot configurado → `/api/health` cada 5 min
- [ ] Vercel Logs revisados → sin errores rojos
- [ ] Vercel Analytics activado (Settings → Analytics)
- [ ] Alerts email/telegram funcionando (test manual)

---

## G · Dominio custom (15 min, depende de DNS)

- [ ] Dominio agregado en Vercel → Settings → Domains
- [ ] DNS A record `valterra.com.ar` → `76.76.21.21`
- [ ] DNS CNAME `www.valterra.com.ar` → `cname.vercel-dns.com`
- [ ] TLS automático verde (~1 min después de DNS propagar)
- [ ] HTTPS funcionando en ambos subdominios
- [ ] Redirect `www` → apex configurado

---

## H · Security audit final (5 min)

- [ ] `[REQ]` `SUPABASE_SERVICE_ROLE_KEY` marcada Sensitive en Vercel
- [ ] `[REQ]` `ADMIN_PASSWORD` y `ADMIN_TOKEN` marcadas Sensitive
- [ ] `[REQ]` `.env.local` NO commiteado (en `.gitignore`)
- [ ] Cookie admin: HttpOnly + Secure + SameSite=Strict
- [ ] Rate limit /api/contact verificado (probar 6 envíos seguidos → 6° devuelve 429)
- [ ] Honeypot verificado (curl con `website: spam` → 400)
- [ ] Robots: `/admin/*` con `index: false` en metadata
- [ ] CSP / X-Frame-Options OK (Vercel default)

---

## I · Listo para demo

- [ ] URL pública compartida con stakeholder
- [ ] Login admin testeado por 2da persona
- [ ] Flujo lead end-to-end demostrado
- [ ] Rollback procedure conocido (< 30s vía Vercel UI)
- [ ] Equipo conoce cómo rotar secrets si filtra

---

## Estado actual (al cierre del Sprint 7)

| Categoría | Items | Listos | Pendientes operativos |
|---|---|---|---|
| Pre-deploy local | 8 | ✅ Build OK · Lint 0 errors · Types 0 errors | Smoke test manual usuario |
| Supabase | 7 | ✅ SQL aplicada · tabla creada | Verificación SERVICE_ROLE en uso |
| GitHub | 5 | ✅ CI workflow listo | PR + merge dev/main |
| Vercel setup | 12 | — | Importar repo + cargar 4 env vars |
| Verificación post-deploy | 12 | — | Después del deploy |
| Monitoring | 4 | — | UptimeRobot 5 min config |
| Dominio custom | 6 | — | DNS propagación (15 min - 24h) |
| Security audit | 8 | ✅ Código respeta best practices | Verificación en producción real |

---

**Tiempo estimado total**: 60-90 min de operación humana, sin contar propagación DNS.

**Bloqueantes hard antes de demo a inversores**:
1. Env vars `ADMIN_TOKEN` + `SUPABASE_SERVICE_ROLE_KEY` en Vercel
2. `/api/health` devolviendo `status: "ok"` desde el dominio público
3. Smoke test E2E completo verificado
