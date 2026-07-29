-- ==========================================================
-- Migración 0008: función public.accept_agency_invite(uuid)
-- Sprint 13 · C2 — fase 1 (LÓGICA DORMIDA)
-- ==========================================================
-- Aditiva pura. NO toca tablas, policies ni datos. Crea UNA
-- función y sus grants. Al aplicarla no cambia ningún
-- comportamiento: nadie la invoca hasta la fase 3.
--
-- Depende de: 0004 (agency_members), 0006 (patrón SECURITY
-- DEFINER de auth_memberships()), 0007 (agency_invites).
--
-- ----------------------------------------------------------
-- POR QUÉ ES SECURITY DEFINER
-- ----------------------------------------------------------
-- Quien acepta una invitación es, por definición, un usuario que
-- TODAVÍA NO tiene membership en la agencia. Bajo las policies
-- vigentes no puede leer public.agency_invites (0007 sólo da
-- SELECT a managers) ni insertar en public.agency_members (0005/
-- 0006 sólo dan escritura a owners de esa agencia). La aceptación
-- necesita privilegios que el invitado no tiene y no debe tener.
--
-- Se sigue EXACTAMENTE el patrón ya auditado en la migración 0006
-- para public.auth_memberships():
--   · security definer, owner postgres
--   · set search_path = ''  → todo schema-qualified, inmune a hijacking
--   · EXECUTE revocado de public/anon, otorgado sólo a authenticated
--   · sin SQL dinámico
--
-- ----------------------------------------------------------
-- CONTRATO DE SEGURIDAD
-- ----------------------------------------------------------
-- ÚNICO parámetro: p_invite_id. Deliberadamente NO recibe agencia,
-- rol, email ni user_id: si los recibiera, el cliente podría
-- elegirlos, que es precisamente el defecto del flujo vigente
-- (pending_agency_id / pending_role en user_metadata, que el
-- usuario puede escribir con la clave ANON).
--
--   · identidad  → auth.uid()  (nunca un parámetro)
--   · email      → auth.users  (nunca un parámetro)
--   · agencia    → fila de agency_invites (server-controlled)
--   · rol        → fila de agency_invites (server-controlled)
--
-- p_invite_id NO es una credencial: por sí solo no otorga nada,
-- porque además se exige sesión válida y coincidencia de email.
--
-- NUNCA se lee user_metadata ni app_metadata.
-- NUNCA se ejecuta UPDATE sobre public.agency_members: una
-- invitación no puede elevar ni degradar una membership existente.
--
-- Aplicar: Supabase Studio → SQL Editor → pegar TODO → Run
-- Rollback: ver bloque final del archivo.
-- ==========================================================

create or replace function public.accept_agency_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid            uuid;
  v_email          text;
  v_inv            public.agency_invites%rowtype;
  v_role_before    text;   -- rol previo (null = no era miembro)
  v_role_effective text;   -- rol REAL releído de la base tras el insert
begin
  -- ------------------------------------------------------
  -- 1. Identidad: exclusivamente de la sesión
  -- ------------------------------------------------------
  v_uid := (select auth.uid());
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select lower(btrim(u.email)) into v_email
    from auth.users u
   where u.id = v_uid;

  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'user_not_found');
  end if;

  -- ------------------------------------------------------
  -- 2. Invitación bloqueada: FOR UPDATE serializa el doble
  --    clic y las aceptaciones concurrentes sobre la misma fila.
  -- ------------------------------------------------------
  select * into v_inv
    from public.agency_invites
   where id = p_invite_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- ------------------------------------------------------
  -- 3. La invitación es para ESTE email verificado
  -- ------------------------------------------------------
  if v_inv.email_normalized is distinct from v_email then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  -- ------------------------------------------------------
  -- 4. Reentrada del MISMO usuario sobre una invitación ya aceptada
  --
  --    Idempotente SÓLO si la membership sigue existiendo. Si un owner
  --    la eliminó deliberadamente después, el invitado conserva el
  --    invite_id y podría reinvocar la RPC: devolver 'already_accepted'
  --    ahí sería un FALSO ÉXITO (ok=true con role=null) y volver a
  --    insertar sería revertir una expulsión.
  --    Se responde 'membership_missing' sin recrear nada y sin tocar
  --    la invitación, que permanece 'accepted'. Recuperar el acceso
  --    exige una invitación nueva.
  -- ------------------------------------------------------
  if v_inv.status = 'accepted' then
    if v_inv.accepted_by is not distinct from v_uid then
      select m.role into v_role_effective
        from public.agency_members m
       where m.agency_id = v_inv.agency_id and m.user_id = v_uid;

      if v_role_effective is null then
        return jsonb_build_object('ok', false, 'reason', 'membership_missing');
      end if;

      return jsonb_build_object(
        'ok', true, 'reason', 'already_accepted',
        'agency_id', v_inv.agency_id,
        'role', v_role_effective,      -- rol REAL, no el solicitado
        'role_unchanged', true);
    end if;
    -- Aceptada por otra persona: no se revela quién.
    return jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', v_inv.status);
  end if;

  -- ------------------------------------------------------
  -- 5. Estados terminales (revoked / expired / failed)
  -- ------------------------------------------------------
  if v_inv.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', v_inv.status);
  end if;

  -- ------------------------------------------------------
  -- 6. Vencimiento evaluado al leer (no requiere scheduler)
  -- ------------------------------------------------------
  if v_inv.expires_at <= now() then
    update public.agency_invites
       set status = 'expired'
     where id = v_inv.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- ------------------------------------------------------
  -- 7. Integridad del destino
  -- ------------------------------------------------------
  if not exists (select 1 from public.agencies a where a.id = v_inv.agency_id) then
    return jsonb_build_object('ok', false, 'reason', 'agency_missing');
  end if;

  -- Defensa en profundidad: el CHECK de 0007 ya lo garantiza, pero
  -- la función no delega su propia seguridad en otra capa.
  if v_inv.role not in ('owner','admin','agent','viewer') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;

  -- ------------------------------------------------------
  -- 8. Membership: se CREA si no existe; NUNCA se modifica.
  -- ------------------------------------------------------
  select m.role into v_role_before
    from public.agency_members m
   where m.agency_id = v_inv.agency_id and m.user_id = v_uid;

  if v_role_before is null then
    insert into public.agency_members (agency_id, user_id, role, invited_at, joined_at)
    values (v_inv.agency_id, v_uid, v_inv.role, v_inv.created_at, now())
    on conflict (agency_id, user_id) do nothing;   -- jamás DO UPDATE
  end if;

  -- ------------------------------------------------------
  -- 9. RELECTURA OBLIGATORIA del rol efectivo.
  --    ON CONFLICT DO NOTHING puede no haber insertado nada por
  --    una carrera; el rol que se informa debe ser el que está
  --    REALMENTE en la base, no el solicitado ni el supuesto.
  -- ------------------------------------------------------
  select m.role into v_role_effective
    from public.agency_members m
   where m.agency_id = v_inv.agency_id and m.user_id = v_uid;

  if v_role_effective is null then
    -- Sin membership tras la relectura: abortar de forma segura.
    -- NO se marca accepted y NO se devuelve un falso éxito.
    update public.agency_invites
       set last_error = 'membership_not_created'
     where id = v_inv.id;
    return jsonb_build_object('ok', false, 'reason', 'membership_not_created');
  end if;

  -- ------------------------------------------------------
  -- 10. Transición terminal de la invitación
  -- ------------------------------------------------------
  update public.agency_invites
     set status      = 'accepted',
         accepted_at = now(),
         accepted_by = v_uid,
         auth_user_id = v_uid,
         last_error  = null
   where id = v_inv.id;

  return jsonb_build_object(
    'ok', true, 'reason', 'accepted',
    'agency_id', v_inv.agency_id,
    'role', v_role_effective,                      -- rol REAL de la base
    'role_unchanged', (v_role_before is not null)); -- true = ya era miembro
