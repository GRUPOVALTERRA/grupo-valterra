-- ==========================================================
-- Migracion 0005: FK + RLS multi-tenant + backfill Valterra
-- Sprint 10 MF2
-- ==========================================================
-- Pre-requisito: 0004 aplicada + seed-agency-valterra.sql ejecutado
-- (debe existir 1 row en public.agencies con slug='valterra').
--
-- Operaciones (todas en una sola transaccion implicita):
--   1. Backfill properties.agency_id = valterra.id WHERE NULL
--   2. Backfill leads.agency_id      = valterra.id WHERE NULL
--   3. ALTER properties ADD FK agency_id (ON DELETE RESTRICT)
--   4. ALTER leads      ADD FK agency_id (ON DELETE SET NULL)
--   5. ALTER properties.agency_id SET NOT NULL
--   6. ENABLE RLS en agencies + agency_members (properties/leads ya activo)
--   7. CREATE POLICIES (anon + authenticated)
--
-- Cero impacto runtime: todos los API routes usan SERVICE_ROLE_KEY que
-- bypassa RLS. Las policies activas son defense-in-depth y preparacion
-- para Sprint 10 MF3+ (queries server-side via anon + session).
--
-- Aplicar:
--   Supabase Studio - SQL Editor - copiar/pegar - Run
--
-- Rollback (orden inverso, ejecutar todo en bloque):
-- ----------------------------------------------------------
--   drop policy if exists "anon select published properties" on public.properties;
--   drop policy if exists "members select own properties" on public.properties;
--   drop policy if exists "members insert own properties" on public.properties;
--   drop policy if exists "members update own properties" on public.properties;
--   drop policy if exists "managers delete own properties" on public.properties;
--   drop policy if exists "members select own leads" on public.leads;
--   drop policy if exists "members update own leads" on public.leads;
--   drop policy if exists "anon select agencies public" on public.agencies;
--   drop policy if exists "managers update agency" on public.agencies;
--   drop policy if exists "self select memberships" on public.agency_members;
--   drop policy if exists "managers select agency members" on public.agency_members;
--   drop policy if exists "owners manage members" on public.agency_members;
--   alter table public.agencies        disable row level security;
--   alter table public.agency_members  disable row level security;
--   alter table public.properties      alter column agency_id drop not null;
--   alter table public.properties      drop constraint if exists properties_agency_id_fkey;
--   alter table public.leads           drop constraint if exists leads_agency_id_fkey;
--   update public.properties set agency_id = null where agency_id = (select id from public.agencies where slug = 'valterra');
--   update public.leads      set agency_id = null where agency_id = (select id from public.agencies where slug = 'valterra');
-- ==========================================================

-- ----------------------------------------------------------
-- Guard: Valterra debe existir antes de continuar
-- ----------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.agencies where slug = 'valterra';
  if v_id is null then
    raise exception 'Pre-requisito faltante: agency slug=valterra no existe. Aplicar seed-agency-valterra.sql primero.';
  end if;
end $$;

-- ----------------------------------------------------------
-- 1-2. BACKFILL
-- ----------------------------------------------------------
update public.properties
   set agency_id = (select id from public.agencies where slug = 'valterra')
 where agency_id is null;

update public.leads
   set agency_id = (select id from public.agencies where slug = 'valterra')
 where agency_id is null;

-- ----------------------------------------------------------
-- 3-4. FK constraints
-- ----------------------------------------------------------
alter table public.properties
  add constraint properties_agency_id_fkey
  foreign key (agency_id) references public.agencies(id)
  on delete restrict;

alter table public.leads
  add constraint leads_agency_id_fkey
  foreign key (agency_id) references public.agencies(id)
  on delete set null;

-- ----------------------------------------------------------
-- 5. properties.agency_id NOT NULL (leads queda nullable a proposito:
--    consultas generales sin property atribuible caen al super-admin Valterra
--    via fallback en /api/contact en MF5)
-- ----------------------------------------------------------
alter table public.properties
  alter column agency_id set not null;

