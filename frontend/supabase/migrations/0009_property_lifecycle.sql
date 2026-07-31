-- ==========================================================
-- Migración 0009: ciclo de vida de propiedades (Sprint 15-A)
-- ==========================================================
-- Objetivo: permitir alta como BORRADOR y gestión de estados desde el panel,
-- sin romper nada de lo que ya funciona.
--
-- Decisión de diseño: NO se reemplaza `published`.
-- La columna `published` (boolean) es la que usan hoy la RLS pública
-- ("anon select published properties"), los índices y todas las consultas del
-- sitio. Reescribirlas sería un cambio de superficie amplia y riesgoso.
-- En su lugar `published` pasa a ser un ESPEJO DERIVADO de `status`, mantenido
-- por trigger: published = (status = 'published').
-- Resultado: cero cambios en RLS, índices y queries existentes; los borradores
-- y archivadas quedan fuera del sitio público por el mismo camino ya auditado.
--
-- No destructiva: sólo agrega columnas, índice y trigger.
-- No modifica el contenido de ninguna propiedad.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Columnas de ciclo de vida
-- ----------------------------------------------------------
alter table public.properties
  add column if not exists status text not null default 'draft'
    check (status in ('draft','published','unpublished','archived')),
  add column if not exists published_at timestamptz,
  add column if not exists archived_at  timestamptz,
  add column if not exists created_by   uuid references auth.users(id) on delete set null,
  add column if not exists updated_by   uuid references auth.users(id) on delete set null;

-- ----------------------------------------------------------
-- 2. Backfill conservador de las filas existentes
-- ----------------------------------------------------------
-- Las propiedades actuales conservan EXACTAMENTE su visibilidad:
--   published = true  -> 'published' (siguen online)
--   published = false -> 'unpublished' (no 'draft': ya existieron publicables)
-- Sólo afecta filas que aún tengan el default 'draft' recién agregado.
update public.properties
   set status = case when published then 'published' else 'unpublished' end,
       published_at = case when published then coalesce(published_at, created_at) else published_at end
 where status = 'draft';

-- ----------------------------------------------------------
-- 3. id autogenerado para altas desde el panel
-- ----------------------------------------------------------
-- `id` es text y no tenía default: hasta ahora las filas venían del seed con
-- ids fijos ('prop-001'). Para poder insertar desde la aplicación se agrega un
-- default; las filas existentes no se tocan.
alter table public.properties
  alter column id set default gen_random_uuid()::text;

-- ----------------------------------------------------------
-- 4. Las altas nuevas nacen borrador
-- ----------------------------------------------------------
-- `published` tenía default true (Sprint 9, sin panel de alta). Con el espejo
-- del trigger el default correcto es false: una propiedad nueva nace draft.
alter table public.properties
  alter column published set default false;

-- ----------------------------------------------------------
-- 5. Trigger: published es espejo de status
-- ----------------------------------------------------------
create or replace function public.sync_property_published()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.published := (new.status = 'published');

  -- sellos de tiempo coherentes con la transición
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if new.status = 'archived' and new.archived_at is null then
    new.archived_at := now();
  end if;
  if new.status <> 'archived' then
    new.archived_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists properties_sync_published on public.properties;
create trigger properties_sync_published
  before insert or update on public.properties
  for each row execute function public.sync_property_published();

-- ----------------------------------------------------------
-- 6. Índice para el listado del panel
-- ----------------------------------------------------------
create index if not exists properties_agency_status_idx
  on public.properties (agency_id, status, updated_at desc);

-- ==========================================================
-- ROLLBACK OPERATIVO
-- ==========================================================
--   drop trigger if exists properties_sync_published on public.properties;
--   drop function if exists public.sync_property_published();
--   drop index if exists public.properties_agency_status_idx;
--   alter table public.properties alter column published set default true;
--   alter table public.properties alter column id drop default;
--   alter table public.properties
--     drop column if exists status,
--     drop column if exists published_at,
--     drop column if exists archived_at,
--     drop column if exists created_by,
--     drop column if exists updated_by;
--   -- `published` conserva su valor: ninguna propiedad cambia de visibilidad.
-- ==========================================================
