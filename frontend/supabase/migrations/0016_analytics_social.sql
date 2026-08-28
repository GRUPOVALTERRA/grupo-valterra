-- ==========================================================
-- Migracion 0016: ANALYTICS SOCIAL (pestana "Redes sociales")
-- Sprint 20 · S20-PR4 · Aditiva pura e idempotente.
-- ==========================================================
-- GATE: NO aplicar en Production sin decision directiva explicita.
--
-- SOLO LECTURA sobre los datos: crea UNA funcion de agregacion sobre la
-- vista site_events_enriched que ya creo 0015. No inserta, no actualiza,
-- no borra, no altera ninguna tabla ni vista existente. No toca la
-- instrumentacion del cliente.
--
-- ----------------------------------------------------------
-- QUE RESUELVE
-- ----------------------------------------------------------
-- analytics_web ya expone la dimension 'referrer', pero devuelve el HOST
-- crudo y una sola columna `events`. Para el tablero comercial eso no
-- alcanza por dos razones:
--
--   1. Una misma red llega con muchos hosts distintos segun la app que
--      abre el link: Instagram manda `l.instagram.com`, Facebook manda
--      `m.facebook.com`, `lm.facebook.com` o `l.facebook.com`, X manda
--      `t.co`. Listados por host, los clicks de una misma red aparecen
--      repartidos en filas separadas y ninguna refleja el total real.
--
--   2. Hace falta pageviews Y wa_clicks POR RED en la misma fila para
--      poder calcular conversion. analytics_web separa por dimension y no
--      permite ese cruce.
--
-- ----------------------------------------------------------
-- COMO SE CLASIFICA (y por que en ese orden)
-- ----------------------------------------------------------
-- 1º `utm_source`, si viene. Es una declaracion explicita de quien armo el
--    link y sobrevive al recorte de referrer.
-- 2º `referrer_host`, mapeado a la red conocida.
-- 3º Si hay referrer pero no matchea ninguna red -> 'otros'.
-- 4º Si no hay ninguna de las dos, el evento NO aparece en este reporte:
--    es trafico directo, y ya se cuenta en analytics_web/traffic_type.
--    Meterlo aca inflaria el denominador con visitas que no vinieron de
--    ninguna red.
--
-- El referrer se normaliza a minusculas y sin `www.` antes de comparar.
--
-- NOTA SOBRE WHATSAPP: se clasifica como red de ORIGEN, es decir alguien
-- que llego al sitio desde un link compartido por WhatsApp. No confundir
-- con los `wa_click` de salida, que son la conversion y se cuentan aparte
-- en la columna wa_clicks de cada fila.
--
-- ----------------------------------------------------------
-- PRIVACIDAD Y SEGURIDAD
-- ----------------------------------------------------------
-- Devuelve agregados. Nunca visit_hash, nunca filas crudas, nunca la URL
-- completa del referrer (solo el host, que es lo unico que guarda 0014).
-- SECURITY INVOKER, igual que las cinco funciones de 0015: con INVOKER,
-- anon y authenticated siguen sin ver nada aunque llamen a la funcion.
-- Se revoca EXECUTE a public y solo service_role conserva acceso.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. analytics_social — pageviews y wa_clicks por red de origen.
-- ----------------------------------------------------------
create or replace function public.analytics_social(
  p_scope     text,
  p_agency_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  scope     text,
  network   text,
  pageviews bigint,
  wa_clicks bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select
      case when v.agency_id is null then 'general' else 'agency' end as scope,
      v.event_type,
      lower(nullif(trim(v.utm_source), ''))                    as src,
      regexp_replace(lower(coalesce(v.referrer_host, '')), '^www\.', '') as host
    from public.site_events_enriched v
    where v.occurred_at >= p_from
      and v.occurred_at <  p_to
      and (
        p_scope = 'all'
        or (p_scope = 'agency' and (v.agency_id is null or v.agency_id = p_agency_id))
      )
  ),
  clasificado as (
    select
      scope,
      event_type,
      case
        -- 1º la declaracion explicita del link
        when src in ('instagram', 'ig')                    then 'instagram'
        when src in ('facebook', 'fb', 'meta')             then 'facebook'
        when src in ('tiktok', 'tt')                       then 'tiktok'
        when src in ('x', 'twitter')                       then 'x'
        when src in ('youtube', 'yt')                      then 'youtube'
        when src in ('whatsapp', 'wa')                     then 'whatsapp'
        when src is not null                               then 'otros'
        -- 2º el host de origen
        when host like '%instagram.com'                    then 'instagram'
        when host like '%facebook.com' or host = 'fb.me'   then 'facebook'
        when host like '%tiktok.com'                       then 'tiktok'
        when host in ('x.com', 'twitter.com', 't.co')      then 'x'
        when host like '%youtube.com' or host = 'youtu.be' then 'youtube'
        when host like '%whatsapp.com' or host = 'wa.me'   then 'whatsapp'
        -- 3º vino de algun lado, pero no de una red conocida
        when host <> ''                                    then 'otros'
        -- 4º trafico directo: fuera de este reporte
        else null
      end as network
    from base
  )
  select
    scope,
    network,
    count(*) filter (where event_type = 'pageview') as pageviews,
    count(*) filter (where event_type = 'wa_click') as wa_clicks
  from clasificado
  where network is not null
  group by 1, 2
  order by 3 desc, 4 desc, 2;
$$;

comment on function public.analytics_social(text, uuid, timestamptz, timestamptz) is
  'S20-PR4. Pageviews y wa_clicks por red de origen (utm_source, si no referrer_host). '
  'El trafico directo queda excluido a proposito: no vino de ninguna red y sumarlo '
  'falsearia la conversion por red.';

-- ----------------------------------------------------------
-- 2. Permisos: no sumar superficie publica.
--    PostgreSQL otorga EXECUTE a PUBLIC por defecto en cada funcion nueva.
--    Se revoca, igual que en 0015.
-- ----------------------------------------------------------
do $perm$
declare
  f text := 'public.analytics_social(text, uuid, timestamptz, timestamptz)';
begin
  execute format('revoke all on function %s from public', f);
  -- anon y authenticated pueden no existir fuera de Supabase.
  begin execute format('revoke all on function %s from anon', f); exception when undefined_object then null; end;
  begin execute format('revoke all on function %s from authenticated', f); exception when undefined_object then null; end;
  begin execute format('grant execute on function %s to service_role', f); exception when undefined_object then null; end;
end
$perm$;
