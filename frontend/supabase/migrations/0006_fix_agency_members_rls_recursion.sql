-- ==========================================================
-- Migración 0006: fix VALTERRA-BUG-001 — recursión infinita
-- de RLS en agency_members (42P17)
-- ==========================================================
-- Bug: las policies "managers select agency members" y
-- "owners manage members" (0005) consultan agency_members
-- dentro de su propio USING/WITH CHECK. Cualquier query de un
-- rol `authenticated` sobre agency_members / leads / properties
-- dispara la evaluación recursiva de esas policies →
--   ERROR 42P17: infinite recursion detected in policy for
--   relation "agency_members"
-- Confirmado en producción (QA-SCOPE-04, 2026-07-25) y en
-- PostgreSQL 16 local con las migraciones reales.
--
-- Efecto en la app: getCurrentMemberships() (lib/auth.ts, cliente
-- ANON+sesión que respeta RLS) recibe el error, lo captura y
-- devuelve [] → todo miembro de agencia no-super-admin cae en
-- notFound() (404) al entrar a /admin. Multi-tenant no funcional.
--
-- Estrategia del fix (mínima):
--   1. UNA función helper `public.auth_memberships()`:
--      SECURITY DEFINER (owner postgres → lee agency_members sin
--      RLS), SIN parámetros (deriva TODO de auth.uid(); no acepta
--      user_id ni agency_id ajenos), STABLE, search_path fijado a
--      '' (toda referencia schema-qualified → inmune a hijacking),
--      EXECUTE revocado de PUBLIC/anon y otorgado SOLO a
--      authenticated. Devuelve únicamente (agency_id, role) del
--      usuario actual; con auth.uid() NULL devuelve 0 filas.
--   2. Reescritura de las 9 policies que consultaban
--      agency_members por subselect, usando el helper. Semántica
--      IDÉNTICA a 0005 (mismos roles por operación).
--   3. Se PRESERVAN sin tocar: "anon select published properties",
--      "anon select agencies public", "self select memberships".
--   4. CAMBIO-AUT-1 (único cambio de autorización, señalado):
--      nueva policy "authenticated select agencies public"
--      (SELECT to authenticated USING true). Motivo: 0005 solo
--      daba SELECT de agencies a `anon`; el rol `authenticated`
--      no podía leer agencies, por lo que el embed
--      agency_members→agencies(slug,name) de getCurrentMemberships
--      devolvía null y la app descartaba la membership igual.
--      Alcance: expone a usuarios logueados la MISMA información
--      pública que ya ve cualquier visitante anónimo (USING true,
--      igual que la policy anon vigente). No amplía acceso a
--      properties/leads/members.
--
-- Sin SQL dinámico. Sin cambios de datos. Idempotente
-- (drop policy if exists / create or replace function).
--
-- Aplicar: Supabase Studio → SQL Editor → pegar TODO → Run
-- (previa autorización del dueño; guardar evidencia antes/después:
--  grilla de pg_policies + resultado de verify_0006_rls.sql local).
-- ==========================================================

-- ----------------------------------------------------------
-- 1. HELPER — memberships del usuario actual, sin RLS
-- ----------------------------------------------------------
create or replace function public.auth_memberships()
returns table (agency_id uuid, role text)
language sql
security definer
stable
set search_path = ''
as $$
  select m.agency_id, m.role
    from public.agency_members m
   where m.user_id = (select auth.uid())
$$;

comment on function public.auth_memberships() is
  'Fix VALTERRA-BUG-001 (0006): memberships del usuario autenticado actual, leídas sin RLS (SECURITY DEFINER, owner postgres) para cortar la recursión 42P17 de las policies. Sin parámetros: todo deriva de auth.uid(). search_path vacío. EXECUTE solo para authenticated.';

alter function public.auth_memberships() owner to postgres;
revoke all on function public.auth_memberships() from public;
revoke all on function public.auth_memberships() from anon;
grant execute on function public.auth_memberships() to authenticated;

