# Valterra Core · Operating System v1

**Estado:** LOCKED · v1
**Vigencia:** 6 meses desde publicación (revisión OS v2 al final de ese periodo)
**Audiencia:** founder + cualquier developer que escriba código en este repo o en repos clonados del template

> Este documento es el manual operativo. NO es estrategia. Son reglas ejecutables para usar diariamente.

---

## Misión

Lanzar productos digitales nuevos en **2 semanas** sin reescribir auth, multi-tenant, notifications, admin shell ni deployment.

## Filosofía

> "Construir un ladrillo a la vez, donde cada ladrillo es la próxima cosa que un usuario real necesita Y donde cada ladrillo, además, encaja en la próxima catedral."

No construimos plataforma anticipando productos. Construimos productos y, cuando un patrón aparece dos veces, lo elevamos al Core.

---

## Operating Rules · 25 reglas ejecutables

### Decisión Core vs Vertical (4 reglas)

1. **Si dudás entre Core o Vertical → es Vertical.** Es más fácil promover a Core después que sacar algo del Core. La duda misma es una señal.
2. **Una capability sube al Core SOLO si aparece en 2+ productos reales en producción.** No "va a aparecer". No "podría aparecer". Aparece y está en uso.
3. **Cada feature nueva responde la pregunta: ¿esto me sirve en PatiFeliz / RRHH / Marketplace genérico? Si la respuesta es "no exacto" → Vertical.** El "más o menos sí" es vertical.
4. **No abstraer antes de producción.** Una feature en local que "podría ser core" es vertical hasta que se valide bajo tráfico real.

### Estructura del código (5 reglas)

5. **Direccionalidad estricta:** `src/platform/` NUNCA importa de `src/domain/`. `src/domain/` puede importar de `src/platform/` libremente. Sin excepciones.
6. **Naming abstraction:** en código Core hablamos de `Tenant`, `Member`, `Role`. En código vertical hablamos de `Agency`/`Clinic`/`Organization` según el dominio. Nunca al revés.
7. **Cero copy hardcoded en `src/platform/`.** Todo string visible al user lee del `theme.config.ts` del producto.
8. **Cero color hex hardcoded en componentes shared.** Tokens vía theme config o Tailwind config.
9. **Convention sobre framework:** preferí copiar un patrón existente (espejo de `mock-leads.ts`, espejo de `validateLead.ts`) antes de inventar una abstracción nueva.

### Calidad técnica (4 reglas)

10. **TypeScript strict. Cero `any` en code review.** Si necesitás casting, usá `as unknown as T` y justificá en comentario.
11. **CSP enforce + Sentry + UptimeRobot son requisitos pre-prod.** No "nice-to-have", no "lo agregamos después". Sin esos 3, no se considera deploy productivo.
12. **Server components > client components por default.** "Use client" solo cuando hay interactividad real (form, modal, navegación dinámica).
13. **Server actions > API routes para mutations admin.** API routes solo para endpoints públicos consumibles desde anon (form contact) o terceros (webhooks).

### Database & migrations (4 reglas)

14. **Migraciones SQL prefijadas:** `CORE_NNNN_*` para schema Core (tenants, members, leads), `VERTICAL_NNNN_*` para schema vertical (properties, pets, etc.). Sin excepciones.
15. **Rollback SQL en el header de cada migración.** Copy-paste-ready. Si no podés escribir el rollback, no podés aplicar la migración.
16. **Cada nueva tabla con datos vertical-scoped lleva `tenant_id` (o equivalente) + RLS policies en la MISMA migration.** Nunca dejar RLS "para después".
17. **Una migración aplicada en prod NUNCA se edita.** Si hay error, otra migration la arregla.

### Multi-product (4 reglas)

18. **Una Supabase project por producto. Una Vercel project por producto.** Cero shared databases jamás.
19. **Cada producto tiene su propio `theme.config.ts`** como single source of truth de branding (name, palette, fonts, logo, tagline, contact).
20. **Cada producto tiene su `.env.example`** documentando todos los envs requeridos con valores placeholder.
21. **Tag git pre-sprint** antes de tocar auth, DB schema o middleware. Punto de rollback total siempre disponible.

### Velocidad y disciplina (4 reglas)

22. **Si no podés explicar la abstracción en 1 frase, no la hagas.**
23. **Simple > clever, siempre.** Cualquier solución "ingeniosa" requiere disclaimer "esto es así porque...".
24. **Si una idea suena 'elegante' pero no resuelve un problema actual concreto, no la implementes.** Wishlist va a un backlog. El código no es lugar para hipótesis.
25. **Founder-led code review:** cada PR responde la pregunta "¿esto sirve al usuario final o al developer?". Si solo sirve al developer, postergar.

