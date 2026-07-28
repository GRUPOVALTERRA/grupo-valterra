-- ==========================================================
-- Migración 0007: tabla public.agency_invites
-- Sprint 13 · C2 — fase 1 (ESTRUCTURA DORMIDA)
-- ==========================================================
-- Aditiva pura. NO toca agencies, agency_members, leads ni
-- properties. NO crea funciones. NO modifica policies existentes.
--
-- Contexto (ver S13_C2_INVITATION_TOKENHASH_DESIGN_V1.md):
-- el flujo de invitaciones vigente es "zero-table": guarda
-- pending_agency_id / pending_role en auth.users.raw_user_meta_data
-- (= user_metadata), que el propio usuario puede escribir con la
-- clave ANON vía supabase.auth.updateUser({ data }). Usar esa
-- metadata como fuente de autorización permite auto-asignarse
-- rol y agencia arbitrarios. Esta tabla traslada la invitación a
-- un dato de negocio server-controlled, auditable y revocable.
--
-- ESTA MIGRACIÓN NO ACTIVA NADA. Al aplicarla, la tabla queda
-- vacía y sin lectores ni escritores: el código de la app sigue
-- usando el flujo viejo hasta la fase 3 del plan de migración.
--
-- Regla del proyecto establecida en C2A:
--   user_metadata es dato de presentación, NUNCA de autorización.
--
-- Aplicar:
--   Supabase Studio → SQL Editor → pegar TODO → Run
--   (previa autorización del dueño; guardar evidencia antes/después)
--
-- Rollback: ver bloque final del archivo.
-- ==========================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------
-- 1. TABLA
-- ----------------------------------------------------------
create table if not exists public.agency_invites (
  id                uuid primary key default gen_random_uuid(),

  -- Destino de la invitación. Server-controlled: NUNCA se acepta
  -- desde el cliente, query string ni user_metadata.
  agency_id         uuid not null
                      references public.agencies(id) on delete cascade,
  email_normalized  text not null,
  role              text not null,

  -- Autoría. on delete set null: preserva el historial de la
  -- invitación aunque el usuario se elimine de auth.users.
  invited_by        uuid references auth.users(id) on delete set null,
  invited_by_email  text,

  -- Se completa recién al aceptar (en el alta de un usuario nuevo
  -- todavía no existe la fila en auth.users). NUNCA se usa para autorizar.
  auth_user_id      uuid references auth.users(id) on delete set null,

  status            text not null default 'pending',

  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '7 days'),
  accepted_at       timestamptz,
  accepted_by       uuid references auth.users(id) on delete set null,
  revoked_at        timestamptz,
  revoked_by        uuid references auth.users(id) on delete set null,

  last_error        text,
  idempotency_key   text not null,

  -- --------------------------------------------------------
  -- Constraints con nombre explícito (facilitan el rollback
  -- parcial y los mensajes de error legibles).
  -- --------------------------------------------------------

  -- Email normalizado en la BASE, no sólo en la app: minúsculas,
  -- sin espacios extremos, longitud razonable.
  constraint agency_invites_email_normalized_chk
    check (email_normalized = lower(btrim(email_normalized))
           and char_length(email_normalized) between 3 and 320),

  -- Misma allowlist que public.agency_members.role (migración 0004).
  constraint agency_invites_role_chk
    check (role in ('owner','admin','agent','viewer')),

  -- Máquina de estados: sólo 'pending' es aceptable; el resto es terminal.
  constraint agency_invites_status_chk
    check (status in ('pending','accepted','expired','revoked','failed')),

  constraint agency_invites_expires_after_created_chk
    check (expires_at > created_at),

  -- Invariantes temporales de los estados terminales.
  -- ⚠ DELIBERADAMENTE se validan sólo las columnas *_at y NUNCA
  -- accepted_by / revoked_by / invited_by: esas tres son FK con
  -- ON DELETE SET NULL, y borrar el usuario dispara un UPDATE que
  -- re-evalúa los CHECK. Incluirlas haría que eliminar un usuario
  -- de auth.users FALLARA, rompiendo la limpieza de datos QA ya
  -- validada en el gate C1C4 y contradiciendo el requisito de
  -- conservar invitaciones históricas.
  constraint agency_invites_accepted_at_chk
    check (status <> 'accepted' or accepted_at is not null),
  constraint agency_invites_revoked_at_chk
    check (status <> 'revoked' or revoked_at is not null),

  constraint agency_invites_idempotency_key_chk
    check (char_length(idempotency_key) between 1 and 200)
);

comment on table public.agency_invites is
  'Sprint 13 C2 fase 1 (dormida): invitaciones a agencias como dato de negocio server-controlled. Reemplaza el uso de user_metadata (pending_agency_id / pending_role), que el usuario puede escribir con la clave ANON y por lo tanto NO es confiable para autorización. Escritura exclusiva por SERVICE_ROLE o por función SECURITY DEFINER (fase 1 no crea ninguna).';

