-- ==========================================================
-- Migracion 0017: SOURCE 'card-mapa' EN site_events (S26-MAP-01)
-- Aditiva (amplia una allowlist), idempotente, reversible.
-- ==========================================================
-- GATE: NO aplicar sin decision directiva explicita del titular.
--
-- POR QUE EXISTE:
--   0014 dejo la allowlist de `source` como CHECK en la base, a
--   proposito, para que un valor invalido lo rechace Postgres y no
--   dependa de la app. El mapa estrategico (S26) agrega una superficie
--   nueva de click: 'card-mapa'. Sin esta migracion, cada click de
--   WhatsApp desde el mapa es rechazado por el CHECK y el evento se
--   pierde en silencio (trackSiteEvent es fail-silent por diseno: el
--   link a wa.me funciona igual, pero el tablero no lo cuenta).
--
-- NOMBRE REAL DEL CONSTRAINT (verificado en produccion 13/09/2026):
--   site_events_source_check  <- autogenerado por el CHECK inline de
--   0014. No inventar otro nombre: un `drop constraint if exists` con
--   nombre equivocado no falla, no borra nada, y el `add` posterior
--   choca con el constraint viejo que sigue vivo.
--
-- ORDEN DE DESPLIEGUE (obligatorio):
--   1) aplicar esta migracion   2) mergear el PR de UI.
--   Al reves no rompe el sitio, pero se pierden los clicks del mapa
--   hasta que se aplique (mismo peligro de orden que el incidente 0009).
--
-- ROLLBACK:
--   alter table public.site_events drop constraint if exists site_events_source_check;
--   alter table public.site_events add constraint site_events_source_check
--     check (source is null or source in ('card-listado','card-home','ficha','cta-home','footer','footer-contacto'));
--   (solo posible si no quedaron filas con 'card-mapa'; si las hay, borrarlas
--    o dejar el constraint ampliado: un rollback que falla es peor que el cambio.)
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
      'card-mapa'
    )
  );

comment on constraint site_events_source_check on public.site_events is
  'Allowlist de superficies de click. Espejo de WA_SOURCES en src/lib/events.ts: ampliar SIEMPRE los dos juntos (guarda G3).';