### Las 3 super-reglas (si olvidás las 25, recordá estas)

- **A.** Si dudás → Vertical.
- **B.** Cero hardcoded brand strings en Core.
- **C.** Una capability sube al Core cuando se reusa, NUNCA antes.

---

## Core Promotion Scorecard

Sistema de 5 preguntas binarias. **Total >= 4/5 = promover. < 4/5 = quedarse en domain.**

| # | Pregunta | Definición operativa |
|---|---|---|
| 1 | ¿Existe en producción en >1 producto (o claramente vertical-agnóstica)? | "Producción" = serving real users, NO localhost. "Vertical-agnóstica" = no menciona conceptos de dominio (property, pet, employee) en su interfaz. |
| 2 | ¿Fue validada bajo carga real al menos 2 semanas? | No teórica. Ha procesado requests reales por al menos 2 semanas sin necesidad de hotfix arquitectónico. |
| 3 | ¿Tiene tests automatizados O validación manual reproducible documentada? | El "funciona en mi máquina" no califica. Tests > docs > nada. |
| 4 | ¿Sus interfaces TypeScript NO contienen nombres vertical-specific? | `getPropertyById` es vertical. `getEntityById` es Core. Si no podés renombrar sin perder significado, es vertical. |
| 5 | ¿NO depende de copy ni branding hardcoded? | Si la función habla de "tu inmobiliaria" en un email, no es Core. Si lee del theme config, sí. |

### Decisión

| Score | Acción |
|---|---|
| **5 / 5** | Promover inmediatamente. Mover a `src/platform/`, registrar en `PLATFORM.md`, comunicar al equipo. |
| **4 / 5** | Promover con refactor mínimo. El item débil (típicamente naming o copy) se arregla en el PR de promoción. |
| **3 / 5** | NO promover. Documentar en backlog "candidato a Core". Revisar al lanzar el próximo producto. |
| **< 3 / 5** | Quedarse en `src/domain/`. Posible reescritura cuando el segundo producto lo necesite. |

### PR de promoción

Cada promoción al Core requiere PR explícito con:
- Scorecard adjunto (5 respuestas SI/NO con justificación corta)
- Lista de archivos movidos
- Diff de imports actualizados
- Confirmación de cero regresión runtime

Sin scorecard = no promotion.

---

## New Product Launch Playbook

Receta operativa para lanzar PatiFeliz o cualquier producto vertical futuro **sin volver a Sprint 1**.

**Target: 2 semanas trabajo · 1 founder.**

### Fase 0 · Pre-flight (15 min)

- Confirmar nombre del producto + dominio target
- Validar que Valterra Core está en estado "release-ready" (tag estable + PLATFORM.md actualizado)
- Crear board en Notion/Linear con los 10 pasos

### Fase 1 · Infra setup (~4h · día 1)

1. Fork starter: clonar repo template → nuevo repo GitHub
2. Crear Supabase project nuevo (free tier)
3. Crear Vercel project nuevo (link a repo GitHub)
4. Crear Sentry project nuevo
5. Setup Resend (puede compartir account, key per-product)
6. Setup UptimeRobot monitor (apuntará a `/api/health` post-deploy)
7. Comprar dominio si aplica (opcional Sprint 1, puede ser `*.vercel.app`)

### Fase 2 · Configure branding (~2h · día 1)

- Editar `src/platform/theme/theme.config.ts`:
  - `brand.name`, `brand.shortName`, `brand.tagline`
  - `palette.primary`, `palette.gold`, `palette.background`
  - `fonts.heading`, `fonts.body`
  - `contact.email`, `contact.phone`, `contact.whatsapp`
  - `routes.tenantTableName` (ej. `clinics` en lugar de `agencies`)
- Reemplazar `/public/brand/` assets: logo, isotipo, og-default.jpg, favicon
- Validar local: `npm run dev` → home muestra branding correcto

### Fase 3 · Core migrations (~3h · día 2)

- Adaptar `CORE_0001_tenants_and_members.sql`: find-replace `agencies` → `clinics`, `agency_members` → `clinic_members`
- Aplicar en Supabase Studio SQL Editor
- Adaptar `CORE_0002_rls_template.sql` (mismo find-replace)
- Aplicar
- Validar: tablas existen + 12 policies activas

### Fase 4 · Seed inicial (~1h · día 2)

- Adaptar seed → INSERT primer tenant (ej. "PatiFeliz HQ")
- Validar: `SELECT * FROM clinics` → 1 row

### Fase 5 · Vertical domain (~40h · día 3-7)

