# Pre-Sprint 10 · Architecture Review · Grupo Valterra

> Auditoría técnica completa, modelo objetivo, micro-fases, rollback plan y safety checklist. Read-only. Sin código.

**Autor:** CTO / Staff Engineer / Platform Architect
**Fecha:** 2026-05-23
**Estado del proyecto:** Sprint 9.5 cerrado · production hardened (Sentry + CSP + Resend + agency_id canónico)
**Próximo:** Sprint 10 · Multi-Tenant Foundation

---

## Índice

1. Contexto
2. Análisis de DB
3. Modelo objetivo · agencies / agents / properties / leads
4. ERD textual
5. Estrategia RLS futura
6. Estrategia auth
7. Sprint 10 · micro-fases detalladas
8. Rollback plan por MF
9. Safety checklist consolidado
10. Decisión final + justificación
11. Plan de ejecución MF1-MF6

---

## 1. Contexto

Grupo Valterra completó Sprint 9 (properties reales) y Sprint 9.5 (production hardening). El siguiente paso natural es abrir el modelo para que otras inmobiliarias del litoral puedan operar dentro de la plataforma (modelo marketplace single-brand).

Antes de tocar código de Sprint 10, este documento valida que la arquitectura actual soporte el cambio sin generar deuda técnica compuesta, y diseña la implementación en slices pequeños deployables.

**Decisión estratégica previa al diseño:** marketplace single-brand (todas las inmobiliarias bajo `valterra.com.ar`, branding único). White-label SaaS (subdominios + branding dinámico per-tenant) se posterga a Sprint 13+ si hay demanda comercial.

---

## 2. Análisis de DB

### Estado actual (post Sprint 9.5)

**Tabla `leads`** (migración 0001 + rename 0003):

| Columna | Tipo | Notas multi-tenant |
|---|---|---|
| `id` | text PK | Formato `LEAD-YYYYMMDD-XXXXXX` |
| `created_at`, `updated_at` | timestamptz | Trigger `set_updated_at()` |
| `name`, `phone`, `email`, `message` | text | Datos del visitante |
| `property_slug`, `property_title` | text | Denormalizado para no necesitar JOIN al mostrar lead |
| `agent_name` | text | Hoy hardcoded "Equipo Valterra" |
| `source`, `status` | text CHECK | Enums controlados |
| **`agency_id`** | **uuid nullable** | **Renombrado en 0003 desde `inmobiliaria_id`. Sin FK aún.** |
| `agent_id` | uuid | Nullable, sin FK. Reservado para Sprint 10 |

Índices: `leads_created_at_idx`, `leads_status_idx`, `leads_source_idx`, **`leads_agency_idx`** (post 0003).

RLS: enabled, sin policies (deny-all).

**Tabla `properties`** (migración 0002):

| Columna | Tipo | Notas multi-tenant |
|---|---|---|
| `id` | text PK | |
| `slug` | text UNIQUE | |
| `title`, `description` | text | |
| `price`, `currency`, `per_month`, `operation_type`, `property_type` | varios | |
| `city`, `neighborhood`, `province`, `country`, `address` | text | |
| `lat`, `lng` | numeric(10,7) | Ready Sprint 11 mapa |
| `bedrooms`, `bathrooms`, `parking`, `covered_area_m2`, `total_area_m2` | numéricos | |
| `badges`, `gallery` | text[] | |
| `cover_image` | text | URL hoy Unsplash |
| `agent_name`, `agent_phone` | text | Denormalizado, hardcoded "Equipo Valterra" en seed |
| **`agency_id`** | **uuid nullable** | **Hook multi-tenant. Sin FK aún.** |
| `published`, `featured`, `featured_order` | bool/int | |

Índices: `properties_pkey`, `properties_slug_key`, `properties_home_idx`, `properties_operation_type_idx`, `properties_city_idx`, **`properties_agency_idx`**.

RLS: enabled, sin policies.

### Qué ya soporta multi-tenant

