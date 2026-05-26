# Valterra Core · Decision Lock v1

**Estado:** LOCKED · v1
**Vigencia:** 6 meses (revisión y posible v2 al final del periodo)
**Audiencia:** founder + cualquier persona que proponga decisión arquitectónica

> Este documento contiene las decisiones formalmente cerradas y las explícitamente abiertas. Cualquier discusión sobre los items CLOSED se cierra remitiendo a este doc.

---

## 1 · Top 10 decisiones LOCKED (no se renegocian 6 meses)

| # | Decisión | Implicancia operativa |
|---|---|---|
| **L1** | **Si dudás Core vs Vertical → Vertical.** | Toda nueva feature nace en `src/domain/`. Promoción al Core requiere evidencia (scorecard >= 4/5). |
| **L2** | **Una capability sube al Core SOLO cuando aparece en 2+ productos en producción.** | No "va a usarse". Está en uso. |
| **L3** | **Un repo por producto. Un Vercel project por producto. Un Supabase project por producto.** | Cero shared databases. Cero shared runtime. Cero monorepo hasta producto #3 mínimo. |
| **L4** | **`src/platform/` NUNCA importa de `src/domain/`.** Direccionalidad estricta. | ESLint rule cuando se haga el refactor de folders. Mientras tanto, disciplina humana. |
| **L5** | **Theme config (`theme.config.ts`) es la única fuente de branding.** Cero copy ni colores hardcoded en código shared. | Cualquier hardcode en archivos Core es bug, no feature. |
| **L6** | **CSP enforce + Sentry + UptimeRobot son requisitos pre-prod no negociables.** | Sin los 3, no se llama "deploy productivo". |
| **L7** | **TypeScript strict + 0 `any` en code review.** | Casting va con `as unknown as T` + comentario justificando. |
| **L8** | **Migraciones SQL prefijadas (`CORE_NNNN` / `VERTICAL_NNNN`) con rollback header copy-paste-ready.** | Si no podés escribir el rollback, no aplicás la migración. |
| **L9** | **ADMIN_TOKEN dual auth coexistente preservado en todo producto.** | Super-admin path es Core. Cada vertical hereda el dual guard. |
| **L10** | **Promotion Scorecard >= 4/5 obligatorio para mover algo a `src/platform/`.** | PR de promoción incluye scorecard adjunto. Sin scorecard = no promotion. |

---

## 2 · Top 10 decisiones deliberadamente UNLOCKED (pendientes de validación)

| # | Decisión pendiente | Trigger para resolverla |
|---|---|---|
| **U1** | Refactor formal de folders `src/platform/` vs `src/domain/`. | Gradual durante Sprint 11 MFs cuando se toque cada archivo. NO sprint dedicado. |
| **U2** | Naming abstraction `Agency` -> `Tenant` en TypeScript. | Cuando aparezca el segundo vertical (PatiFeliz). NO refactor preventivo. |
| **U3** | Packaging strategy (template repo vs branch protegido `core-stable`). | Antes de clonar el segundo producto. Decisión binaria post Sprint 12. |
| **U4** | Cuándo extraer auth/tenant a librería interna o npm package. | Cuando se reuse en 3 productos. No antes. |
| **U5** | Monorepo (Turborepo / Nx) sí/no. | Cuando haya 3 productos vivos + dolor real de coordinación. |
| **U6** | CLI scaffolder (`npx create-valterra-product`). | Cuando se haya clonado a mano 2 productos y dueliera. |
| **U7** | Storage abstraction (Supabase Storage vs Cloudflare R2 vs S3). | Si egress Supabase supera free tier. Hoy no aplica. |
| **U8** | Email sender per-producto vs sender compartido `@valterra.com.ar`. | Cuando se compre dominio + se verifique en Resend. |
| **U9** | Tabla `tenants` unificada genérica vs tabla per-vertical (`agencies`, `clinics`). | Decisión preliminar: "tabla per-vertical con interfaz TS genérica". Pendiente validar con PatiFeliz real. |
| **U10** | Rate limit Upstash Redis sí/no. | Cuando rate limit actual falle bajo carga real (multi-región dilución). No antes. |

---

## 3 · Closed topics · NO discutir más por 6 meses

Estos 20 temas están cerrados. Si vuelven a aparecer en cualquier conversación, la respuesta es: *"locked en Decision Lock v1. Revisamos en mes 7."*

