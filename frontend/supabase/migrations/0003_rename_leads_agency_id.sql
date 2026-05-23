-- ==========================================================
-- Migracion 0003: rename inmobiliaria_id -> agency_id en leads
-- ==========================================================
-- Sprint 9.5 - consolidacion naming multi-tenant.
-- Razon: properties (mig 0002) ya usa agency_id. Sin esto, Sprint 10
-- terminaria con un FK en agencies referenciado por dos columnas con
-- nombres distintos (inmobiliaria_id vs agency_id). Cosmetico hoy,
-- bloqueante manana.
--
-- Operacion: ALTER TABLE ... RENAME COLUMN es atomica en Postgres,
-- sin downtime, sin reescritura de filas.
--
-- Cero impacto runtime:
--   - El type Lead (src/services/mock-leads.ts) NO expone inmobiliaria_id
--   - Las queries del service (SELECT/INSERT) NO referencian la columna
--   - El admin dashboard NO la lee
--
-- Aplicar desde:
--   Opcion A (CLI):  supabase db push
--   Opcion B (UI):   copiar/pegar en Supabase Studio - SQL Editor
--
-- Rollback (si fuera necesario):
--   alter table public.leads rename column agency_id to inmobiliaria_id;
--   drop index if exists public.leads_agency_idx;
--   create index leads_inmob_idx on public.leads (inmobiliaria_id);
-- ==========================================================

-- 1. Rename column
alter table public.leads
  rename column inmobiliaria_id to agency_id;

-- 2. Re-create index con nombre consistente
drop index if exists public.leads_inmob_idx;
create index if not exists leads_agency_idx
  on public.leads (agency_id);

-- 3. Comentario explicativo a nivel columna (Supabase Studio lo muestra)
comment on column public.leads.agency_id is
  'FK futura a public.agencies (Sprint 10). Nullable mientras dura el modelo single-tenant.';
