-- ==========================================================
-- Migración 0001: tabla leads (MVP Grupo Valterra)
-- ==========================================================
-- Aplicar desde:
--   Opción A (CLI):  supabase db push
--   Opción B (UI):   copiar/pegar en Supabase Studio → SQL Editor
-- ==========================================================

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id              text primary key,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Datos del contacto
  name            text not null check (char_length(name) between 2 and 100),
  phone           text not null check (char_length(phone) between 8 and 20),
  email           text,
  message         text not null check (char_length(message) between 10 and 1000),

  -- Contexto de la consulta
  property_slug   text,
  property_title  text,
  agent_name      text,

  -- Estado del lead
  source          text not null default 'contact-form'
                  check (source in ('contact-form','whatsapp','phone','email','referral','social','portal')),
  status          text not null default 'new'
                  check (status in ('new','contacted','qualified','scheduled','converted','lost','archived')),

  -- Futuro multi-tenant (nullable hoy, FK cuando existan las tablas)
  inmobiliaria_id uuid,
  agent_id        uuid
);

-- Índices para queries del panel
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_source_idx     on public.leads (source);
create index if not exists leads_inmob_idx      on public.leads (inmobiliaria_id);

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- RLS: bloquear todo acceso anónimo. Sólo SERVICE_ROLE_KEY bypasea.
-- Cuando exista auth, agregar policies por inmobiliaria_id / agent_id.
alter table public.leads enable row level security;

-- Policy mínima: bloqueado para anon y authenticated por defecto.
-- (No creamos policies permisivas hasta que exista auth + ownership.)
