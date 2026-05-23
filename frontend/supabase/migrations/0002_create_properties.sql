-- ==========================================================
-- Migración 0002: tabla properties (Sprint 9 · Grupo Valterra)
-- ==========================================================
-- Crea la tabla de propiedades reales con:
--  · contrato UI camelCase mapeable desde snake_case
--  · campos geo (lat/lng/city/province/country) listos para Sprint 11 (mapa Mapbox)
--  · campos negocio (published, featured, featured_order)
--  · agency_id nullable como hook multi-tenant para Sprint 10
--
-- Aplicar desde:
--   Opción A (CLI):  supabase db push
--   Opción B (UI):   copiar/pegar en Supabase Studio → SQL Editor
-- ==========================================================

create extension if not exists "pgcrypto";

create table if not exists public.properties (
  -- Identificación
  id                text primary key,
  slug              text not null unique,

  -- Contenido editorial
  title             text not null check (char_length(title) between 4 and 200),
  description       text,

  -- Comerciales
  price             numeric(14,2) not null check (price >= 0),
  currency          text not null default 'USD'
                    check (currency in ('USD','ARS')),
  per_month         boolean not null default false,
  operation_type    text not null
                    check (operation_type in ('venta','alquiler','alquiler-temporal')),
  property_type     text not null
                    check (property_type in ('casa','departamento','ph','terreno','local','oficina','campo','country')),

  -- Geo (preparado Sprint 11 · mapa interactivo)
  city              text not null,
  neighborhood      text,
  province          text not null,
  country           text not null default 'AR',
  address           text,
  lat               numeric(10,7),
  lng               numeric(10,7),

  -- Físicas
  bedrooms          integer check (bedrooms is null or bedrooms >= 0),
  bathrooms         integer check (bathrooms is null or bathrooms >= 0),
  parking           integer check (parking is null or parking >= 0),
  covered_area_m2   numeric(10,2) check (covered_area_m2 is null or covered_area_m2 >= 0),
  total_area_m2     numeric(10,2) check (total_area_m2 is null or total_area_m2 >= 0),

  -- Media
  badges            text[] not null default '{}'::text[],
  cover_image       text,
  gallery           text[] not null default '{}'::text[],

  -- Asignación
  agent_name        text,
  agent_phone       text,
  agency_id         uuid,   -- hook multi-tenant silencioso (Sprint 10 agrega FK)

  -- Estado negocio
  published         boolean not null default true,
  featured          boolean not null default false,
  featured_order    integer not null default 0,

  -- Audit
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ==========================================================
-- Índices
-- ==========================================================

-- Query principal de la home: properties publicadas, destacadas primero
create index if not exists properties_home_idx
  on public.properties (published, featured desc, featured_order asc, created_at desc);

-- Filtros típicos de listado
create index if not exists properties_operation_type_idx on public.properties (operation_type, property_type);
create index if not exists properties_city_idx           on public.properties (city, province);

-- Multi-tenant (Sprint 10)
create index if not exists properties_agency_idx on public.properties (agency_id);

-- ==========================================================
-- Trigger updated_at (reusa función creada en migración 0001)
-- ==========================================================
drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ==========================================================
-- RLS: bloqueado por defecto. Solo SERVICE_ROLE_KEY puede leer/escribir.
-- Cuando exista auth + agencies (Sprint 10), agregar policies:
--   · SELECT público para published = true
--   · UPDATE/INSERT/DELETE por owner según agency_id
-- ==========================================================
alter table public.properties enable row level security;
