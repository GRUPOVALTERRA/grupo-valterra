-- ==========================================================
-- Migracion 0018: SOURCE 'navbar-publicar' EN site_events (S27)
-- Aditiva (amplia una allowlist), idempotente, reversible.
-- ==========================================================
-- GATE: NO aplicar sin decision directiva explicita del titular.
--
-- POR QUE EXISTE:
--   El boton "Publicar propiedad" del header (desktop y menu mobile)
--   dejo de bajar a /#contacto y ahora abre WhatsApp directo con un
--   mensaje de captacion prellenado. Es una superficie de click nueva:
--   'navbar-publicar'. Sin esta migracion, cada click de ese boton lo
--   rechaza el CHECK y el evento se pierde en silencio (trackSiteEvent
--   es fail-silent por diseno: el link a wa.me funciona igual, pero el
--   tablero no lo cuenta).
--
-- POR QUE UNA SUPERFICIE PROPIA Y NO 'cta-home':
--   Es el unico click de INTENCION DE CAPTACION del sitio (un
--   propietario que quiere publicar), no de demanda de compra. Mezclarlo
--   con 'cta-home' arruinaria las dos metricas a la vez.
--
-- NOMBRE REAL DEL CONSTRAINT (verificado en produccion 17/09/2026):
--   site_events_source_check  <- autogenerado por el CHECK inline de
--   0014 y redefinido por 0017. No inventar otro nombre: un
--   `drop constraint if exists` con nombre equivocado no falla, no
--   borra nada, y el `add` posterior choca con el constraint vivo.
--
-- ORDEN DE DESPLIEGUE (obligatorio):
--   1) aplicar esta migracion   2) mergear el PR de UI.
--   Al reves no rompe el sitio ni el boton, pero se pierden los clicks
--   del header hasta que se aplique.
--
-- ROLLBACK:
--   alter table public.site_events drop constraint if exists site_events_source_check;
--   alter table public.site_events add constraint site_events_source_check
--     check (source is null or source in ('card-listado','card-home','ficha','cta-home','footer','footer-contacto','card-mapa'));
--   (solo posible si no quedaron filas con 'navbar-publicar'; si las hay,
--    borrarlas o dejar el constraint ampliado: un rollback que falla es
--    peor que el cambio.)
-- ==========================================================

alter table public.site_events
  drop constraint if exists site_events_source_check;

alter table public.site_events
  add constraint site_events_source_check
  check (
    source is null
    or source in (
      'card-listado',
      'card-home',
      'ficha',
      'cta-home',
      'footer',
      'footer-contacto',
      'card-mapa',
      'navbar-publicar'
    )
  );

comment on constraint site_events_source_check on public.site_events is
  'Allowlist de superficies de click. Espejo de WA_SOURCES en src/lib/events.ts: ampliar SIEMPRE los dos juntos (guarda G3).';