- Ambas tablas tienen `agency_id` con índice.
- RLS habilitado en ambas (deny-all default).
- Patrón de naming canónico (`agency_id` en ambas).
- Service layer (`mock-leads.ts`, `properties.ts`) usa SERVICE_ROLE → bypassa RLS sin romperse.
- Filter pattern en `PropertyFilters` ya admite extensión.

### Qué no soporta todavía

- Tabla `agencies` inexistente.
- FK no existe en `agency_id` (porque no hay referenced table).
- Seed properties tiene `agency_id = NULL` en las 6 filas iniciales.
- Service `addLead` nunca setea `agency_id`.
- `/admin/leads` no filtra por `agency_id`.
- No hay tabla de auth de usuarios (Supabase Auth está disponible vía `auth.users` pero no se está usando).

---

## 3. Modelo objetivo Sprint 10

MVP clean, sin overengineering. Decisiones explícitas:

### Tabla `agencies` (nueva)

```
id              uuid PK default gen_random_uuid()
slug            text unique not null     -- URL identifier: 'valterra', 'inmobiliaria-corrientes'
name            text not null
legal_name      text
cuit            text                     -- CUIT empresa
matricula       text                     -- Matrícula de corredor
contact_email   text
contact_phone   text
whatsapp        text
address         text
city            text
province        text
logo_url        text                     -- Supabase Storage, opcional Sprint 11
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

### Tabla `agency_members` (nueva)

Relación N:M entre `auth.users` (Supabase Auth) y `agencies`.

```
agency_id    uuid not null references agencies(id) on delete cascade
user_id      uuid not null references auth.users(id) on delete cascade
role         text not null check (role in ('owner','admin','agent','viewer'))
invited_at   timestamptz
joined_at    timestamptz
PRIMARY KEY (agency_id, user_id)
```

### Tabla `properties` · ALTER

- ADD CONSTRAINT FK `agency_id` REFERENCES `agencies(id)` ON DELETE RESTRICT (no permitir eliminar agency con properties activas)
- ALTER `agency_id SET NOT NULL` después del backfill
- ADD COLUMN `agent_user_id uuid REFERENCES auth.users(id)` (asignación opcional al agente que la lista; null = sin asignar)

### Tabla `leads` · ALTER

- ADD CONSTRAINT FK `agency_id` REFERENCES `agencies(id)` ON DELETE SET NULL (lead persiste si la agency desaparece)
- ADD COLUMN `assigned_to_user_id uuid REFERENCES auth.users(id)` (agente que toma el lead)
- `agency_id` queda nullable: leads de "consulta general" sin property atribuible caen al super-admin Valterra

### Tabla `agents` · NO crear en Sprint 10

Un agent es un `auth.users` con membership `role = 'agent'`. Datos profesionales (bio, foto, languages) van en `auth.users.raw_user_meta_data` o se posterga a tabla separada en Sprint 11 con profile management.

### Por qué denormalizamos `agent_name`, `agent_phone` en `properties` y `leads`

Decisión deliberada. Cuando se crea una property se snapshotea el nombre y teléfono del agente. Razones:

1. Soporta listados públicos sin necesidad de JOIN a `auth.users` (que tiene RLS estricta).
2. Si el agente se va de la agency o cambia de teléfono, el listing histórico no se rompe.
3. Mantiene SSR pages estáticas y cacheables.

Costo aceptado: duplicación. Mitigación: documentar como "snapshot agente al momento de publicar".

### Ownership model

| Rol | Properties | Leads | Members | Agency settings |
|---|---|---|---|---|
| **super-admin** Valterra | CRUD todas | CRUD todos | Invite + remove | Crea + elimina agencies |
| **owner** agency | CRUD propias | CRUD propias | Invite + role-change + remove | Editar agency |
| **admin** agency | CRUD propias | CRUD propias | Invite + role-change | — |
| **agent** agency | Read all · CRUD asignadas | CRUD asignadas | — | — |
| **viewer** agency | Read only | Read only | — | — |

### Public vs Private boundaries

| Endpoint | Quién | Filtro server-side |
|---|---|---|
| `GET /api/properties` | anon | `published = true` |
| `GET /api/properties/[slug]` | anon | `published = true` |
| `POST /api/contact` | anon | Infiere `agency_id` desde `propertySlug` o defaultea a Valterra |
| `GET /api/admin/properties` | authenticated | Scoped a `agency_id` del user |
| `GET /api/admin/leads` | authenticated | Scoped a `agency_id` del user |
| `/admin/*` | authenticated + miembro de al menos 1 agency | Scoped + role-checked |
| `/super-admin/*` | super-admin Valterra (rol especial) | Acceso total |

---

## 4. ERD textual

```
                        Supabase Auth
                        (gestionada por Supabase, no migrable)
                            ┌──────────┐
                            │ auth.users│
                            └─────┬─────┘
                                  │
                                  │ user_id (FK)
                                  ▼
                       ┌─────────────────────┐
                       │  agency_members     │
                       │  - agency_id        │
                       │  - user_id          │
                       │  - role             │
                       │  PK(agency, user)   │
                       └──────────┬──────────┘
                                  │ agency_id (FK)
                                  ▼
                           ┌──────────────┐
                           │  agencies    │
                           │  - id (PK)   │
                           │  - slug      │
                           │  - name      │
                           │  - cuit      │
                           │  - whatsapp  │
                           │  - logo_url  │
                           │  ...         │
                           └──────┬───────┘
                                  │ id
              ┌───────────────────┼───────────────────┐
              │                                       │
              │ agency_id (FK RESTRICT)               │ agency_id (FK SET NULL)
              ▼                                       ▼
       ┌────────────────────┐               ┌────────────────────┐
       │   properties       │               │   leads            │
       │   - id (PK)        │               │   - id (PK)        │
       │   - slug UNIQUE    │               │   - agency_id      │
       │   - agency_id      │               │   - assigned_to_   │
       │   - agent_user_id  │               │     user_id (FK)   │
       │     (FK auth.users)│               │   - property_slug  │
       │   - title, price   │               │     (denormalized) │
       │   - lat, lng       │               │   - name, phone    │
       │   - published      │               │   - status         │
       │   - featured       │               │   ...              │
       │   ...              │               │                    │
       └────────────────────┘               └────────────────────┘
```

---

## 5. Estrategia RLS futura

### Principios

1. **deny-all default** (ya activo). Cada policy se agrega explícita.
2. **anon** solo puede leer datos públicos (`published = true`).
3. **authenticated** ve sus propios datos (scoping por membership).
4. **SERVICE_ROLE** bypassa todo (mantiene el modelo server-side actual funcionando intacto).
5. **Policies expresadas en función de `auth.uid()`** que es la primitiva de Supabase Auth.

### Policies properties

```sql
-- anon: solo published
create policy "anon select published"
  on properties for select
  to anon
  using (published = true);

-- authenticated: ve propios + published (para preview en otra agency)
create policy "authenticated select own + published"
  on properties for select
  to authenticated
  using (
    published = true
    or agency_id in (select agency_id from agency_members where user_id = auth.uid())
  );

-- authenticated write con role
create policy "members write own agency"
  on properties for insert
  to authenticated
  with check (
    agency_id in (
      select agency_id from agency_members
      where user_id = auth.uid() and role in ('owner','admin','agent')
    )
  );

create policy "members update own agency"
  on properties for update
  to authenticated
  using (
    agency_id in (
      select agency_id from agency_members
      where user_id = auth.uid() and role in ('owner','admin','agent')
    )
  );

create policy "owner/admin delete own agency"
  on properties for delete
  to authenticated
  using (
    agency_id in (
      select agency_id from agency_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );
```

### Policies leads

```sql
-- anon: NO select. Sin policy = denegado por default.
-- (los leads no son públicos)

-- authenticated: ve propios
create policy "members select own agency leads"
  on leads for select
  to authenticated
  using (
    agency_id in (select agency_id from agency_members where user_id = auth.uid())
  );

-- authenticated: actualiza status de leads propios
create policy "members update own agency leads"
  on leads for update
  to authenticated
  using (
    agency_id in (
      select agency_id from agency_members
      where user_id = auth.uid() and role in ('owner','admin','agent')
    )
  );

-- INSERT: nunca client-direct, siempre vía /api/contact server-side con SERVICE_ROLE.
```

### Policies agencies

```sql
-- anon: lectura pública limitada (name, slug, logo_url para attribution)
create policy "anon select public agency info"
  on agencies for select
  to anon
  using (true);
-- (filtrar columnas sensibles via view o select específico en service)

-- authenticated: ve agencies donde es miembro
create policy "members select own agency full"
  on agencies for select
  to authenticated
  using (id in (select agency_id from agency_members where user_id = auth.uid()));

-- owner/admin actualiza agency
create policy "owner/admin update agency"
  on agencies for update
  to authenticated
  using (
    id in (
      select agency_id from agency_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );
```

### Policies agency_members

```sql
-- self-view: cada user ve sus propias memberships
create policy "self select memberships"
  on agency_members for select
  to authenticated
  using (user_id = auth.uid());

-- owners ven todos los members de su agency
create policy "owners select agency members"
  on agency_members for select
  to authenticated
  using (
    agency_id in (
      select agency_id from agency_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- owners gestionan memberships
create policy "owners manage members"
  on agency_members for all
  to authenticated
  using (
    agency_id in (
      select agency_id from agency_members
      where user_id = auth.uid() and role = 'owner'
    )
  );
```

---

## 6. Estrategia auth

### Decisión: Supabase Auth con `@supabase/ssr`

Razones para preferirla sobre NextAuth:

1. RLS native: `auth.uid()` está disponible en SQL sin glue extra.
2. Magic link out-of-box (sin SMTP propio en MVP).
3. Google OAuth fácil de sumar después.
4. Session managed por Supabase, cookies HTTP-only seteadas por el SDK.
5. Menos dependencias (no NextAuth ni adapter).
6. Refresh tokens automáticos.

### Plan de coexistencia ADMIN_TOKEN ↔ Supabase Auth

Sprint 10 NO elimina ADMIN_TOKEN. Coexisten así:

| Rol | Mecanismo |
|---|---|
| **super-admin Valterra** | Cookie ADMIN_TOKEN (legacy, sigue funcionando) **O** Supabase Auth user con rol super-admin (nuevo) |
| **owner / admin / agent / viewer** de cualquier agency | Solo Supabase Auth |

Middleware actualizado:
- Si la request lleva cookie `valterra-admin-session` (ADMIN_TOKEN) → super-admin path
- Si la request lleva session Supabase → resolver `auth.uid()` y memberships
- Si no lleva ninguna → redirect `/admin/login`

Sprint 11 deprecará ADMIN_TOKEN cuando exista user super-admin Valterra en Supabase Auth.

### Flujo de auth user típico (post Sprint 10)

1. Owner se invita desde `/super-admin/agencies` o `/admin/[agency]/members`.
2. Resend envía email con magic link `https://valterra.app/admin/invitation/[token]`.
3. User entra al link → Supabase Auth crea user + session.
4. App valida que `agency_members(user_id, agency_id, role)` existe.
5. Redirect a `/admin/[agency]/leads`.

---

## 7. Sprint 10 · micro-fases detalladas

### MF1 · Agencies + Auth foundation

**Objetivo:** crear tablas `agencies` + `agency_members`. Integrar Supabase Auth con `@supabase/ssr`. ADMIN_TOKEN coexiste.

**Archivos probables:**
- `supabase/migrations/0004_agencies_and_members.sql` (nuevo)
- `src/lib/supabase-server.ts` (nuevo · helpers `createServerClient`, `createMiddlewareClient`)
- `src/lib/auth.ts` (nuevo · `getCurrentUser`, `getCurrentMemberships`)
- `.env.example` (+ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `package.json` (+ `@supabase/ssr`)

**Validación:**
- `npm run typecheck` + `npm run lint`
- Crear test agency en Supabase Studio + verificar select retorna
- Healthcheck `/api/health` sigue OK

**Criterio de cierre:** tablas creadas, helpers tipados, env vars documentadas, build verde.

### MF2 · Seed Valterra + FK + RLS policies

**Objetivo:** INSERT agency "Grupo Valterra" + super-admin user (manual desde Studio). Backfill `properties.agency_id` y `leads.agency_id`. ALTER FK + NOT NULL en properties. RLS policies anon/authenticated.

**Archivos probables:**
- `supabase/migrations/0005_fk_rls_backfill.sql` (nuevo)
- `supabase/seed-agency-valterra.sql` (nuevo)

**Validación:**
- Antes del ALTER NOT NULL: `select count(*) from properties where agency_id is null` debe ser 0
- Probar GET `/api/properties` desde anon — debe seguir devolviendo las 6 published
- Probar GET `/admin/leads` con cookie ADMIN_TOKEN — debe seguir mostrando todo (SERVICE_ROLE bypass)

**Criterio de cierre:** properties.agency_id NOT NULL, 4 policies activas en properties, 2 policies en leads, queries actuales no rotas.

### MF3 · Login Supabase Auth + middleware refresh

**Objetivo:** `/admin/login` soporta magic link Supabase + mantiene fallback ADMIN_TOKEN. Middleware refresh de session via `createMiddlewareClient`. `getCurrentUser()` server-side helper.

**Archivos probables:**
- `src/middleware.ts` (modificado)
- `src/app/admin/login/page.tsx` (modificado)
- `src/app/admin/login/LoginForm.tsx` (modificado)
- `src/app/admin/login/actions.ts` (modificado · `loginAction` ahora intenta Supabase Auth primero, fallback ADMIN_TOKEN)
- `src/components/admin/LogoutButton.tsx` (modificado)
- Nueva ruta `/auth/callback` para procesar magic link

**Validación:**
- Magic link → entra usuario → session creada
- Login viejo con ADMIN_TOKEN sigue funcionando
- Middleware no introduce loops de redirect
- Logout limpia ambos paths

**Criterio de cierre:** dos paths de auth funcionando, smoke test E2E manual OK.

### MF4 · Per-agency admin scoping

**Objetivo:** `/admin/leads` y nuevo `/admin/properties` filtran por `agency_id` del user. AgencySwitcher si user tiene >1 membership. Services aceptan `agencyId` filter.

**Archivos probables:**
- `src/services/mock-leads.ts` (modificado · `getAllLeads({ agencyId? })`)
- `src/services/properties.ts` (modificado · `PropertyFilters` suma `agencyId`)
- `src/app/admin/leads/page.tsx` (modificado · scoped query)
- `src/app/admin/properties/page.tsx` (nuevo · listado per agency)
- `src/app/admin/properties/[id]/edit/page.tsx` (nuevo · edit form básico)
- `src/components/admin/AgencySwitcher.tsx` (nuevo)
- `src/components/admin/properties/PropertyForm.tsx` (nuevo)

**Validación:**
- Super-admin ve todo
- Owner agency X ve solo leads/properties de X
- Cambio de agency en switcher refresca correctamente

**Criterio de cierre:** scoping verificado para los 3 roles, sin privacy leak.

### MF5 · Lead → agency wiring + notification per-agency

**Objetivo:** `/api/contact` infiere `agency_id` desde `propertySlug` (lookup en properties). Si no viene propertySlug → defaultea a Valterra. `notifyNewLead()` resuelve email destinatario desde `agency.contact_email`.

**Archivos probables:**
- `src/app/api/contact/route.ts` (modificado)
- `src/services/mock-leads.ts` (modificado · `addLead` acepta `agencyId`)
- `src/lib/notifications.ts` (modificado · `notifyNewLead(lead, agency)` resuelve recipient)
- Nuevo helper `src/services/agencies.ts` (`getAgencyBySlug`, `getAgencyById`)

**Validación:**
- Lead desde property X → `lead.agency_id = X.agency_id`
- Email va a `agency.contact_email`, no al global
- Lead general (sin propertySlug) → fallback Valterra
- Failure de lookup agency → fallback al global

**Criterio de cierre:** lead attribution funciona end-to-end con notificación correcta.

### MF6 · Onboarding agency + invites

**Objetivo:** `/super-admin/agencies` (super-admin crea + invita owners). `/admin/[agency]/members` (owners/admins invitan members). Emails de invitación via Resend con magic link.

**Archivos probables:**
- `src/app/super-admin/agencies/page.tsx` (nuevo · listado)
- `src/app/super-admin/agencies/new/page.tsx` (nuevo · form)
- `src/app/admin/[agency]/members/page.tsx` (nuevo)
- `src/app/admin/invitation/[token]/page.tsx` (nuevo · claim)
- `src/lib/invitations.ts` (nuevo · generate token + send email)
- `src/services/agencies.ts` (modificado · CRUD methods)

**Validación:**
- Crear agency desde super-admin → aparece en BD
- Invitar owner por email → email llega → click link → user joineado
- Owner invita agent → mismo flow
- Tokens expiran (TTL 7 días)

**Criterio de cierre:** onboarding completo de una agency nueva + 1 agent via emails. Sin tocar SQL manualmente después de MF1.

---

## 8. Rollback plan por MF

Cada MF tiene rollback documentado en el header de su migración SQL y en su PR description.

| MF | Rollback |
|---|---|
| MF1 | `DROP TABLE agency_members; DROP TABLE agencies;` + revert helpers TS |
| MF2 | DROP policies + ALTER DROP CONSTRAINT FK + ALTER `agency_id DROP NOT NULL` + DELETE backfill |
| MF3 | Revert middleware + login files. Cookie ADMIN_TOKEN sigue intacta como fallback de emergencia |
| MF4 | Revert pages + services. RLS sigue siendo la defensa real |
| MF5 | Revert 3 archivos. Service vuelve a no setear `agency_id` (leads quedan con NULL hasta backfill manual) |
| MF6 | Hide pages (route no expuesto) o feature-flag con env `ENABLE_INVITATIONS=false` |

### Rollback total Sprint 10

Si en cualquier momento se necesita volver al estado pre-Sprint 10:

```bash
git reset --hard v0.3.0-pre-sprint-10
git push --force-with-lease origin main
```

Plus rollback de migrations 0004, 0005, 0006... aplicadas en Supabase (cada una con SQL inverso documentado).

Vercel mantiene los deploys anteriores → 1-click "Promote previous" recupera el estado anterior sin tocar git.

---

## 9. Safety checklist consolidado

### Schema safety

- [ ] Cada migration con `IF NOT EXISTS` / `IF EXISTS` idempotente
- [ ] Backfill SEPARADO de schema change (migration distinta)
- [ ] Constraint NOT NULL aplicado SOLO después de backfill verificado con SELECT count
- [ ] Rollback SQL escrito en header del archivo migration

### Migration safety

- [ ] Aplicar en horario bajo tráfico (no horario pico)
- [ ] Aplicar primero en branch preview / proyecto Supabase staging si existe
- [ ] Validar con queries de smoke test antes de marcar OK
- [ ] Tener `psql` rollback comando copy-paste listo

### Rollback safety

- [ ] Git tag `v0.3.0-pre-sprint-10` antes de empezar
- [ ] Branches por MF: `feature/sprint-10-mf{N}`
- [ ] Merge a `main` SOLO post smoke test en preview Vercel
- [ ] Vercel deploy anterior siempre verde para "Promote previous"

### Type safety

- [ ] 0 `any` en código nuevo (eslint strict)
- [ ] `rowToAgency`, `rowToMember` strict mappers
- [ ] Schema sync: interfaces TS coinciden con migration SQL
- [ ] `npm run typecheck` PASS antes de cada commit

### Production safety

- [ ] **PRE-REQUISITO**: CSP enforce switch (post 48h Sprint 9.5)
- [ ] **PRE-REQUISITO**: UptimeRobot apuntado a `/api/health` con alerta degraded > 5min
- [ ] Sentry release tag por MF (`release: "sprint-10-mf1"` en `sentry.server.config.ts`)
- [ ] Smoke test E2E post-deploy de cada MF

### Deploy safety

- [ ] 1 commit por MF (revisable, revertible individualmente)
- [ ] Preview deploy Vercel verde por PR
- [ ] Env vars nuevas documentadas en `.env.example` ANTES del push
- [ ] No batchear MF — cada uno se valida solo antes del siguiente
- [ ] Lint + typecheck verde antes del push

---

## 10. Decisión final + justificación

### Opciones evaluadas

**A) Entrar directo a Sprint 10 MF1**
- ✓ Velocidad: arrancás hoy
- ✗ Sin red de seguridad operativa: CSP en Report-Only (no protege), sin uptime monitor, sin punto de rollback
- ✗ Si MF3 (auth) rompe producción, te enterás por WhatsApp del usuario

**B) Ejecutar micro-hardening previo (~17 min) → Sprint 10 MF1**
- ✓ Sprint 10 con red de seguridad completa
- ✓ Rollback total = 1 comando
- ✓ Uptime monitor avisa antes que un usuario reclame
- ✓ CSP enforce protege real
- ✗ +17 min antes de arrancar implementación

### Recomendación final: **B**

**Por qué B:**

Los 3 ítems no son código, son operaciones. Pero si arrancás Sprint 10 sin ellos, vas a estar volando ciego cuando algo se rompa. Sprint 10 toca **DB + auth + middleware** — los 3 componentes más sensibles del proyecto. Entrás al momento más complejo del año sin red de seguridad operativa. Es contraproducente para un proyecto con ambición de escalar.

El costo de **B** es 17 minutos. El costo de NO hacer **B** es:

- 30 minutos a 4 horas debuggeando rollback no atómico si algo falla.
- Posible downtime sin alerta automática.
- Headers CSP que no protegen (security teatro).

**Cost-benefit obvio.** B gana por mucho.

### Los 3 micro-hardenings previos a Sprint 10

| # | Acción | Tiempo | Por qué |
|---|---|---|---|
| 1 | CSP enforce switch en `next.config.ts` (rename `Content-Security-Policy-Report-Only` → `Content-Security-Policy`) | 5 min | Pasaron 48h de observación post Sprint 9.5. Sin enforce, CSP no protege |
| 2 | UptimeRobot monitor cada 5 min apuntado a `/api/health` con alerta `status != ok` | 10 min | Sprint 10 puede romper auth en producción. Querés enterarte vos antes que un usuario |
| 3 | `git tag v0.3.0-pre-sprint-10 && git push --tags` | 2 min | Rollback total atómico. 1 comando para volver al estado actual |

---

## 11. Plan de ejecución MF1-MF6

| # | MF | Días | Risk | Output |
|---|---|---|---|---|
| MF1 | Agencies + Auth foundation | 2 | LOW | Tablas + helpers + Supabase Auth listo |
| MF2 | Seed Valterra + FK + RLS | 2 | MEDIUM | Backfill + constraints + 6+ policies activas |
| MF3 | Login Supabase + middleware | 3 | MEDIUM | Magic link funcionando + ADMIN_TOKEN coexistente |
| MF4 | Per-agency admin scoping | 3 | MEDIUM | /admin/leads y /admin/properties scoped + AgencySwitcher |
| MF5 | Lead → agency wiring + notif | 1 | LOW | Lead attribution + email per agency |
| MF6 | Onboarding + invites | 3 | LOW | Super-admin crea agencies + owners invitan members |

**Total: 14 días de trabajo · ~3 semanas calendario con review/testing.**

### Criterios de cierre Sprint 10

- [ ] 3 agencies en producción (incluyendo Valterra)
- [ ] Al menos 2 agency owners externos invitados y operativos
- [ ] Properties multi-agency visible en home con attribution correcta
- [ ] Leads creados desde el form correctamente atribuidos a la agency dueña de la property
- [ ] Notificación email per agency funcionando
- [ ] Super-admin Valterra sigue viendo TODO desde su rol especial
- [ ] Zero downtime durante el sprint
- [ ] Migrations 0004, 0005, 0006 aplicadas + rollback documentado
- [ ] CHANGELOG-sprint-10.md + IMPLEMENTATION-REPORT.html + DEPLOY-CHECKLIST.md publicados