end
$$;

comment on function public.accept_agency_invite(uuid) is
  'Sprint 13 C2 fase 1 (dormida): aceptación atómica de una invitación de agencia. Único parámetro p_invite_id; identidad de auth.uid(), email de auth.users, agencia y rol de public.agency_invites (server-controlled). NUNCA lee user_metadata/app_metadata y NUNCA hace UPDATE de agency_members.role: no eleva ni degrada una membership existente. FOR UPDATE serializa el doble clic. Devuelve jsonb {ok, reason, agency_id?, role?, role_unchanged?}.';

-- ----------------------------------------------------------
-- Grants — mismo criterio que public.auth_memberships() (0006)
-- ----------------------------------------------------------
alter function public.accept_agency_invite(uuid) owner to postgres;
revoke all on function public.accept_agency_invite(uuid) from public;
revoke all on function public.accept_agency_invite(uuid) from anon;
grant execute on function public.accept_agency_invite(uuid) to authenticated;

-- ==========================================================
-- CONTRATO DE RESPUESTA (jsonb)
-- ==========================================================
--  ok=false · not_authenticated       sin sesión
--  ok=false · user_not_found          auth.uid() sin fila/email en auth.users
--  ok=false · not_found               invite_id inexistente
--  ok=false · email_mismatch          el email autenticado no es el invitado
--  ok=false · not_pending  (+status)  revoked / failed / accepted por otro
--  ok=false · expired                 vencida (además transiciona a 'expired')
--  ok=false · agency_missing          la agencia ya no existe
--  ok=false · invalid_role            rol fuera de la allowlist
--  ok=false · membership_not_created  relectura sin membership → aborta seguro
--  ok=false · membership_missing      ya aceptada por este usuario pero la
--                                     membership fue eliminada después: NO se
--                                     recrea (sería revertir una expulsión) y
--                                     la invitación sigue 'accepted'
--  ok=true  · already_accepted        reentrada del mismo usuario, membership viva
--  ok=true  · accepted                camino feliz
--
-- En los casos ok=true se devuelven además: agency_id, role (rol
-- REAL leído de public.agency_members) y role_unchanged.
-- ==========================================================

-- ==========================================================
-- ROLLBACK (documentado — NO automático)
-- ==========================================================
--   drop function if exists public.accept_agency_invite(uuid);
--
-- 0008 sólo agrega una función. Mientras la fase 1 esté dormida
-- nadie la invoca, por lo que el rollback es total y sin efectos.
-- La tabla de 0007, sus índices y sus policies quedan intactos.
--
-- ⚠ Si la fase 3 ya está activa, revertir esta función deja el
-- POST de /auth/confirm sin forma de aceptar invitaciones:
-- revertir ANTES el código de la aplicación.
--
-- Evidencia a guardar antes y después en producción:
--   (a) select proname, prosecdef, proconfig from pg_proc
--        where proname='accept_agency_invite';
--   (b) ACL de la función (\df+ public.accept_agency_invite);
--   (c) recuento de public.agency_members sin cambios.
-- ==========================================================
