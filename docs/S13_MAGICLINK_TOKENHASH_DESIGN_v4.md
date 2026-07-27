# S13 · C1 — DISEÑO (v4, aprobado): MAGIC LINK MULTI-DISPOSITIVO (TOKEN_HASH) · GRUPO VALTERRA
Director de Proyectos IA · 2026-07-27 (ART) · **Implementación LOCAL (sin desplegar)** · *el Director ejecuta y verifica; el dueño decide y autoriza.*

> Único documento de diseño vigente (reemplaza v1/v2/v3, eliminados del repo). Branch local **`feat/s13-tokenhash-magiclink`** · `main=1117a5d`. **Sin push · PR · merge · deploy · sin tocar Supabase Templates / Redirect URLs / Vercel / producción · sin enviar emails.**

---

## VEREDICTO ÚNICO
### ✅ **APTO PARA APLICAR EN REPO CANÓNICO**
v4 corrige el test de reuso (sin falso verde), separa las guardas de entorno (REAL-A con Admin API / REAL-B sin Service Role) y documenta el rate limit con precisión. Sin cambios de arquitectura ni de código productivo respecto de v3. `tsc` 0, `lint` 0, **Playwright 12 passed / 4 skipped** (grupos correctamente separados y listados). Build de rutas nuevas compila (ver §3 salvedad de fonts). Validación definitiva: CI del repo canónico.

---

## 1. DISEÑO APROBADO (sin cambios v3→v4)
- **`type=email` exclusivo** (`ALLOWED_OTP_TYPES=["email"]`; `verifyOtp({token_hash, type:"email"})`). Sintaxis confirmada con doc Supabase.
- **Página intermedia anti-prefetch:** `GET /auth/confirm` no verifica (muestra botón "Ingresar"); solo el **POST** llama `verifyOtp`. `verifyOtp(token_hash)` no usa `code_verifier` → multi-dispositivo.
- **Despliegue en DOS FASES sin rotura:** fase código (esta) mantiene `requestMagicLink` en `/auth/callback` (PKCE intacto); fase config posterior = solo template `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/admin/leads`.
- **Sin nueva Redirect URL** (template usa `{{ .SiteURL }}`, sin `redirect_to`).
- **Invites intactos** en `/auth/callback` (`admin.generateLink({type:'invite'})`).
- **Hardening `/auth/confirm`:** `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` (middleware) + noindex metadata + force-dynamic. Sin `userId`/token en logs. CSP global bloquea recursos externos.

## 2. TESTS — GUARDAS SEPARADAS + REUSO CORREGIDO (v4)
### 2.1 Reuso corregido (elimina falso verde)
El test **"4 — primer uso EXITOSO y luego segundo uso RECHAZADO"** ahora exige la **secuencia completa**:
1. **Primer uso EXITOSO:** redirección **exacta** a `/admin/leads` **+ cookie de sesión Supabase presente** (ya **no** se acepta `/admin/login`, que producía un falso verde con un token que nunca funcionó).
2. **Segundo uso del MISMO token en contexto LIMPIO:** `/admin/login?error=invalid-link` **+ ausencia de cookie de sesión** en el segundo contexto.

### 2.2 Guardas de entorno separadas
| Grupo | Casos | Requisitos | Service Role |
|---|---|---|---|
| **REAL-A** (Admin API) | (2) POST válido crea sesión · (3) navegador limpio funciona · (4) primer uso OK + reuso rechazado | `E2E_REAL_TOKEN=1` · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `TEST_EMAIL` | **Sí** |
| **REAL-B** (sin Service Role) | (5a) token inválido/garbage → `invalid-link` sin sesión | `E2E_CONFIRM=1` · `E2E_SUPABASE_PUBLIC=1` (build con `NEXT_PUBLIC_SUPABASE_URL/ANON`) | **No** |
| **Manual** | (5b) token **realmente vencido** | preview + espera del TTL | — |

El caso **token inválido (5a) NO exige SERVICE_ROLE ni TEST_EMAIL** — solo variables públicas Supabase. **(5b) token realmente vencido** queda como prueba **manual cronometrada** (no determinista en test; no se finge). Seguridad: token_hash nunca impreso/guardado; email QA explícito; sin creación de usuarios.

