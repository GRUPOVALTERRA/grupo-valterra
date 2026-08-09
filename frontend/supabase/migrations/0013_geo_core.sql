-- ==========================================================
-- Migracion 0013: GEO DATA FOUNDATION (CORE-GEO-01)
-- Sprint 18 · S18-PR1 · Aditiva pura e idempotente.
-- ==========================================================
-- GATE: NO aplicar en Production sin decision directiva explicita
-- (regla S18: "Detenerse antes de aplicar 0013 o mergear PR1").
--
-- HALLAZGO DE AUDITORIA (2026-08-08):
--   properties.lat / properties.lng numeric(10,7) EXISTEN desde la
--   migracion 0002 (reservadas "para Sprint 11 mapa Mapbox", nunca
--   usadas). Ademas se seleccionaban en las queries publicas
--   (COLUMNS_BASE) y se mapeaban al objeto Property publico.
--   El PR1 de codigo elimina esa seleccion/mapeo (invariante: una
--   query publica jamas filtra coordenadas internas por accidente).
--
-- DESVIACION DOCUMENTADA respecto del modelo aprobado
-- (latitude/longitude NUMERIC(9,6)):
--   Se ADOPTAN las columnas existentes lat/lng como UBICACION INTERNA
--   exacta en lugar de crear latitude/longitude duplicadas.
--   Razones: (a) evitar dos pares de columnas geo ambiguos en la misma
--   tabla; (b) numeric(10,7) cubre la precision 9,6 aprobada; (c) un
--   RENAME romperia el codigo desplegado hoy en Production, que aun
--   selecciona lat,lng (hazard de orden deploy/migracion, incidente
--   0009). Si la direccion exige el rename, va en una migracion
--   posterior deliberada, nunca implicita.
--
-- MODELO (conceptos):
--   lat / lng                        = ubicacion INTERNA exacta.
--                                      Solo admin / service_role.
--   public_latitude/public_longitude = ubicacion DELIBERADAMENTE
--                                      publicable (centro del pin o
--                                      del circulo). Jamas se deriva
--                                      automaticamente de lat/lng.
--   public_location_mode             = exact | approximate | hidden.
--   public_radius_m                  = radio del circulo (approximate).
--
-- PRIVACIDAD:
--   * NO se usa offset derivado de property_id (reversible).
--   * approximate requiere public_latitude/public_longitude cargadas
--     a proposito. Esa coherencia se exige en la capa de dominio
--     (resolvePublicLocation, fail-closed: sin centro publico valido
--     => se comporta como hidden). No es CHECK duro porque el DEFAULT
--     'approximate' sobre filas existentes sin coordenadas lo violaria
--     y "ubicacion aun no cargada" es un estado legitimo.
--   * hidden => la lectura publica devuelve null (capa de dominio).
--   * exact => el publico recibe la ubicacion exacta SOLO si el admin
--     la copio deliberadamente a public_latitude/public_longitude.
--
-- PII: coordenadas de inmuebles en venta/alquiler; el modo por defecto
-- 'approximate' + circulo evita exponer domicilios residenciales.
--
-- Aplicar (cuando haya OK): Supabase Studio - SQL Editor - Run.
-- Sin backfill: las filas existentes quedan con geo nula.
--
-- Rollback (no toca lat/lng preexistentes de 0002):
--   alter table public.properties
--     drop column if exists public_location_mode,
--     drop column if exists public_latitude,
--     drop column if exists public_longitude,
--     drop column if exists public_radius_m;
--   alter table public.properties
--     drop constraint if exists properties_lat_range,
--     drop constraint if exists properties_lng_range;
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Rango valido para la ubicacion interna preexistente.
-- ----------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_lat_range') then
    alter table public.properties
      add constraint properties_lat_range
      check (lat is null or (lat >= -90 and lat <= 90));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_lng_range') then
    alter table public.properties
      add constraint properties_lng_range
      check (lng is null or (lng >= -180 and lng <= 180));
  end if;
end $$;

-- ----------------------------------------------------------
-- 2. Columnas de ubicacion publica deliberada.
-- ----------------------------------------------------------
alter table public.properties
  add column if not exists public_location_mode text not null default 'approximate',
  add column if not exists public_latitude  numeric(9,6),
  add column if not exists public_longitude numeric(9,6),
  add column if not exists public_radius_m  integer not null default 300;

-- ----------------------------------------------------------
-- 3. Invariantes.
-- ----------------------------------------------------------
do $$
begin
  -- Allowlist de modos.
  if not exists (select 1 from pg_constraint where conname = 'properties_public_location_mode_allowed') then
    alter table public.properties
      add constraint properties_public_location_mode_allowed
      check (public_location_mode in ('exact', 'approximate', 'hidden'));
  end if;

  -- Rangos de la ubicacion publica.
  if not exists (select 1 from pg_constraint where conname = 'properties_public_lat_range') then
    alter table public.properties
      add constraint properties_public_lat_range
      check (public_latitude is null or (public_latitude >= -90 and public_latitude <= 90));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_public_lng_range') then
    alter table public.properties
      add constraint properties_public_lng_range
      check (public_longitude is null or (public_longitude >= -180 and public_longitude <= 180));
  end if;

  -- Centro publico: ambas coordenadas o ninguna (nunca media coordenada).
  if not exists (select 1 from pg_constraint where conname = 'properties_public_center_paired') then
    alter table public.properties
      add constraint properties_public_center_paired
      check ((public_latitude is null) = (public_longitude is null));
  end if;

  -- Radio del circulo publico: entero en el rango operativo 50-5000 m.
  if not exists (select 1 from pg_constraint where conname = 'properties_public_radius_range') then
    alter table public.properties
      add constraint properties_public_radius_range
      check (public_radius_m >= 50 and public_radius_m <= 5000);
  end if;
end $$;