| # | Tema cerrado | Razón |
|---|---|---|
| 1 | ¿Hacer monorepo Turborepo/Nx ahora? | NO. Hasta producto #3 mínimo. |
| 2 | ¿Publicar `@valterra/core` como npm package? | NO. Hasta tener 3+ consumidores reales. |
| 3 | ¿Construir CLI scaffolder? | NO. `cp -r` + find/replace cubre los próximos 2 productos. |
| 4 | ¿Hacer Valterra Core open source? | NO. Distracción de founder time. |
| 5 | ¿White-label per agency (subdomains, theming dinámico per-tenant)? | NO. Modelo single-brand confirmado. Sprint 14+ si demanda. |
| 6 | ¿Compartir Supabase project entre productos? | NO. Antipattern letal. Un Supabase por producto. |
| 7 | ¿Migrar a Cloudflare Workers / R2 / D1? | NO. Vercel + Supabase cubren año 1. |
| 8 | ¿Implementar GraphQL / API Gateway / Service Mesh? | NO. REST + Server Actions cubren todo. |
| 9 | ¿Plugin system / lifecycle hooks? | NO. Antipattern prematuro. |
| 10 | ¿Microservicios? | NO. Monolito Next.js + Supabase escala a 100k users. |
| 11 | ¿i18n / multi-language? | NO. Argentina-only. Hardcode español-AR. |
| 12 | ¿Storybook con todos los componentes Core? | NO. Sin equipo de 5+ developers no hay ROI. |
| 13 | ¿Design system custom (Radix + tokens propios)? | NO. Tailwind v4 es el design system. |
| 14 | ¿State management library (Zustand/Redux)? | NO. Server components + URL state alcanzan. |
| 15 | ¿Cambiar el modelo de auth dual (ADMIN_TOKEN + Supabase Auth)? | NO. Funciona. Coexiste por diseño. |
| 16 | ¿Renombrar `agencies` -> `tenants` en DB ahora? | NO. Refactor cuando aparezca el segundo vertical real. |
| 17 | ¿Construir Admin Page Generator desde JSON schema? | NO. Sirena low-code. ROI negativo hasta producto #5. |
| 18 | ¿Tests E2E con Playwright AHORA? | NO. Sprint 13. Hoy no hay producto suficientemente estable. |
| 19 | ¿Stripe / MercadoPago billing integration? | NO. 0 customers paying. Premature. |
| 20 | ¿Multi-region deployment? | NO. Single region (Vercel default) hasta tracción global. |

---

## 4 · No-discussion list · respuesta canónica

Cuando aparezca cualquiera de los 20 closed topics:

> "Locked en Decision Lock v1. Revisamos en mes 7."

Si una persona insiste, agregar:

> "Si tenés evidencia nueva que cambia el costo/beneficio, documentala en `docs/DECISIONS.md` con fecha + razón. Si justifica re-evaluar antes del mes 7, abrimos PR de revisión del Lock."

Esta política existe para preservar foco y velocidad. Las decisiones tomadas son recetas validadas por experiencia industria + razonamiento explícito. Re-litigar las mismas decisiones cada sprint es el smell #1 de framework fever.

---

## 5 · Minimal execution plan · próximos 30 días

Sin frenar Valterra Inmobiliario. Sin romper producción. Orden estricto.

### Semana 1 · Disciplina mental + cierre Sprint 10

| Día | Acción | Tiempo | Tipo |
|---|---|---|---|
| 1 | Publicar `docs/VALTERRA-CORE-OS-v1.md` en el repo | 30 min | Doc |
| 1 | Publicar `docs/VALTERRA-CORE-DECISION-LOCK-v1.md` | 15 min | Doc |
| 1 | Tag git `v0.4.0-post-sprint-10-core-locked` (rollback point) | 5 min | Git |
| 2-3 | Smoke test E2E del flow invite real con Resend prod key | 2h | Validación |
| 4-5 | Cerrar quick-fix Sprint 10 (Resend prod + remove member UI + existing-user invite path) si pendiente | 4h | Vertical |

### Semana 2 · Sprint 11 MF1

| Día | Acción | Tiempo | Tipo |
|---|---|---|---|
| 6-7 | Pre-Sprint 11 Architecture Review formal — output HTML CEO + Markdown técnico | 3h | Doc |
| 8-9 | Sprint 11 MF1 · Storage foundation (bucket en Supabase + helpers nuevos · escribir directo donde corresponda según convención) | 4h | Vertical/Core orgánico |
| 10 | MF1 validation + commit + deploy preview | 2h | Deploy |

### Semana 3 · Sprint 11 MF2-MF3

| Día | Acción | Tiempo | Tipo |
|---|---|---|---|
| 11-12 | MF2 · Property CRUD service + `validateProperty.ts` (en su carpeta actual del repo · sin refactor preventivo) | 8h | Vertical |
| 13-14 | MF3 · `/admin/properties` list scoped per agency | 8h | Vertical |
| 15 | Smoke test E2E + commit + deploy | 2h | Deploy |

### Semana 4 · Sprint 11 MF4

| Día | Acción | Tiempo | Tipo |
|---|---|---|---|
| 16-18 | MF4 · Forms + image upload | 12h | Vertical |
| 19-20 | Validation + smoke test + commit + deploy | 4h | Deploy |

### Regla de refactor de carpetas

**Refactor folder a `src/platform/` queda diferido.** NO se ejecuta pre-emptivamente durante este plan.
- Cuando una MF natural toque un archivo Core (auth, notifications, theme, admin shell) y el cambio se beneficie de moverlo a `src/platform/<capability>/`, se hace en ese mismo PR.
- Si la MF no requiere tocarlo, el archivo queda donde está. Sin sprints dedicados de refactor.
- Promoción al Core sigue requiriendo scorecard >= 4/5. Esto NO cambia.

### KPIs de los 30 días

- OS v1 + Lock v1 publicados en repo
- Tag git pre-Sprint 11 creado
- Sprint 11 MF1-MF4 deployed en producción
- Valterra Real Estate operativo intacto
- Cero downtime acumulado

MF5 (public listing) y MF6 (quick-fix) quedan para mes 2.

---

## 6 · Revisión

- Revisión Lock v2: 6 meses post-publicación (mes 7 calendario).
- Trigger anticipado de revisión: PatiFeliz launched + 30 días en producción con feedback documentado.
- Cambios mid-period requieren PR explícito que documente: trigger nuevo + evidencia + alternativas consideradas.

**Referencias relacionadas:**
- `docs/VALTERRA-CORE-OS-v1.md` — manual operativo diario
