-- ==========================================================
-- Migracion 0019: SOURCE 'cta-publicar' EN site_events (S27)
-- Aditiva (amplia una allowlist), idempotente, reversible.
-- ==========================================================
-- GATE: NO aplicar sin decision directiva explicita del titular.
--
-- POR QUE EXISTE:
--   La tarjeta "Publica tu propiedad" de la seccion CTA de la home dejo
--   de bajar a /#contacto y ahora abre WhatsApp con el mismo mensaje de
--   captacion que el boton del header (0018). Es una superficie de click
--   nueva: 'cta-publicar'. Sin esta migracion el CHECK rechaza el evento
--   y el click se pierde en silencio (trackSiteEvent es fail-silent: el
--   link a wa.me funciona igual, pero el tablero no lo cuenta).
--
-- POR QUE NO REUSAR 'cta-home':
--   'cta-home' es el boton "WhatsApp directo" de la MISMA seccion, que
--   es consulta de compra. Con una sola source las dos tarjetas quedan
--   indistinguibles y se pierde justo la comparacion que interesa:
--   cuanta captacion genera la home frente a cuanta demanda.
--
-- NOMBRE REAL DEL CONSTRAINT (verificado en produccion 17/09/2026):
--   site_events_source_check  <- autogenerado por el CHECK inline de
--   0014 y redefinido por 0017 y 0018. No inventar otro nombre: un
--   `drop constraint if exists` con nombre equivocado no falla, no
--   borra nada, y el `add` posterior choca con el constraint vivo.
--
-- ORDEN DE DESPLIEGUE (obligatorio):
--   1) aplicar esta migracion   2) mergear el PR de UI.
--
-- ROLLBACK:
--   alter table public.site_events drop constraint if exists site_events_source_check;
--   alter table public.site_events add constraint site_events_source_check
--     check (source is null or source in ('card-listado','card-home','ficha','cta-home','footer','footer-contacto','card-mapa','navbar-publicar'));
--   (solo posible si no quedaron filas con 'cta-publicar'; si las hay,
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
      'navbar-publicar',
      'cta-publicar'
    )
  );

comment on constraint site_events_source_check on public.site_events is
  'Allowlist de superficies de click. Espejo de WA_SOURCES en src/lib/events.ts: ampliar SIEMPRE los dos juntos (guarda G3).';
