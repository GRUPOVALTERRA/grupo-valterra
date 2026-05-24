-- ==========================================================
-- Migracion 0004: tablas agencies + agency_members
-- Sprint 10 MF1 · Foundation only.
-- ==========================================================
-- Aditiva pura. NO toca leads ni properties.
-- NO crea FK desde leads.agency_id / properties.agency_id (Sprint 10 MF2).
-- NO agrega RLS policies (Sprint 10 MF2).
-- NO altera schema existente.
--
-- Aplicar:
--   Supabase Studio - SQL Editor - copiar/pegar - Run
--
-- Rollback:
--   drop table if exists public.agency_members;
--   drop table if exists public.agencies;
-- ==========================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------
-- agencies
-- ----------------------------------------------------------
create table if not exists public.agencies (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (char_length(slug) between 2 and 80),
  name            text not null check (char_length(name) between 2 and 200),
  legal_name      text,
  cuit            text,
  matricula       text,
  contact_email   text,
  contact_phone   text,
  whatsapp        text,
  address         text,
  city            text,
  province        text,
  logo_url        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.agencies is
  'Inmobiliarias del marketplace. Sprint 10 MF1 introduce la tabla; MF2 agrega FK desde properties/leads.';

comment on column public.agencies.slug is
  'URL identifier estable. Inmutable post-creacion (recomendacion).';

-- ----------------------------------------------------------
-- agency_members (N:M agencies <-> auth.users)
-- ----------------------------------------------------------
create table if not exists public.agency_members (
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','admin','agent','viewer')),
  invited_at  timestamptz,
  joined_at   timestamptz,
  created_at  timestamptz not null default now(),
  primary key (agency_id, user_id)
);

comment on table public.agency_members is
  'Membership N:M entre agencies y Supabase Auth users. Sprint 10 MF1 introduce la tabla; MF3 wirea con login.';

-- ----------------------------------------------------------
-- Indices para queries tipicas (Sprint 10 MF3+ las usa)
-- ----------------------------------------------------------
create index if not exists agency_members_user_idx
  on public.agency_members (user_id);

create index if not exists agency_members_agency_idx
  on public.agency_members (agency_id, role);

-- ----------------------------------------------------------
-- Trigger updated_at en agencies (reusa funcion publica.set_updated_at
-- creada por la migration 0001 - SI EXISTE).
-- ----------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace
  ) then
    drop trigger if exists agencies_set_updated_at on public.agencies;
    create trigger agencies_set_updated_at
      before update on public.agencies
      for each row execute function public.set_updated_at();
  end if;
end $$;