-- ----------------------------------------------------------
-- 2. AGENCY_MEMBERS — se preserva "self select memberships";
--    se reescriben las dos policies recursivas
-- ----------------------------------------------------------
drop policy if exists "managers select agency members" on public.agency_members;
create policy "managers select agency members"
  on public.agency_members for select
  to authenticated
  using (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin')
    )
  );

drop policy if exists "owners manage members" on public.agency_members;
create policy "owners manage members"
  on public.agency_members for all
  to authenticated
  using (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role = 'owner'
    )
  )
  with check (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role = 'owner'
    )
  );

-- ----------------------------------------------------------
-- 3. LEADS — mismas reglas de 0005, vía helper
-- ----------------------------------------------------------
drop policy if exists "members select own leads" on public.leads;
create policy "members select own leads"
  on public.leads for select
  to authenticated
  using (
    agency_id in (select am.agency_id from public.auth_memberships() am)
  );

drop policy if exists "members update own leads" on public.leads;
create policy "members update own leads"
  on public.leads for update
  to authenticated
  using (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin','agent')
    )
  )
  with check (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin','agent')
    )
  );

-- ----------------------------------------------------------
-- 4. PROPERTIES — mismas reglas de 0005, vía helper
--    ("anon select published properties" NO se toca)
-- ----------------------------------------------------------
drop policy if exists "members select own properties" on public.properties;
create policy "members select own properties"
  on public.properties for select
  to authenticated
  using (
    published = true
    or agency_id in (select am.agency_id from public.auth_memberships() am)
  );

drop policy if exists "members insert own properties" on public.properties;
create policy "members insert own properties"
  on public.properties for insert
  to authenticated
  with check (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin','agent')
    )
  );

drop policy if exists "members update own properties" on public.properties;
create policy "members update own properties"
  on public.properties for update
  to authenticated
  using (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin','agent')
    )
  )
  with check (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin','agent')
    )
  );

drop policy if exists "managers delete own properties" on public.properties;
create policy "managers delete own properties"
  on public.properties for delete
  to authenticated
  using (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin')
    )
  );

-- ----------------------------------------------------------
-- 5. AGENCIES — "anon select agencies public" NO se toca;
--    "managers update agency" vía helper; + CAMBIO-AUT-1
-- ----------------------------------------------------------
drop policy if exists "managers update agency" on public.agencies;
create policy "managers update agency"
  on public.agencies for update
  to authenticated
  using (
    id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin')
    )
  )
  with check (
    id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin')
    )
  );

-- CAMBIO-AUT-1: lectura pública de agencies para authenticated
-- (misma visibilidad que ya tiene anon; necesario para que el
--  embed agencies(slug,name) de getCurrentMemberships devuelva
--  datos y la membership no se descarte en la app).
drop policy if exists "authenticated select agencies public" on public.agencies;
create policy "authenticated select agencies public"
  on public.agencies for select
  to authenticated
  using (true);

-- ==========================================================
-- ROLLBACK (documentado — NO automático)
-- ==========================================================
-- 0006 crea: función public.auth_memberships() + 10 policies
-- (9 reescritas + 1 nueva). Volver atrás = drop de la policy
-- nueva, drop de las 9 reescritas, recreación VERBATIM de las 9
-- de 0005 (ver bloque de rollback en 0005/este archivo del repo)
-- y drop function public.auth_memberships().
-- ⚠️ Volver a 0005 REINTRODUCE VALTERRA-BUG-001 (42P17): solo
-- tiene sentido como paso previo a un fix alternativo, nunca como
-- estado final. Evidencia a guardar antes y después de aplicar en
-- producción: (a) grilla completa de pg_policies de las 4 tablas,
-- (b) atributos de la función (secdef/search_path/ACL),
-- (c) resultado del verify_0006_rls.sql en el entorno local,
-- (d) para el after: getCurrentMemberships funcional con un user
--     member real (QA-SCOPE-02) sin 42P17 en logs.
-- ==========================================================
