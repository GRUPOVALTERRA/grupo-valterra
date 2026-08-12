-- ==========================================================
-- Migracion 0015: ANALYTICS RPC (tablero /admin/estadisticas)
-- Sprint 20 · S20-PR3 · Aditiva pura e idempotente.
-- ==========================================================
-- GATE: NO aplicar en Production sin decision directiva explicita.
--
-- SOLO LECTURA sobre los datos: crea una vista y cinco funciones de
-- agregacion. No inserta, no actualiza, no borra, no altera site_events ni
-- ninguna tabla existente. No toca la instrumentacion de S20-PR2.
--
-- ----------------------------------------------------------
-- POR QUE RPC Y NO AGREGAR EN LA APLICACION
-- ----------------------------------------------------------
-- El tablero necesita count(distinct visit_hash), agrupacion diaria, por
-- propiedad y por campana. Resolverlo trayendo filas crudas obligaria a
-- paginar PostgREST y produciria metricas silenciosamente incompletas en
-- cuanto el volumen crezca. La aplicacion recibe AGREGADOS; las filas de
-- site_events no salen nunca de la base.
--
-- ----------------------------------------------------------
-- HALLAZGO QUE ESTA MIGRACION CORRIGE (auditado el 11-08-2026)
-- ----------------------------------------------------------
-- El tracker de pageviews de S20-PR2 llama trackSiteEvent("pageview") SIN
-- propertySlug: solo `wa_click` lo manda. Y agency_id se deriva server-side
-- a partir de property_slug. Consecuencia: TODOS los pageviews quedan con
-- property_slug NULL y agency_id NULL, incluso los de una ficha.
--
-- Sin corregirlo, el tablero mostraria cero pageviews por propiedad y cero
-- trafico atribuido a cada agencia: el ranking de propiedades y toda la
-- conversion serian inutiles.
--
-- Se corrige AQUI, en lectura, sin tocar el cliente: el path de una ficha
-- es exactamente `/propiedades/<slug>`, asi que el slug se deriva del path
-- y la agencia se resuelve por JOIN contra properties. Es reproducible
-- sobre los datos ya guardados y no requiere reinstrumentar nada.
--
-- ----------------------------------------------------------
-- TIMEZONE
-- ----------------------------------------------------------
-- occurred_at es timestamptz (se guarda en UTC). Los dias comerciales se
-- cortan en 'America/Argentina/Cordoba' (ART, UTC-3, sin DST). Cortar por
-- UTC moveria al dia siguiente toda la actividad posterior a las 21:00
-- local, que es justamente horario de consulta inmobiliaria.
--
-- ----------------------------------------------------------
-- PRIVACIDAD
-- ----------------------------------------------------------
-- Ninguna funcion devuelve visit_hash, ni filas crudas de site_events.
-- visit_hash se usa exclusivamente dentro de count(distinct ...). Ademas se
-- devuelve `identifiable_pageviews` para que el tablero pueda distinguir
-- "0 unicos" de "sin datos para estimar unicos" y no invente un numero.
--
-- ----------------------------------------------------------
-- SEGURIDAD
-- ----------------------------------------------------------
-- Vista y funciones son SECURITY INVOKER (la vista, con
-- security_invoker=true explicito). NO se usa SECURITY DEFINER: seria abrir
-- una puerta que lee site_events saltando la RLS default-deny, justo lo que
-- 0014 evita. Con INVOKER, anon y authenticated siguen sin ver nada aunque
-- llamen a la funcion; service_role bypassa RLS y es el unico camino real,
-- igual que en el resto del sistema.
--
-- Ademas se REVOCA EXECUTE de PUBLIC/anon/authenticated: en PostgreSQL toda
-- funcion nueva queda ejecutable por PUBLIC por defecto, y no queremos
-- sumar superficie aunque hoy no devuelva datos.
--
-- LA AUTORIZACION REAL NO VIVE ACA. El scope lo decide el server component
-- con getAdminContext() (isSuperAdmin / scopedAgencyId) y recien entonces
-- elige que enviar como p_scope y p_agency_id. Estos parametros JAMAS deben
-- tomarse de la query string sin pasar por esa decision.
--
-- Aplicar: Supabase Studio - SQL Editor - Run.
--
-- Rollback (no toca datos):
--   drop function if exists public.analytics_web(text, uuid, timestamptz, timestamptz, integer);
--   drop function if exists public.analytics_campaigns(text, uuid, timestamptz, timestamptz);
--   drop function if exists public.analytics_properties(text, uuid, timestamptz, timestamptz, integer);
--   drop function if exists public.analytics_daily(text, uuid, timestamptz, timestamptz);
--   drop function if exists public.analytics_summary(text, uuid, timestamptz, timestamptz);
--   drop view if exists public.site_events_enriched;
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Vista enriquecida.
--    Deriva el slug de propiedad desde el path y resuelve la agencia por
--    JOIN. `coalesce` respeta lo que ya venga en la fila (wa_click) y solo
--    completa lo que falta (pageview).
-- ----------------------------------------------------------
create or replace view public.site_events_enriched
with (security_invoker = true) as
select
  e.event_type,
  e.occurred_at,
  -- Dia comercial en horario de Argentina (ver TIMEZONE en el header).
  (e.occurred_at at time zone 'America/Argentina/Cordoba')::date as occurred_on,
  e.path,
  e.source,
  e.referrer_host,
  e.utm_source,
  e.utm_medium,
  e.utm_campaign,
  e.visit_hash,
  coalesce(
    e.property_slug,
    nullif(substring(e.path from '^/propiedades/([^/]+)$'), '')
  ) as property_slug,
  coalesce(e.agency_id, p.agency_id) as agency_id,
  p.title as property_title
