-- ==========================================================
-- Migracion 0014: SITE EVENTS (log propio de analitica)
-- Sprint 20 · S20-PR1 · Aditiva pura e idempotente.
-- ==========================================================
-- GATE: NO aplicar en Production sin decision directiva explicita de Gusty.
--
-- POR QUE EXISTE:
--   La Analitica F1 (S19, PR #31) monto Vercel Web Analytics y el evento
--   `wa_click` via components/public/WaLink.tsx. Vercel en plan Hobby
--   entrega pageviews / fuentes / UTM, pero NO expone custom events:
--   el `track("wa_click")` se emite y no hay forma de leerlo ni segmentarlo.
--   Decision del dueno (10-08): los conteos van por log propio en Supabase.
--   Esta tabla ES ese log, y es ademas el primer data-log del futuro VRE
--   (que propiedades generan intencion de contacto).
--
-- TIPOS REALES del esquema productivo (auditados via information_schema,
-- regla nacida del incidente 0011):
--   agencies.id          = uuid
--   properties.id        = text
--   properties.agency_id = uuid (not null)
--   properties.slug      = text
-- agency_id de esta tabla referencia agencies(id) => uuid. NO se referencia
-- properties: property_slug se guarda como TEXTO LIBRE a proposito, para
-- que borrar una propiedad no borre su historial de demanda.
--
-- PRIVACIDAD — INVARIANTE DEL SPRINT.
--   * No se persiste IP cruda. No se persiste user-agent. Sin cookies.
--   * referrer_host guarda SOLO el host (ej. "instagram.com"), jamas la
--     URL completa: una URL de referencia puede llevar identificadores.
--   * path se normaliza server-side sin query string.
--
--   * visit_hash es un IDENTIFICADOR PSEUDONIMO DIARIO derivado de IP y
--     user-agent con una sal secreta (EVENTS_HASH_SALT), sin persistir los
--     valores originales. Se recalcula con la fecha UTC dentro del material
--     del hash, asi que ROTA CADA DIA y no permite construir un
--     identificador cross-day.
--
--     Que NO es: no es anonimizacion. Un pseudonimo derivado de IP+UA sigue
--     siendo un dato personal bajo la mayoria de los marcos de privacidad,
--     y quien tenga la sal puede confirmar por fuerza bruta si una IP dada
--     produjo un hash dado dentro de ese dia. La sal secreta y la rotacion
--     diaria acotan el riesgo; no lo eliminan. Por eso la sal es
--     obligatoria: sin ella no se emite hash (queda NULL).
--
--     Para que sirve: deduplicar visitas dentro de una misma jornada.
--     Nada mas.
--
-- NATURALEZA DEL DATO: site_events es TELEMETRIA OBSERVADA, no
-- contabilidad. El endpoint es publico; el rate limit y la validacion
-- reducen el ruido pero no lo eliminan. Un pageview NO es evidencia de una
-- persona real, y el tablero no debe presentarlo como tal.
--
-- Aplicar: Supabase Studio - SQL Editor - Run.
--
-- Rollback (no toca ninguna tabla de negocio):
--   drop table if exists public.site_events;
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Tabla de eventos.
-- ----------------------------------------------------------
create table if not exists public.site_events (
  id            uuid primary key default gen_random_uuid(),

  event_type    text not null
                check (event_type in ('pageview', 'wa_click')),

  occurred_at   timestamptz not null default now(),

  -- Ruta publica normalizada server-side, sin query string.
  --
  -- El admin JAMAS se instrumenta, y la regla vive TAMBIEN en la base, no
  -- solo en el cliente (guarda de e2e/analytics-unit.spec.ts).
  --
  -- OJO con la forma del check: `path not like '/admin%'` seria demasiado
  -- amplio — rechazaria tambien /administracion, /admins, /administrar,
  -- rutas publicas perfectamente legitimas. El check debe decir EXACTAMENTE
  -- lo mismo que isAdminPath() en src/lib/events.ts: la ruta exacta /admin,
  -- o cualquier cosa bajo /admin/. Si aplicacion y base discrepan, el
  -- endpoint acepta filas que la base rechaza (o al reves) y se pierden
  -- eventos en silencio.
  path          text not null
                check (char_length(path) <= 300)
                check (path like '/%')
                check (path <> '/admin' and path not like '/admin/%')
                check (path not like '%?%'),

  -- Slug de la propiedad involucrada. Texto libre a proposito (ver header).
  property_slug text
                check (property_slug is null or char_length(property_slug) <= 120),

  -- Superficie del click. Espejo EXACTO del tipo WaSource de
  -- src/components/public/WaLink.tsx: si se agrega una superficie alla,
  -- va una migracion que amplie este check. Que la base rechace un valor
  -- desconocido es la garantia de que el tablero no muestra basura.
  source        text
                check (source is null or source in (
                  'card-listado', 'card-home', 'ficha',
                  'cta-home', 'footer', 'footer-contacto'
                )),

  -- SOLO host, nunca URL completa (ver PRIVACIDAD en el header).
  referrer_host text
                check (referrer_host is null or char_length(referrer_host) <= 120),

  utm_source    text check (utm_source   is null or char_length(utm_source)   <= 80),
  utm_medium    text check (utm_medium   is null or char_length(utm_medium)   <= 80),
  utm_campaign  text check (utm_campaign is null or char_length(utm_campaign) <= 120),

  -- Scoping multi-agencia del tablero. Se resuelve SERVER-SIDE desde
  -- property_slug; el cliente nunca lo manda. Null = trafico general
  -- (home, listado sin propiedad). on delete set null: borrar una agencia
  -- no borra las metricas historicas.
  agency_id     uuid references public.agencies(id) on delete set null,

  -- Identificador PSEUDONIMO DIARIO (ver PRIVACIDAD en el header).
  -- NULL cuando no hay sal configurada: el tablero debe tolerar ese caso
  -- y NO reportar "visitantes unicos" cuando la columna viene vacia.
  visit_hash    text
                check (visit_hash is null or char_length(visit_hash) = 16),

  -- INVARIANTE: un wa_click siempre sabe de que superficie vino;
  -- un pageview nunca tiene superficie. Coherencia exigida por la base.
  constraint site_events_source_coherente check (
    (event_type = 'wa_click' and source is not null) or
    (event_type = 'pageview' and source is null)
  )
);

comment on table public.site_events is
  'S20: telemetria observada del sitio publico (pageviews + wa_click). No persiste IP, user-agent ni cookies; visit_hash es un pseudonimo diario derivado de IP/UA con sal secreta, sin identificador cross-day. Escritura solo service_role via POST /api/events.';

-- ----------------------------------------------------------
-- 2. Indices — pensados para las consultas reales del tablero.
-- ----------------------------------------------------------

-- "visitas por dia (ultimos 30)" y "wa_click totales": filtran por tipo y
-- ordenan por tiempo descendente.
create index if not exists site_events_type_time_idx
  on public.site_events (event_type, occurred_at desc);

-- "top propiedades por visitas" y "wa_click por propiedad".
create index if not exists site_events_slug_time_idx
  on public.site_events (property_slug, occurred_at desc)
  where property_slug is not null;

-- Scoping por agencia del tablero (selector de AMBITO).
create index if not exists site_events_agency_time_idx
  on public.site_events (agency_id, occurred_at desc)
  where agency_id is not null;

-- "wa_click por superficie".
create index if not exists site_events_source_time_idx
  on public.site_events (source, occurred_at desc)
  where source is not null;

-- ----------------------------------------------------------
-- 3. RLS default-deny — mismo patron que property_images (0012) y que el
--    estado de notificacion de leads.
--
--    RLS habilitada SIN NINGUNA POLITICA:
--      * anon         -> sin lectura ni escritura, ni de conteo.
--      * authenticated-> idem.
--      * service_role -> bypassa RLS (unico camino real).
--
--    Escritura: exclusivamente server-side desde POST /api/events.
--    Lectura:   exclusivamente server-side desde /admin/estadisticas, con
--               el filtro de agencia aplicado en la query (mismo patron
--               que properties). El scoping NO se delega al cliente.
--
--    force row level security: la regla aplica incluso al owner de la
--    tabla, para que ningun rol privilegiado la esquive por accidente.
-- ----------------------------------------------------------
alter table public.site_events enable row level security;
alter table public.site_events force  row level security;
