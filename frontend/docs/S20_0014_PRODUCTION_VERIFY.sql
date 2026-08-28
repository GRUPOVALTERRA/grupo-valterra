-- ==========================================================
-- S20 · VERIFICACION POST-0014 EN PRODUCTION
-- Artefacto OPERATIVO. Fuera del scope de S20-PR1 (PR #34).
-- ==========================================================
-- Correr en Supabase Studio - SQL Editor INMEDIATAMENTE DESPUES de
-- aplicar 0014_site_events.sql en Production.
--
-- 100% READ-ONLY. No contiene INSERT / UPDATE / DELETE / TRUNCATE /
-- ALTER / DROP / CREATE / GRANT / REVOKE / DO ni funciones con efectos
-- laterales. Se puede pegar completo y ejecutar de una sola vez.
--
-- Es el espejo contra el esquema REAL de los bloques B, C, D, I y J del
-- MIGRATION GATE 0014 (83/83 GREEN sobre PGlite 0.5.4 / PostgreSQL 18.3).
-- Que el gate haya pasado en un Postgres desechable no prueba nada sobre
-- Production: esto lo prueba.
--
-- ----------------------------------------------------------
-- POST-0014 EXPECTED
-- ----------------------------------------------------------
--   table                present
--   columns              12
--   indexes              5  (incluyendo site_events_pkey)
--   rls                  enabled
--   force rls            enabled
--   policies             0
--   rows                 0
-- ----------------------------------------------------------
--
-- SOBRE LAS FILAS: 0 es lo esperado porque PR1 NO instrumenta nada
-- todavia. Si aparecieran filas, NO BORRARLAS: reportar la anomalia y
-- averiguar quien escribio antes de tocar nada.
--
-- ----------------------------------------------------------
-- NOTA DE USO — el SQL Editor de Supabase muestra el resultado del
-- ULTIMO statement. Por eso el bloque H devuelve un VEREDICTO
-- consolidado con PASS/FAIL de todos los controles: si se ejecuta el
-- archivo entero, ese es el que queda a la vista. Para ver el detalle de
-- un bloque, seleccionarlo y ejecutar solo esa seleccion.
-- ----------------------------------------------------------
--
-- ==========================================================
-- ORDEN MIGRACION / DEPLOY
-- ==========================================================
-- PR1: migration/deploy order is NON-CRITICAL because no client
--      instrumentation emits site_events yet. Ningun componente llama a
--      POST /api/events todavia, asi que la tabla puede crearse antes o
--      despues del merge sin consecuencia.
--
-- PR2: STRICT ORDER — sin excepciones:
--        1. 0014 CONFIRMED IN PRODUCTION  (este archivo en verde)
--        2. EVENTS_HASH_SALT decision/config
--        3. deploy instrumentation
--      NUNCA desplegar PR2 antes de confirmar site_events. Si el codigo
--      que emite eventos llega antes que la tabla, cada insert falla y
--      los eventos se pierden en silencio: el endpoint responde 204
--      igual y nadie se entera hasta ver el tablero vacio.
-- ==========================================================


-- ==========================================================
-- A · TABLE
-- Esperado: 1 fila. table_type = 'BASE TABLE'.
-- ==========================================================
select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
  and table_name   = 'site_events';


-- ==========================================================
-- B · COLUMNS
-- Esperado: exactamente 12 filas, en este orden.
--   id            uuid        NO   gen_random_uuid()
--   event_type    text        NO
--   occurred_at   timestamptz NO   now()
--   path          text        NO
--   property_slug text        YES
--   source        text        YES
--   referrer_host text        YES
--   utm_source    text        YES
--   utm_medium    text        YES
--   utm_campaign  text        YES
--   agency_id     uuid        YES
--   visit_hash    text        YES
-- ==========================================================
select
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'site_events'
order by ordinal_position;


-- ==========================================================
-- C · CONSTRAINTS
-- Esperado: 1 primary key, 1 foreign key, y los checks del modelo.
--
-- Revisar a ojo en la columna `definition`:
--   * event_type      -> allowlist ('pageview','wa_click')
--   * source          -> allowlist de las 6 superficies de WaSource
--   * coherencia      -> site_events_source_coherente
--                        (wa_click exige source; pageview la exige null)
--   * admin path      -> path <> '/admin' AND path !~~ '/admin/%'
--                        OJO: debe ser esta forma, NO '/admin%' a secas,
--                        que rechazaria /administracion (ruta publica).
--   * path            -> like '/%', sin '%?%', char_length <= 300
--   * visit_hash      -> char_length = 16 cuando no es null
--   * agency FK       -> REFERENCES agencies(id) ON DELETE SET NULL
--
-- NOTA DE VERSION (corregida 10-08-2026 contra Production real):
-- en PostgreSQL 18 los NOT NULL aparecen tambien en pg_constraint con
-- contype = 'n'. En PG17 y anteriores NO: esa funcionalidad entro en la
-- beta de 17 y se revirtio antes del release. Verificado en los dos lados:
--   PGlite 0.5.4 / PG18.3 (gate desechable) -> si aparecen
--   Supabase Production / PG17.6            -> no aparecen (contype 'n' = 0)
-- Por eso la lista de constraints de Production trae 13 filas (11 CHECK,
-- 1 FK, 1 PK) y no incluye los NOT NULL. No es un problema en ninguna
-- version: el veredicto del bloque H solo cuenta 'p', 'f' y 'c'.
-- ==========================================================
select
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    when 'u' then 'UNIQUE'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.conrelid = to_regclass('public.site_events')
order by con.contype, con.conname;


-- ==========================================================
-- D · INDEXES
-- Esperado: 5 filas.
--   site_events_pkey
--   site_events_type_time_idx
--   site_events_slug_time_idx     (parcial: where property_slug is not null)
--   site_events_agency_time_idx   (parcial: where agency_id is not null)
--   site_events_source_time_idx   (parcial: where source is not null)
-- ==========================================================
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename  = 'site_events'
order by indexname;


-- ==========================================================
-- E · RLS
-- Esperado: 1 fila con rls_enabled = true Y force_rls = true.
--
-- force_rls importa: sin el, el owner de la tabla esquiva RLS. Con el,
-- la regla aplica incluso a roles privilegiados.
-- ==========================================================
select
  n.nspname              as schema_name,
  c.relname              as table_name,
  c.relrowsecurity       as rls_enabled,
  c.relforcerowsecurity  as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'site_events';


-- ==========================================================
-- F · POLICIES
-- Esperado: 0 FILAS. Default-deny.
--
-- Cero policies significa que anon y authenticated no tienen ningun
-- camino, ni de lectura ni de conteo. service_role bypassa RLS y es el
-- unico acceso: escritura desde POST /api/events, lectura desde el
-- tablero server-side. Si aparece CUALQUIER policy, se rompio el modelo
-- de acceso y hay que revisar antes de seguir.
-- ==========================================================
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename  = 'site_events';


-- ==========================================================
-- G · ROW COUNT
-- Esperado: 0 inmediatamente post-migracion (PR1 no instrumenta).
-- Si hay filas: NO BORRARLAS. Reportar la anomalia.
-- ==========================================================
select count(*) as site_events_rows
from public.site_events;


-- ==========================================================
-- H · VEREDICTO CONSOLIDADO
-- Un renglon por control. Todos deben decir PASS.
-- Este es el bloque que queda a la vista si se ejecuta el archivo entero.
-- ==========================================================
with tabla as (
  select to_regclass('public.site_events') as oid_tabla
),
cols as (
  select
    count(*) as n,
    array_agg(column_name::text order by ordinal_position) as nombres
  from information_schema.columns
  where table_schema = 'public' and table_name = 'site_events'
),
idx as (
  select count(*) as n
  from pg_indexes
  where schemaname = 'public' and tablename = 'site_events'
),
rls as (
  select c.relrowsecurity as enabled, c.relforcerowsecurity as forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'site_events'
),
pol as (
  select count(*) as n
  from pg_policies
  where schemaname = 'public' and tablename = 'site_events'
),
con as (
  select
    count(*) filter (where contype = 'p') as pk,
    count(*) filter (where contype = 'f') as fk,
    count(*) filter (where contype = 'c') as checks,
    bool_or(contype = 'f' and pg_get_constraintdef(oid) like '%ON DELETE SET NULL%') as fk_set_null,
    bool_or(contype = 'c' and pg_get_constraintdef(oid) like '%/admin/%%')           as check_admin,
    bool_or(contype = 'c' and pg_get_constraintdef(oid) like '%wa_click%')           as check_event_type,
    bool_or(contype = 'c' and pg_get_constraintdef(oid) like '%footer-contacto%')    as check_source,
    bool_or(conname = 'site_events_source_coherente')                                as check_coherencia
  from pg_constraint
  where conrelid = to_regclass('public.site_events')
),
filas as (
  select count(*) as n from public.site_events
)
select * from (
  select  1 as ord, 'A · tabla presente'        as control,
          coalesce((select oid_tabla::text from tabla), 'AUSENTE') as observado,
          'public.site_events' as esperado,
          case when (select oid_tabla from tabla) is not null then 'PASS' else 'FAIL' end as estado
  union all
  select  2, 'B · cantidad de columnas',
          (select n::text from cols), '12',
          case when (select n from cols) = 12 then 'PASS' else 'FAIL' end
  union all
  select  3, 'B · nombres de columnas',
          case when (select nombres from cols) = array[
                 'id','event_type','occurred_at','path','property_slug','source',
                 'referrer_host','utm_source','utm_medium','utm_campaign',
                 'agency_id','visit_hash']
               then 'coinciden' else 'DIFIEREN' end,
          'las 12 del modelo, en orden',
          case when (select nombres from cols) = array[
                 'id','event_type','occurred_at','path','property_slug','source',
                 'referrer_host','utm_source','utm_medium','utm_campaign',
                 'agency_id','visit_hash']
               then 'PASS' else 'FAIL' end
  union all
  select  4, 'C · primary key',
          (select pk::text from con), '1',
          case when (select pk from con) = 1 then 'PASS' else 'FAIL' end
  union all
  select  5, 'C · foreign key agency_id',
          (select fk::text from con), '1',
          case when (select fk from con) = 1 then 'PASS' else 'FAIL' end
  union all
  select  6, 'C · FK con ON DELETE SET NULL',
          coalesce((select fk_set_null from con), false)::text, 'true',
          case when (select fk_set_null from con) then 'PASS' else 'FAIL' end
  union all
  select  7, 'C · check event_type allowlist',
          coalesce((select check_event_type from con), false)::text, 'true',
          case when (select check_event_type from con) then 'PASS' else 'FAIL' end
  union all
  select  8, 'C · check source allowlist',
          coalesce((select check_source from con), false)::text, 'true',
          case when (select check_source from con) then 'PASS' else 'FAIL' end
  union all
  select  9, 'C · check coherencia type/source',
          coalesce((select check_coherencia from con), false)::text, 'true',
          case when (select check_coherencia from con) then 'PASS' else 'FAIL' end
  union all
  select 10, 'C · check admin path (forma acotada)',
          coalesce((select check_admin from con), false)::text, 'true',
          case when (select check_admin from con) then 'PASS' else 'FAIL' end
  union all
  select 11, 'D · cantidad de indices',
          (select n::text from idx), '5',
          case when (select n from idx) = 5 then 'PASS' else 'FAIL' end
  union all
  select 12, 'E · rls enabled',
          coalesce((select enabled from rls), false)::text, 'true',
          case when (select enabled from rls) then 'PASS' else 'FAIL' end
  union all
  select 13, 'E · force rls',
          coalesce((select forced from rls), false)::text, 'true',
          case when (select forced from rls) then 'PASS' else 'FAIL' end
  union all
  select 14, 'F · policies (default-deny)',
          (select n::text from pol), '0',
          case when (select n from pol) = 0 then 'PASS' else 'FAIL' end
  union all
  select 15, 'G · filas',
          (select n::text from filas), '0',
          case when (select n from filas) = 0 then 'PASS' else 'REVISAR' end
) v
order by ord;