comment on column public.agency_invites.agency_id is
  'Agencia destino. Server-controlled: se resuelve en el servidor al crear la invitación y queda congelada acá. on delete cascade: borrar la agencia invalida sus invitaciones.';

comment on column public.agency_invites.email_normalized is
  'Email destino ya normalizado (lower + btrim). El CHECK obliga la normalización en la base: es la clave contra la que se compara el email autenticado al aceptar.';

comment on column public.agency_invites.role is
  'Rol a otorgar. Se valida la autorización del invitador AL CREAR la invitación y el rol queda congelado. Misma allowlist que agency_members.role.';

comment on column public.agency_invites.auth_user_id is
  'Usuario de auth.users asociado. Nullable: en el alta de un usuario nuevo aún no existe. Informativo/auditoría: NUNCA se usa como criterio de autorización (para eso se usa auth.uid() + email verificado).';

comment on column public.agency_invites.status is
  'pending (única aceptable) | accepted | expired | revoked | failed. Todas las transiciones fuera de pending son terminales: no se reabre una invitación, se crea una nueva.';

comment on column public.agency_invites.expires_at is
  'Vencimiento explícito (default 7 días). Se evalúa AL LEER (expires_at <= now()); no requiere scheduler.';

comment on column public.agency_invites.last_error is
  'Último error operativo no fatal (p. ej. rechazo de Resend). Nunca debe contener tokens ni secretos.';

comment on column public.agency_invites.idempotency_key is
  'Clave de idempotencia por intento de emisión, generada por la aplicación. La base sólo garantiza unicidad global; la composición es responsabilidad del servicio de invitaciones.';

-- ----------------------------------------------------------
-- 2. ÍNDICES
-- ----------------------------------------------------------

-- (1) UNA sola invitación pending por (agencia, email).
--     Índice PARCIAL: los estados terminales no ocupan el cupo,
--     por lo que una invitación vencida/revocada/aceptada NO
--     bloquea una invitación futura. Y como la clave incluye
--     agency_id, el mismo email SÍ puede tener pendientes
--     simultáneas en agencias distintas.
create unique index if not exists agency_invites_one_pending_idx
  on public.agency_invites (agency_id, email_normalized)
  where status = 'pending';

-- (2) Idempotencia de emisión.
create unique index if not exists agency_invites_idempotency_idx
  on public.agency_invites (idempotency_key);

-- (3) Búsqueda de pendientes por email (fallback "aceptar desde el panel").
create index if not exists agency_invites_email_pending_idx
  on public.agency_invites (email_normalized)
  where status = 'pending';

-- (4) Listado administrativo por agencia.
create index if not exists agency_invites_agency_status_idx
  on public.agency_invites (agency_id, status, created_at desc);

-- ----------------------------------------------------------
-- 3. RLS — default deny
-- ----------------------------------------------------------
-- anon: CERO policies → sin acceso de ningún tipo.
-- authenticated: SOLO lectura, y sólo para managers (owner/admin)
--   de la agencia, vía el helper aprobado en la migración 0006
--   (SECURITY DEFINER, sin parámetros, deriva todo de auth.uid()).
-- INSERT / UPDATE / DELETE: SIN policies. Toda escritura ocurre por
--   SERVICE_ROLE (bypassa RLS) o por función SECURITY DEFINER.
-- El invitado NO puede leer su propia invitación: no lo necesita,
--   porque la aceptación pasará por una función privilegiada
--   (fase posterior). Menos superficie expuesta.
alter table public.agency_invites enable row level security;

drop policy if exists "managers select agency invites" on public.agency_invites;
create policy "managers select agency invites"
  on public.agency_invites for select
  to authenticated
  using (
    agency_id in (
      select am.agency_id from public.auth_memberships() am
       where am.role in ('owner','admin')
    )
  );

-- ==========================================================
-- ROLLBACK (documentado — NO automático)
-- ==========================================================
-- 0007 sólo AGREGA objetos nuevos. Nada preexistente depende de
-- ellos mientras la fase 1 esté dormida, por lo que el rollback
-- es total y sin pérdida de datos ajenos:
--
--   drop policy if exists "managers select agency invites" on public.agency_invites;
--   drop index if exists public.agency_invites_agency_status_idx;
--   drop index if exists public.agency_invites_email_pending_idx;
--   drop index if exists public.agency_invites_idempotency_idx;
--   drop index if exists public.agency_invites_one_pending_idx;
--   drop table if exists public.agency_invites;
--
-- (drop table elimina por sí solo policies e índices; los drops
--  individuales se listan para permitir un rollback parcial.)
--
-- ⚠ Si la fase 3 ya está activa, revertir esta tabla deja el
-- envío de invitaciones sin destino: revertir ANTES el código
-- de la aplicación.
--
-- Evidencia a guardar antes y después de aplicar en producción:
--   (a) select count(*) from pg_tables where tablename='agency_invites';
--   (b) grilla de pg_policies de public.agency_invites;
--   (c) \d+ public.agency_invites (columnas, constraints, índices);
--   (d) recuento de agency_members y auth.users sin cambios.
-- ==========================================================