-- ----------------------------------------------------------
-- 6. ENABLE RLS donde falte (properties/leads ya estan habilitadas desde 0001/0002)
-- ----------------------------------------------------------
alter table public.agencies        enable row level security;
alter table public.agency_members  enable row level security;

-- ==========================================================
-- 7. POLICIES
-- ==========================================================

-- ----------------------------------------------------------
-- properties
-- ----------------------------------------------------------

-- Lectura publica de properties publicadas (anon + authenticated)
create policy "anon select published properties"
  on public.properties for select
  to anon
  using (published = true);

-- Authenticated ve published + propios (preview de borrador propio)
create policy "members select own properties"
  on public.properties for select
  to authenticated
  using (
    published = true
    or agency_id in (
      select agency_id from public.agency_members where user_id = auth.uid()
    )
  );

-- Owner/admin/agent insertan en sus agencies
create policy "members insert own properties"
  on public.properties for insert
  to authenticated
  with check (
    agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role in ('owner','admin','agent')
    )
  );

-- Owner/admin/agent actualizan
create policy "members update own properties"
  on public.properties for update
  to authenticated
  using (
    agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role in ('owner','admin','agent')
    )
  )
  with check (
    agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role in ('owner','admin','agent')
    )
  );

-- Solo owner/admin pueden eliminar
create policy "managers delete own properties"
  on public.properties for delete
  to authenticated
  using (
    agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- ----------------------------------------------------------
-- leads
-- ----------------------------------------------------------
-- Anon: NO select. INSERT solo via API server-side con SERVICE_ROLE.
-- Cero policy anon = cero acceso anon (default deny).

-- Authenticated ve leads de su agency
create policy "members select own leads"
  on public.leads for select
  to authenticated
  using (
    agency_id in (
      select agency_id from public.agency_members where user_id = auth.uid()
    )
  );

-- Owner/admin/agent actualizan estado de leads
create policy "members update own leads"
  on public.leads for update
  to authenticated
  using (
    agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role in ('owner','admin','agent')
    )
  )
  with check (
    agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role in ('owner','admin','agent')
    )
  );

-- ----------------------------------------------------------
-- agencies
-- ----------------------------------------------------------

-- Lectura publica de info basica de agency (para attribution en listings)
-- Si en el futuro hay campos sensibles, mover a view publica con columnas filtradas.
create policy "anon select agencies public"
  on public.agencies for select
  to anon
  using (true);

-- Owner/admin actualizan su agency
create policy "managers update agency"
  on public.agencies for update
  to authenticated
  using (
    id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role in ('owner','admin')
    )
  )
  with check (
    id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- ----------------------------------------------------------
-- agency_members
-- ----------------------------------------------------------

-- Self-view: cada user ve sus propias memberships
create policy "self select memberships"
  on public.agency_members for select
  to authenticated
  using (user_id = auth.uid());

-- Owner/admin ven todos los members de su agency
create policy "managers select agency members"
  on public.agency_members for select
  to authenticated
  using (
    agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- Solo owner gestiona memberships (invite/remove/role-change)
create policy "owners manage members"
  on public.agency_members for all
  to authenticated
  using (
    agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role = 'owner'
    )
  )
  with check (
    agency_id in (
      select agency_id from public.agency_members
       where user_id = auth.uid() and role = 'owner'
    )
  );

-- ==========================================================
-- POST-MIGRATION SMOKE TESTS (correr manualmente despues):
-- ==========================================================
-- select count(*) from public.properties where agency_id is null;  -- esperado 0
-- select count(*) from public.leads      where agency_id is null;  -- esperado 0 si todos los seeds tenian valterra; aceptable >0 para leads futuros sin property
-- select conname from pg_constraint where conrelid = 'public.properties'::regclass and contype = 'f';  -- debe listar properties_agency_id_fkey
-- select conname from pg_constraint where conrelid = 'public.leads'::regclass      and contype = 'f';  -- debe listar leads_agency_id_fkey
-- select schemaname, tablename, policyname from pg_policies where tablename in ('properties','leads','agencies','agency_members') order by tablename, policyname;