from public.site_events e
left join public.properties p
  on p.slug = coalesce(
       e.property_slug,
       nullif(substring(e.path from '^/propiedades/([^/]+)$'), '')
     );

comment on view public.site_events_enriched is
  'S20-PR3: lectura enriquecida de site_events. Deriva property_slug del path (los pageviews no lo mandan) y resuelve agency_id por JOIN con properties. security_invoker: hereda la RLS default-deny de site_events.';

-- ----------------------------------------------------------
-- 2. analytics_summary
--    Una fila por AMBITO. 'agency' y 'general' NUNCA se suman: mezclar
--    pageviews del portal con wa_click de una agencia produciria una
--    conversion falsa.
-- ----------------------------------------------------------
create or replace function public.analytics_summary(
  p_scope     text,
  p_agency_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  scope                  text,
  pageviews              bigint,
  wa_clicks              bigint,
  unique_visitors        bigint,
  identifiable_pageviews bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    case when v.agency_id is null then 'general' else 'agency' end as scope,
    count(*) filter (where v.event_type = 'pageview')  as pageviews,
    count(*) filter (where v.event_type = 'wa_click')  as wa_clicks,
    count(distinct v.visit_hash) filter (
      where v.event_type = 'pageview' and v.visit_hash is not null
    ) as unique_visitors,
    count(*) filter (
      where v.event_type = 'pageview' and v.visit_hash is not null
    ) as identifiable_pageviews
  from public.site_events_enriched v
  where v.occurred_at >= p_from
    and v.occurred_at <  p_to
    and (
      p_scope = 'all'
      or (p_scope = 'agency' and (v.agency_id is null or v.agency_id = p_agency_id))
    )
  group by 1
  order by 1;
$$;

-- ----------------------------------------------------------
-- 3. analytics_daily — serie temporal por dia comercial y ambito.
-- ----------------------------------------------------------
create or replace function public.analytics_daily(
  p_scope     text,
  p_agency_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  scope                  text,
  day                    date,
  pageviews              bigint,
  wa_clicks              bigint,
  unique_visitors        bigint,
  identifiable_pageviews bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    case when v.agency_id is null then 'general' else 'agency' end as scope,
    v.occurred_on as day,
    count(*) filter (where v.event_type = 'pageview') as pageviews,
    count(*) filter (where v.event_type = 'wa_click') as wa_clicks,
    count(distinct v.visit_hash) filter (
      where v.event_type = 'pageview' and v.visit_hash is not null
    ) as unique_visitors,
    count(*) filter (
      where v.event_type = 'pageview' and v.visit_hash is not null
    ) as identifiable_pageviews
  from public.site_events_enriched v
  where v.occurred_at >= p_from
    and v.occurred_at <  p_to
    and (
      p_scope = 'all'
      or (p_scope = 'agency' and (v.agency_id is null or v.agency_id = p_agency_id))
    )
  group by 1, 2
  order by 2, 1;
$$;

-- ----------------------------------------------------------
-- 4. analytics_properties — ranking de fichas.
--    Solo filas con propiedad identificada: el trafico general no compite
--    en este ranking. El titulo sale de properties; el UUID nunca se expone.
-- ----------------------------------------------------------
create or replace function public.analytics_properties(
  p_scope     text,
  p_agency_id uuid,
  p_from      timestamptz,
  p_to        timestamptz,
  p_limit     integer default 20
)
returns table (
  property_slug  text,
  property_title text,
  pageviews      bigint,
  wa_clicks      bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    v.property_slug,
    max(v.property_title) as property_title,
    count(*) filter (where v.event_type = 'pageview') as pageviews,
    count(*) filter (where v.event_type = 'wa_click') as wa_clicks
  from public.site_events_enriched v
  where v.occurred_at >= p_from
    and v.occurred_at <  p_to
    and v.property_slug is not null
    and (
      p_scope = 'all'
      or (p_scope = 'agency' and v.agency_id = p_agency_id)
    )
  group by v.property_slug
  order by 4 desc, 3 desc, 1
  limit least(greatest(coalesce(p_limit, 20), 1), 200);
$$;

-- ----------------------------------------------------------
-- 5. analytics_campaigns — agrupado por la terna UTM.
--    Las tres columnas pueden venir NULL: eso es "sin campana" y el tablero
--    debe mostrarlo como fila aparte. NO se inventa una campana ficticia
--    aca: NULL viaja como NULL y la decision de rotularlo es de la UI.
-- ----------------------------------------------------------
create or replace function public.analytics_campaigns(
  p_scope     text,
  p_agency_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  scope        text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  pageviews    bigint,
  wa_clicks    bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    case when v.agency_id is null then 'general' else 'agency' end as scope,
    v.utm_source,
    v.utm_medium,
    v.utm_campaign,
    count(*) filter (where v.event_type = 'pageview') as pageviews,
    count(*) filter (where v.event_type = 'wa_click') as wa_clicks
  from public.site_events_enriched v
  where v.occurred_at >= p_from
    and v.occurred_at <  p_to
    and (
      p_scope = 'all'
      or (p_scope = 'agency' and (v.agency_id is null or v.agency_id = p_agency_id))
    )
  group by 1, 2, 3, 4
  order by 5 desc, 6 desc;
$$;

-- ----------------------------------------------------------
-- 6. analytics_web — desgloses de una sola forma (dimension/label/eventos).
--    Una sola funcion en vez de cuatro diminutas.
--
--    dimension:
--      'path'         -> rutas mas vistas          (pageview)
--      'referrer'     -> host de origen            (pageview)
--      'traffic_type' -> directo | referral | campana (pageview)
--      'wa_source'    -> las 6 superficies de WaSource (wa_click)
-- ----------------------------------------------------------
create or replace function public.analytics_web(
  p_scope     text,
  p_agency_id uuid,
  p_from      timestamptz,
  p_to        timestamptz,
  p_limit     integer default 10
)
returns table (
  scope     text,
  dimension text,
  label     text,
  events    bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select
      case when v.agency_id is null then 'general' else 'agency' end as scope,
      v.event_type, v.path, v.source, v.referrer_host, v.utm_source
    from public.site_events_enriched v
    where v.occurred_at >= p_from
      and v.occurred_at <  p_to
      and (
        p_scope = 'all'
        or (p_scope = 'agency' and (v.agency_id is null or v.agency_id = p_agency_id))
      )
  ),
  ranked as (
    select scope, 'path' as dimension, path as label, count(*) as events
    from base where event_type = 'pageview'
    group by 1, 3
    union all
    select scope, 'referrer', referrer_host, count(*)
    from base where event_type = 'pageview' and referrer_host is not null
    group by 1, 3
    union all
    select
      scope,
      'traffic_type',
      case
        when utm_source    is not null then 'campana'
        when referrer_host is not null then 'referral'
        else 'directo'
      end,
      count(*)
    from base where event_type = 'pageview'
    group by 1, 3
    union all
    select scope, 'wa_source', source, count(*)
    from base where event_type = 'wa_click' and source is not null
    group by 1, 3
  ),
  numerada as (
    select
      r.*,
      row_number() over (partition by r.scope, r.dimension order by r.events desc, r.label) as pos
    from ranked r
  )
  select n.scope, n.dimension, n.label, n.events
  from numerada n
  where n.pos <= least(greatest(coalesce(p_limit, 10), 1), 100)
  order by n.dimension, n.scope, n.events desc, n.label;
$$;

-- ----------------------------------------------------------
-- 7. Permisos: no sumar superficie publica.
--    PostgreSQL otorga EXECUTE a PUBLIC por defecto en cada funcion nueva.
--    Se revoca. service_role conserva acceso por ser el rol de servicio.
-- ----------------------------------------------------------
do $perm$
declare
  f text;
begin
  foreach f in array array[
    'public.analytics_summary(text, uuid, timestamptz, timestamptz)',
    'public.analytics_daily(text, uuid, timestamptz, timestamptz)',
    'public.analytics_properties(text, uuid, timestamptz, timestamptz, integer)',
    'public.analytics_campaigns(text, uuid, timestamptz, timestamptz)',
    'public.analytics_web(text, uuid, timestamptz, timestamptz, integer)'
  ] loop
    execute format('revoke all on function %s from public', f);
    -- anon y authenticated pueden no existir fuera de Supabase.
    begin execute format('revoke all on function %s from anon', f); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', f); exception when undefined_object then null; end;
    begin execute format('grant execute on function %s to service_role', f); exception when undefined_object then null; end;
  end loop;
end
$perm$;
