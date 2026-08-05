-- ==========================================================
-- Migracion 0012: galeria de imagenes de propiedades
-- Sprint 17 · S17-MEDIA PR1 · Aditiva pura e idempotente.
-- ==========================================================
-- Hoy solo existe properties.cover_image (text: path de Storage o URL
-- legacy) y una columna properties.gallery (text[]) MUERTA: nadie la
-- escribe ni la lee. Esta migracion modela la galeria real: una fila por
-- foto, con portada, orden y alt text.
--
-- TIPOS REALES del esquema productivo (auditados el 04-08 via
-- information_schema.columns, regla del incidente 0011):
--   properties.id        = text
--   properties.agency_id = uuid (not null)
--   agencies.id          = uuid
-- Toda referencia respeta esa asimetria text/uuid.
--
-- properties.cover_image NO se elimina: queda como CACHE de compatibilidad
-- (el servicio la sincroniza con la portada) hasta S17-PR3.
-- properties.gallery queda DEPRECADA; su drop sera una migracion deliberada
-- posterior, nunca implicita.
--
-- PII: ninguna columna guarda datos personales. storage_path es un path
-- aleatorio generado server-side; alt_text es descripcion de la foto.
--
-- Aplicar: Supabase Studio - SQL Editor - Run.
-- (NO aplicar en Production dentro del gate S17-MEDIA-AUDIT.)
--
-- Rollback (no borra archivos de Storage ni datos de negocio):
--   drop table if exists public.property_images;
--   alter table public.properties
--     drop constraint if exists properties_id_agency_unique;
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Clave compuesta en properties para poder PINEAR agencia por FK.
--    (id ya es PK, asi que (id, agency_id) es trivialmente unico; el
--    constraint existe para que la FK compuesta de abajo sea valida.)
-- ----------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_id_agency_unique') then
    alter table public.properties
      add constraint properties_id_agency_unique unique (id, agency_id);
  end if;
end $$;

-- ----------------------------------------------------------
-- 2. Tabla de imagenes.
-- ----------------------------------------------------------
create table if not exists public.property_images (
  id           uuid primary key default gen_random_uuid(),
  property_id  text not null,
  agency_id    uuid not null,
  storage_path text not null unique
               check (char_length(storage_path) <= 300)
               -- Ruta INTERNA del bucket, jamás una URL libre ni traversal:
               -- el prefijo canonico lo genera el servicio server-side y la
               -- base lo exige aunque el codigo tenga un bug.
               check (storage_path like 'agency/%' and storage_path not like '%..%'),
  position     smallint not null default 0
               check (position >= 0),
  is_cover     boolean not null default false,
  alt_text     text
               check (alt_text is null or char_length(alt_text) <= 300),
  created_at   timestamptz not null default now(),

  -- INVARIANTE multi-tenant EN LA BASE: la imagen solo puede referenciar la
  -- combinacion (propiedad, agencia) que realmente existe. Un insert con la
  -- agencia equivocada falla por FK, no por logica JS.
  constraint property_images_property_agency_fk
    foreign key (property_id, agency_id)
    references public.properties (id, agency_id)
    on delete cascade
);

comment on table public.property_images is
  'S17: galeria de propiedades. Portada unica por indice parcial; paths de Storage aleatorios generados server-side; agencia pineada por FK compuesta.';

-- ----------------------------------------------------------
-- 3. UNA sola portada activa por propiedad: indice unico PARCIAL.
--    La regla vive en la base; dos is_cover=true concurrentes no pueden
--    coexistir aunque el codigo tenga un bug.
-- ----------------------------------------------------------
create unique index if not exists property_images_one_cover
  on public.property_images (property_id) where is_cover;

-- Orden estable de lectura de la galeria.
create index if not exists property_images_by_property
  on public.property_images (property_id, position, created_at);

-- ----------------------------------------------------------
-- 4. RLS: habilitada SIN politicas. Igual que el estado de notificacion de
--    leads: solo service_role (que bypassa RLS) puede leer/escribir la tabla.
--    anon y authenticated no tienen ningun camino, ni de listado.
-- ----------------------------------------------------------
alter table public.property_images enable row level security;
