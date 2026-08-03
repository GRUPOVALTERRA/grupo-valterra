-- ==========================================================
-- Migracion 0010: estado de notificacion de leads
-- Sprint 16 · S16-LEAD-OBS PR1 · Aditiva pura e idempotente.
-- ==========================================================
-- Objetivo: hoy el resultado del envio de la notificacion se descarta.
-- Nadie puede saber, mirando el sistema, si un lead fue avisado.
-- Esta migracion agrega SOLO estado de entrega. No toca ningun campo de
-- negocio del lead ni crea indices (el volumen actual no los justifica;
-- se evaluan en PR2 cuando exista la consulta real del filtro).
--
-- PII: ninguna columna nueva guarda destinatario, asunto, cuerpo, email,
-- telefono, IP ni el mensaje del proveedor. `notify_reason` es una
-- categoria de una allowlist cerrada; `notify_message_id` es un
-- identificador opaco del proveedor.
--
-- Aplicar: Supabase Studio - SQL Editor - Run.
--
-- Rollback (no destruye datos de negocio):
--   drop function if exists public.begin_lead_notification_attempt(text);
--   drop function if exists public.finish_lead_notification_attempt(text,text,text,text);
--   alter table public.leads
--     drop column if exists notify_status,
--     drop column if exists notify_attempts,
--     drop column if exists notify_last_at,
--     drop column if exists notify_reason,
--     drop column if exists notify_message_id;
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Columnas SIN default y nullable: compatibles con el codigo
--    desplegado antes de esta migracion.
-- ----------------------------------------------------------
alter table public.leads
  add column if not exists notify_status     text,
  add column if not exists notify_attempts   smallint,
  add column if not exists notify_last_at    timestamptz,
  add column if not exists notify_reason     text,
  add column if not exists notify_message_id text;

-- ----------------------------------------------------------
-- 2. Backfill de historicos: NO son 'pending'.
--    'pending' significa "lead nuevo cuyo resultado aun no se registro".
--    De los leads anteriores a esta migracion no existe evidencia de
--    envio, y afirmarlos pendientes crearia una cola operativa falsa.
-- ----------------------------------------------------------
update public.leads
   set notify_status   = 'unknown',
       notify_reason   = 'legacy-unknown',
       notify_attempts = 0
 where notify_status is null;

-- ----------------------------------------------------------
-- 3. Defaults para filas NUEVAS (despues del backfill, para que no
--    contaminen a los historicos).
-- ----------------------------------------------------------
alter table public.leads
  alter column notify_status   set default 'pending',
  alter column notify_attempts set default 0;

-- ----------------------------------------------------------
-- 4. NOT NULL una vez que no quedan nulos.
-- ----------------------------------------------------------
alter table public.leads
  alter column notify_status   set not null,
  alter column notify_attempts set not null;

-- ----------------------------------------------------------
-- 5. Restricciones (idempotentes).
-- ----------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_notify_status_check') then
    alter table public.leads
      add constraint leads_notify_status_check
      check (notify_status in ('unknown','pending','sent','failed','skipped'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_notify_attempts_check') then
    alter table public.leads
      add constraint leads_notify_attempts_check
      check (notify_attempts >= 0);
  end if;

  -- Allowlist cerrada de categorias. Impide en la BASE que un mensaje
  -- crudo del proveedor termine persistido.
  if not exists (select 1 from pg_constraint where conname = 'leads_notify_reason_check') then
    alter table public.leads
      add constraint leads_notify_reason_check
      check (
        notify_reason is null or notify_reason in (
          'legacy-unknown','no-api-key','no-recipients',
          'provider-rejected','provider-timeout','provider-5xx','unknown'
        )
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_notify_message_id_check') then
    alter table public.leads
      add constraint leads_notify_message_id_check
      check (notify_message_id is null or char_length(notify_message_id) <= 200);
  end if;
end $$;

-- ----------------------------------------------------------
-- 6. Incremento ATOMICO del intento.
--    Leer attempts en JS, sumar y escribir genera carreras entre
--    ejecuciones concurrentes. Esta funcion resuelve el intento en una
--    sola sentencia y ademas protege la regla de negocio:
--    un lead 'sent' NUNCA se degrada.
--    Devuelve el numero de intento resultante, o NULL si no aplico.
-- ----------------------------------------------------------
create or replace function public.begin_lead_notification_attempt(p_lead_id text)
returns smallint
language sql
security definer
set search_path = public
as $$
  update public.leads
     set notify_attempts = notify_attempts + 1,
         notify_last_at  = now()
   where id = p_lead_id
     and notify_status <> 'sent'
  returning notify_attempts;
$$;

comment on function public.begin_lead_notification_attempt(text) is
  'S16-LEAD-OBS: incrementa notify_attempts atomicamente y sella notify_last_at. No aplica si el lead ya esta sent.';

-- ----------------------------------------------------------
-- 7. Registro del resultado. Tambien protege 'sent' de degradarse por
--    un resultado tardio de un intento anterior.
-- ----------------------------------------------------------
create or replace function public.finish_lead_notification_attempt(
  p_lead_id    text,
  p_status     text,
  p_reason     text,
  p_message_id text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.leads
     set notify_status     = p_status,
         notify_reason     = p_reason,
         notify_message_id = coalesce(p_message_id, notify_message_id)
   where id = p_lead_id
     and notify_status <> 'sent'
  returning true;
$$;

comment on function public.finish_lead_notification_attempt(text, text, text, text) is
  'S16-LEAD-OBS: persiste el resultado del intento. Nunca sobrescribe un lead ya sent.';
