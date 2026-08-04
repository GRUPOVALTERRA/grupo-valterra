-- ==========================================================
-- Migracion 0011: claim atomico del reintento manual de aviso
-- Sprint 16 · S16-LEAD-OBS PR3 · Aditiva pura e idempotente.
-- ==========================================================
-- Por que una funcion NUEVA y no begin_lead_notification_attempt:
-- `begin` es atomica para incrementar, pero NO es exclusiva. Su WHERE solo
-- excluye 'sent', asi que dos requests concurrentes la ganarian AMBOS y el
-- resultado serian dos correos. El reintento manual necesita un CLAIM:
-- exactamente un request lo adquiere y los demas pierden la carrera.
--
-- Como se logra la exclusividad SIN un estado nuevo:
-- el claim TRANSICIONA el lead a 'pending' en la misma sentencia que lo
-- verifica. El UPDATE toma el row-lock; el segundo request concurrente espera
-- el commit, reevalua el WHERE, ve 'pending' reciente y actualiza 0 filas.
-- 'pending' ya significa "procesamiento en curso o sin resultado" (0010), asi
-- que no se invento semantica nueva.
--
-- Recuperacion (leads no quedan bloqueados): si el proceso muere despues del
-- claim y nunca llega el finish, el lead queda 'pending' con notify_last_at
-- sellado — en la UI ese estado se denomina "Intento interrumpido". Un
-- 'pending' cuyo claim tiene 15 minutos O MAS (<=) vuelve a ser reclamable
-- (ventana >> timeout real del envio, que es de segundos). Un 'pending'
-- FRESCO nunca es reclamable. El umbral vive ACA (now() del servidor de
-- base = tiempo autoritativo); la constante de la UI es solo presentacion y
-- un test falla si ambas definiciones divergen.
--
-- NO reclamables jamas: 'sent' (el proveedor ya acepto el correo),
-- 'unknown' (historico sin evidencia: no es una cola) y valores fuera del
-- CHECK de 0010 (no existen en la base).
--
-- Scoping: p_agency_id es la agencia del lead RESUELTA POR EL SERVIDOR tras
-- autorizar al actor. `is not distinct from` pinea tambien el caso de lead
-- sin agencia (solo super-admin llega ahi). Si la agencia cambio entre la
-- lectura y el claim, el claim falla: defensa en profundidad, nunca la unica.
--
-- PII: esta funcion no lee ni escribe ningun dato de contacto.
--
-- Aplicar: Supabase Studio - SQL Editor - Run.
-- (NO aplicar en Production dentro del gate PR3: decision separada.)
--
-- Rollback (no destruye datos de negocio):
--   drop function if exists public.claim_lead_notification_retry(text, text);
-- ==========================================================

create or replace function public.claim_lead_notification_retry(
  p_lead_id   text,
  p_agency_id text
)
returns smallint
language sql
security invoker
set search_path = ''
as $$
  update public.leads
     set notify_status   = 'pending',
         notify_attempts = notify_attempts + 1,
         notify_last_at  = now()
   where id = p_lead_id
     and agency_id is not distinct from p_agency_id
     and (
       notify_status in ('failed', 'skipped')
       or (
         notify_status = 'pending'
         and notify_last_at is not null
         and notify_last_at <= now() - interval '15 minutes'
       )
     )
  returning notify_attempts;
$$;

comment on function public.claim_lead_notification_retry(text, text) is
  'S16-LEAD-OBS PR3: claim atomico y exclusivo del reintento manual. Solo failed/skipped (o pending con claim vencido >15min). Transiciona a pending, incrementa attempts y sella last_at en una sentencia. NULL = claim no adquirido.';

-- ----------------------------------------------------------
-- Permisos: identicos al criterio de 0010. La funcion se invoca SOLO desde el
-- servidor con service_role; security invoker + revoke impiden que anon o
-- authenticated alteren el estado aunque lograran invocarla.
-- ----------------------------------------------------------
revoke all on function public.claim_lead_notification_retry(text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.claim_lead_notification_retry(text, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.claim_lead_notification_retry(text, text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.claim_lead_notification_retry(text, text) to service_role';
  end if;
end $$;