## 3. RESULTADOS REALES (ejecutados en el sandbox, `npm ci`)
| Paso | Comando | Resultado |
|---|---|---|
| **Typecheck** | `npx tsc --noEmit` | **ejecutado — exit 0** |
| **Lint** | `npm run lint` | **ejecutado — exit 0** (3 warnings preexistentes `<img>` en `components/home/*`, ninguno en archivos nuevos) |
| **Playwright (sin secrets)** | `E2E_CONFIRM=1 BASE_URL=http://localhost:3000 playwright test auth-confirm` | **ejecutado — 12 passed / 4 skipped** |
| **Playwright (listado de grupos)** | `… --list` | REAL-A (2,3,4) · REAL-B (5a) · GET E2E_CONFIRM (6,7,8,1,hardening) · Compatibilidad (2) · unit (5) — **grupos correctos** |
| **Build (rutas nuevas)** | `next build` con `next/font/google` **temporalmente neutralizado** | **ejecutado — Compiled successfully**; `ƒ /auth/confirm` y `ƒ /auth/callback` en el manifest |
| **Build (árbol final exacto)** | `next build` sin neutralizar | **BLOQUEADO en el sandbox** por descarga de Google Fonts (`layout.tsx`, preexistente, sin egress) |
| **Validación definitiva** | CI del repo canónico | **pendiente** (allí hay egress a fonts) |

> **No se afirma "build final exit 0".** Rutas nuevas compilan; el build del árbol completo lo cierra el CI canónico. `layout.tsx` **NO** está en el diff final (neutralización solo temporal, restaurada — `git diff --quiet frontend/src/app/layout.tsx` → limpio).

**4 skipped honestos (con cuerpo real):** REAL-A 2,3,4 (sin Admin API) + REAL-B 5a (sin `E2E_SUPABASE_PUBLIC`).

## 4. RATE LIMIT — PRECISIÓN (sin cambiar la implementación)
La server action `confirmMagicLink` aplica `rateLimit("confirm:<ip>", {limit:10, windowMs:10min})`. Precisiones:
- Es **in-memory por IP** (`lib/rate-limit.ts`, `Map` por proceso).
- En **serverless (Vercel), NO garantiza coordinación global** entre instancias/regiones: cada función tiene su propia memoria → el límite efectivo es ~`N×instancias`.
- Es una **defensa complementaria** (mitiga ráfagas triviales), **no** la protección principal.
- La **protección principal** del flujo sigue siendo: **(a) entropía del `token_hash`**, **(b) un solo uso** (se consume al verificar), y **(c) expiración + validación server-side de Supabase** (`verifyOtp`).
- **No se cambia la implementación en esta fase.** (Mejora futura opcional, fuera de alcance: mover el rate limit a un store compartido tipo Upstash Redis, ya anotado en `lib/rate-limit.ts`.)

## 5. NÓMINA EXACTA DEL PATCH v4 (10 archivos)
```
NEW  docs/S13_MAGICLINK_TOKENHASH_DESIGN_v4.md          (este — único doc de diseño)
NEW  docs/auth/magic-link.token-hash.proposed.html      (template type=email · SiteURL — NO aplicado)
NEW  frontend/src/lib/auth-confirm.ts                   (allowlist=[email] · sanitizeNext)
NEW  frontend/src/app/auth/confirm/page.tsx             (GET intermedio anti-prefetch · UI neutra)
NEW  frontend/src/app/auth/confirm/actions.ts           (POST verifyOtp type=email · sin token/userId en logs)
NEW  frontend/e2e/auth-confirm-unit.spec.ts             (unit puro · type solo email)
NEW  frontend/e2e/auth-confirm.spec.ts                  (compat + GET + headers + REAL-A + REAL-B)
MOD  frontend/src/middleware.ts                          (+headers de /auth/confirm)
MOD  frontend/src/app/admin/login/actions.ts            (emailRedirectTo en /auth/callback · comentario 2 fases)
MOD  frontend/src/app/admin/login/LoginForm.tsx          (+mensaje "too-many")
```
**El patch v4 NO incluye:** docs v1/v2/v3 (eliminadas) · archivos scratch · `node_modules` · `test-results` · `layout.tsx` · secretos.