- Escribir `VERTICAL_0100_<entity>.sql` (ej. pets table)
- Aplicar migration
- Escribir `src/domain/<vertical>/types.ts`
- Escribir `src/domain/<vertical>/<entity>.ts` (service hybrid pattern)
- Escribir `src/domain/<vertical>/validate<Entity>.ts`
- Escribir páginas:
  - `/admin/<entity>/page.tsx`
  - `/admin/<entity>/new` + `/[slug]/edit`
  - `/<entity>/[slug]/page.tsx` (público)
  - `/<entity>/page.tsx` (listado público)

### Fase 6 · Lead context wiring (~3h · día 8)

- Ajustar `/api/contact`: agregar resolver context vertical-specific (ej. petId → clinic_id en vez de propertySlug → agency_id)
- Validar: enviar lead desde form → email llega + lead persiste

### Fase 7 · Deploy + envs (~3h · día 9)

- Setear envs en Vercel (Production + Preview): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Sensitive), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_PASSWORD`, `ADMIN_TOKEN` (Sensitive), `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `RESEND_API_KEY` (Sensitive), `NOTIFICATION_EMAIL`
- `git push` → Vercel auto-deploy
- Esperar build verde

### Fase 8 · Smoke test prod (~2h · día 9-10)

- `/api/health` → `status: ok` · `checks.sentry: active`
- `/admin/login` con `ADMIN_PASSWORD` → entra
- `/admin/<entity>` → muestra el tenant + scope badge
- Crear primera entidad de prueba desde admin
- Lead desde public form → email llega
- Invitar segundo owner via `/admin/agencies` (o equivalente) → magic link funciona

### Fase 9 · Monitoring setup (~30min · día 10)

- UptimeRobot apuntando a `/api/health`
- Alert email tu address
- Verificar primera alerta funciona (test breakage)

### Fase 10 · Tag + docs (~30min · día 10)

- `git tag v0.1.0` + push
- Crear `docs/PRODUCTO-LAUNCH.md` con:
  - Decisiones tomadas durante el launch
  - Cosas que se reusaron al 100%
  - Cosas que requirieron customización
  - Candidatos a promover al Core (feedback para Core v2)

### Total estimado · solo founder

- Setup + branding + migrations + seed: ~10h
- Vertical domain + pages: ~40h
- Wiring + envs + deploy + smoke + monitoring + tag: ~10h
- **TOTAL: ~60-70h trabajo concentrado · 2 semanas calendario**

---

## Governance Rules

### Repo strategy

| Decisión | Política |
|---|---|
| Cuántos repos | Uno por producto. Cero monorepo hasta producto #3 mínimo. |
| Template source | Branch protegido `core-stable` del primer producto. Después de Sprint 12, considerar separar a repo `valterra-core-template`. |
| Branches | `main` (prod) · `feature/*` (PRs) · `fix/*` (hotfix). Cero feature flags branches long-lived. |
| Tags | `vMAJOR.MINOR.PATCH` por release estable. `vN.N-pre-sprint-K` antes de Sprints arriesgados. |

### Deploy strategy

| Item | Política |
|---|---|
| Plataforma | Vercel siempre. No considerar otras hasta scale crítico. |
| Frecuencia | Auto-deploy cada push a `main`. PR previews automáticos. |
| Rollback | Vercel Promote Previous (<60s). Documentado en cada deploy checklist. |
| Multi-region | NO. Single region (default Vercel) hasta tener tracción global real. |
| CDN | Vercel built-in. NO Cloudflare layer adicional hasta justificación clara. |

### Module boundaries

| Boundary | Regla |
|---|---|
| `src/platform/` | Importable hacia `src/domain/` y `src/app/`. NUNCA importa de domain. |
| `src/domain/<vertical>/` | Importable hacia `src/app/`. NUNCA importa de otro vertical. |
| `src/app/` | Puede importar de platform y domain. Es el punto de composición. |
| Detección de violación | ESLint rule `import/no-restricted-paths` automatiza la check (cuando se haga el refactor folder). |

### Configuration philosophy

| Capa | Mecanismo | Ejemplo |
|---|---|---|
| Compile-time config | `theme.config.ts` versioned en repo | brand, palette, routes |
| Runtime env | Vercel env vars | API keys, DSNs, secrets |
| Per-tenant runtime config | DB rows en tabla tenants | contact_email, whatsapp |
| Feature toggles | Env vars boolean. Cuando dolor real → PostHog flags. NO antes. |

### Secrets handling

| Regla | Detalle |
|---|---|
| `.env.local` | NUNCA committeado. Está en `.gitignore`. |
| `.env.example` | Documenta TODOS los envs requeridos con valores placeholder. Versionado en repo. |
| Vercel envs Sensitive | Marcar siempre: `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN`, `ADMIN_PASSWORD`, `RESEND_API_KEY`. |
| Rotation | Si se filtra → rotar inmediato + audit Sentry/logs. Documentar incident. |
| Multi-product | Cada producto tiene su propio set de envs. NUNCA compartir keys de Supabase entre productos. |

