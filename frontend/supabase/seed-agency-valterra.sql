-- ==========================================================
-- Seed: Grupo Valterra agency
-- Sprint 10 MF1 · idempotente
-- ==========================================================
-- Crea la agency canonica Grupo Valterra para que MF2 pueda backfillear
-- properties.agency_id y leads.agency_id con un valor real.
--
-- NO crea memberships todavia (Sprint 10 MF3 con login).
-- NO actualiza properties/leads con agency_id (MF2).
--
-- Rollback:
--   delete from public.agencies where slug = 'valterra';
-- ==========================================================

insert into public.agencies (
  slug, name, legal_name, cuit, matricula,
  contact_email, contact_phone, whatsapp,
  address, city, province
)
values (
  'valterra',
  'Grupo Valterra',
  'Grupo Valterra · Soluciones Inmobiliarias del Litoral',
  '30-00000000-0',
  'CCIPER 0000',
  'contacto@valterra.com.ar',
  '+54 9 379 515-9096',
  '5493795159096',
  'Catamarca 1365 Piso 1 Dpto. I',
  'Corrientes',
  'Corrientes'
)
on conflict (slug) do nothing;