## 6. ROLLBACK
Inmediato sin deploy de código: revertir el template a `<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>` → PKCE por `/auth/callback`. Código: `git revert` de la rama; `/auth/confirm` queda dormido. Sesiones existentes: no afectadas.

## 7. PLAN-QA (runbook)
```
# GRUPO REAL-A (Admin API) — casos 2,3,4 — en PREVIEW:
E2E_REAL_TOKEN=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TEST_EMAIL=... \
  BASE_URL=https://<preview> npx playwright test auth-confirm

# GRUPO REAL-B (SIN Service Role) — caso 5a token inválido — en build con vars públicas Supabase:
E2E_CONFIRM=1 E2E_SUPABASE_PUBLIC=1 BASE_URL=https://<preview-con-NEXT_PUBLIC_SUPABASE> \
  npx playwright test auth-confirm
#   (requiere NEXT_PUBLIC_SUPABASE_URL/ANON en el build; NO requiere SERVICE_ROLE ni TEST_EMAIL)

# MANUAL cronometrado (caso 5b token REALMENTE VENCIDO) — NO AUTOMATIZADO:
#  1) emitir magic link real; 2) esperar a superar el TTL del OTP; 3) /auth/confirm → "Ingresar";
#  4) esperado /admin/login?error=invalid-link. Evidencia: timestamps emisión/intento + captura.
```

## 8. APLICACIÓN EN REPO CANÓNICO (con autorización — NO ejecutado)
1. `git fetch origin && git checkout -b feat/s13-tokenhash-magiclink origin/main`.
2. `git apply --check S13_tokenhash_magiclink_v4.patch` → `git apply`. No reescribir commits existentes.
3. Verificar `git diff` y hashes; `npm ci && typecheck && lint && build && E2E_CONFIRM=1 … playwright test auth-confirm` (el build cierra en CI con egress a fonts).
4. **No push** — esperar autorización del Director.

## 9. HALLAZGO (no bloquea) — `middleware.ts` deprecado en Next 16
Next 16 deprecó `middleware.ts` → `proxy.ts`. El proyecto ya usa `middleware.ts`; mi cambio lo extiende (build lo marca "ƒ Proxy (Middleware)" y funciona con warning). Migración = refactor separado a agendar, fuera de alcance.

## 10. TABLA v3 → v4
| Área | v3 | v4 |
|---|---|---|
| Test de reuso (caso 4) | primer uso aceptaba `/admin/leads` **O** `/admin/login` (falso verde) | primer uso EXIGE **`/admin/leads` exacto + cookie**; luego 2º uso → `invalid-link` + **sin cookie** |
| Guardas de entorno | un solo grupo (E2E_REAL_TOKEN); 5a mezclado con service role | **REAL-A** (Admin API: 2,3,4) y **REAL-B** (sin Service Role: 5a) **separados** |
| Requisitos token inválido (5a) | requería el mismo guard con SERVICE_ROLE/TEST_EMAIL | **`E2E_CONFIRM=1 + E2E_SUPABASE_PUBLIC=1`**, sin SERVICE_ROLE ni TEST_EMAIL |
| Rate limit | mencionado | **documentado con precisión** (in-memory por IP, sin coordinación global serverless, complementario; principal = entropía + un solo uso + expiración Supabase). Sin cambiar implementación |
| Doc de diseño | v3 | **v4** (v1/v2/v3 eliminados) |

## 11. RESTRICCIONES CUMPLIDAS
Sin push · PR · merge · deploy · sin modificar Supabase Templates · sin cambiar Redirect URLs · sin enviar emails · sin tocar Vercel/producción · sin cambios adicionales de arquitectura · `/auth/callback` no eliminado · invites intactos · token_hash nunca en logs · C1 no cerrado · Sprint 13 no cerrado.