### Migration discipline

| Regla | Detalle |
|---|---|
| Versioning | `CORE_NNNN_descripcion.sql` o `VERTICAL_NNNN_descripcion.sql` |
| Idempotencia | `IF NOT EXISTS`, `IF EXISTS` en todo |
| Rollback header | SQL inverso copy-paste-ready en comentario top del file |
| Aplicación | Supabase Studio SQL Editor (UI con audit) en MVP. CLI cuando haya pipeline CI. |
| No-edit policy | Una migration aplicada a prod NUNCA se edita. Si hay error, nueva migration la arregla. |
| Backfill separado | Schema change y data backfill en migrations SEPARADAS (cuando sea posible). |
| Smoke SQL post-migration | Documentado en footer del archivo (queries de validación esperadas). |

### Comunicación operativa

| Item | Política |
|---|---|
| Decisiones arquitectónicas | Documentadas en `docs/DECISIONS.md` con fecha + razón + alternativas consideradas. |
| Sprints | CHANGELOG + Implementation Report HTML por sprint. Tag git al cierre. |
| Incidentes | `docs/incidents/YYYY-MM-DD-titulo.md` con timeline + root cause + fix + lesson learned. |
| Promotion al Core | PR explícito con scorecard adjunto. Sin scorecard = no promotion. |

---

## Founder Daily Checklist

> Imprimir. Pegar cerca del teclado. Consultar antes de cada commit.

### Antes de cada feature / PR

- [ ] ¿Sirve al usuario que paga (o pagará)? Si solo sirve al developer → postponer 30 días.
- [ ] ¿Esto es CORE o VERTICAL? Si dudás → VERTICAL.
- [ ] ¿Lo puedo explicar en 1 frase? Si no → simplificar.
- [ ] ¿Tiene hardcoded brand strings o colores? → usar `theme.config.ts`.
- [ ] ¿Importa de domain hacia platform? → REVERTIR.

### Antes de cada commit

- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run lint` → 0 errors
- [ ] Null bytes en archivos editados → 0
- [ ] Hardcoded secret? → REVERTIR
- [ ] Migración nueva? → header con rollback SQL
- [ ] Nueva env var? → `.env.example` actualizado

### Antes de cada deploy

- [ ] ¿Tag git pre-deploy si toca auth/DB/middleware?
- [ ] ¿Vercel preview verde?
- [ ] ¿Sentry sin errores nuevos críticos?
- [ ] Plan de rollback escrito y testeable

### Post-deploy

- [ ] `/api/health` → `status: ok`
- [ ] Endpoint crítico tocado → smoke test manual
- [ ] UptimeRobot verde por 5+ min
- [ ] Sentry sin spike de errores

### Semanal

- [ ] ¿Pasé >30% de la semana en infra/platform sin tracción comercial? → recalibrar próxima semana
- [ ] ¿Algún patrón apareció 2 veces? → candidato a Core (aplicar scorecard)
- [ ] ¿Alguna regla LOCKED se discutió >2 veces? → frenar y referenciar Decision Lock
- [ ] Backup Supabase + nota en `docs/incidents/` si hubo incidente

### Mensual

- [ ] Tag git mensual estable: `v0.X.0`
- [ ] Review de candidatos a promoción Core con scorecard
- [ ] ¿Algún UNLOCK pendiente puede resolverse ya con data nueva?
- [ ] Sentry + UptimeRobot + Vercel envs revisados

### Red flags (frenar 24h si aparece cualquiera)

- ✕ Hablo más de "la plataforma" que del usuario
- ✕ Refactor sin pain actual
- ✕ Abstracción "por si la necesitamos"
- ✕ Pre-mature versioning
- ✕ Vocabulario inventado ("adapter del conector del módulo")
- ✕ +30% effort en infra
- ✕ Discutir un tema CLOSED de la lista de 20

### Cierre del día

- [ ] ¿Producción sigue verde?
- [ ] ¿Code commiteado (sin pendientes en working tree)?
- [ ] ¿Próximo paso de mañana claro en 1 frase?

### 3 super-reglas

1. Si dudás → Vertical.
2. Cero hardcoded brand en Core.
3. Promoción Core requiere reuso real, NUNCA anticipación.

---

## Aplicación

- Este OS se respeta durante 6 meses sin renegociar.
- Cualquier regla violada requiere justificación explícita en PR.
- Más de 3 violaciones en una semana → frenar y revisar dirección.
- Revisión OS v2: 6 meses post-publicación, con data real de PatiFeliz (o producto #2) launched.

**Referencias relacionadas:**
- `docs/VALTERRA-CORE-DECISION-LOCK-v1.md` — decisiones LOCKED/UNLOCKED + topics cerrados
