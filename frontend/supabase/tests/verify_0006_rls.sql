-- ==========================================================
-- verify_0006_rls.sql — Verificador de la migración 0006
-- (fix VALTERRA-BUG-001: recursión RLS 42P17 en agency_members)
-- ==========================================================
-- ⚠️ SOLO PARA ENTORNO LOCAL / SCRATCH (crea y borra datos de
-- prueba con prefijo qa0006-). GUARD: se niega a correr salvo que
-- antes se ejecute en la MISMA sesión:
--   select set_config('valterra.allow_verify_0006', 'yes', false);
--
-- Prerrequisito: migraciones 0001–0005 + seed valterra + 0006
-- aplicadas, y entorno espejo de Supabase (roles anon/authenticated
-- con usage sobre public y auth, execute de auth.uid()).
--
-- Salida: UNA grilla (caso, esperado, obtenido, ok, detalle).
-- Toda mutación de prueba corre dentro de una subtransacción que
-- SIEMPRE se revierte (patrón raise/catch), así que los casos DML
-- no dejan cambios; las fixtures se crean con IDs fijos qa0006- y
-- se borran al final.
-- Nota de diseño: el runner usa EXECUTE (SQL dinámico) — es un
-- harness de test, no código de producción; la migración 0006 no
-- usa SQL dinámico.
-- ==========================================================

do $$ begin
  if current_setting('valterra.allow_verify_0006', true) is distinct from 'yes' then
    raise exception 'GUARD: este verificador crea datos de prueba. Ejecutar SOLO en base local/scratch y habilitar antes con: select set_config(''valterra.allow_verify_0006'',''yes'',false);';
  end if;
end $$;

-- ----------------------------------------------------------
-- Salida
-- ----------------------------------------------------------
create temp table if not exists v_out (
  n serial, caso text, esperado text, obtenido text, ok boolean, detalle text
);
truncate v_out;

-- ----------------------------------------------------------
-- Runner: ejecuta `q` (debe devolver UN text) como `rol` con el
-- jwt sub `sub`, dentro de una subtransacción que SIEMPRE se
-- revierte (el resultado viaja en la excepción V0006) → los GUC
-- (role incluido) y cualquier mutación quedan revertidos.
-- ok = (obtenido LIKE esperado || '%').
-- ----------------------------------------------------------
create or replace function pg_temp.rc(p_caso text, p_esperado text, p_sub text, p_rol text, p_q text)
returns void language plpgsql as $fn$
declare v_res text; v_obt text;
begin
  begin
    perform set_config('request.jwt.claim.sub', coalesce(p_sub,''), true);
    perform set_config('request.jwt.claims',
      case when p_sub is null then '{}' else json_build_object('sub', p_sub, 'role', p_rol)::text end, true);
    perform set_config('role', p_rol, true);
    execute p_q into v_res;
    raise sqlstate 'V0006' using message = coalesce(v_res, '<null>');
  exception
    when sqlstate 'V0006' then v_obt := sqlerrm;
    when others then v_obt := 'ERROR ' || sqlstate || ': ' || sqlerrm;
  end;
  insert into v_out(caso, esperado, obtenido, ok, detalle)
  values (p_caso, p_esperado, left(v_obt, 80), v_obt like p_esperado || '%', left(v_obt, 300));
end $fn$;

-- ----------------------------------------------------------
-- FIXTURES (IDs fijos, prefijo qa0006-; se borran al final)
-- ----------------------------------------------------------
do $$
declare
  a_id uuid; b_id uuid;
begin
  select id into a_id from public.agencies where slug = 'valterra';
  if a_id is null then raise exception 'Prerrequisito: seed valterra ausente'; end if;

  insert into public.agencies (id, slug, name)
  values ('a0000000-0000-4000-8000-00000000000b', 'qa0006-agency-b', 'QA0006 Agencia B')
  on conflict (slug) do nothing;
  select id into b_id from public.agencies where slug = 'qa0006-agency-b';

  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-000000000001', 'qa0006-none@example.com'),
    ('00000000-0000-4000-8000-000000000002', 'qa0006-viewer-a@example.com'),
    ('00000000-0000-4000-8000-000000000003', 'qa0006-agent-a@example.com'),
    ('00000000-0000-4000-8000-000000000004', 'qa0006-admin-a@example.com'),
    ('00000000-0000-4000-8000-000000000005', 'qa0006-owner-a@example.com'),
    ('00000000-0000-4000-8000-000000000006', 'qa0006-owner-b@example.com'),
    ('00000000-0000-4000-8000-000000000007', 'qa0006-dual@example.com')
  on conflict (id) do nothing;

  insert into public.agency_members (agency_id, user_id, role) values
    (a_id, '00000000-0000-4000-8000-000000000002', 'viewer'),
    (a_id, '00000000-0000-4000-8000-000000000003', 'agent'),
    (a_id, '00000000-0000-4000-8000-000000000004', 'admin'),
    (a_id, '00000000-0000-4000-8000-000000000005', 'owner'),
    (b_id, '00000000-0000-4000-8000-000000000006', 'owner'),
    (a_id, '00000000-0000-4000-8000-000000000007', 'viewer'),
    (b_id, '00000000-0000-4000-8000-000000000007', 'owner')
  on conflict do nothing;

  insert into public.properties (id, slug, title, price, currency, operation_type, property_type, city, province, agency_id, published) values
    ('qa0006-pa-pub',   'qa0006-pa-pub',   'QA0006 A publicada', 100, 'USD', 'venta', 'casa', 'Corrientes', 'Corrientes', a_id, true),
    ('qa0006-pa-draft', 'qa0006-pa-draft', 'QA0006 A borrador',  100, 'USD', 'venta', 'casa', 'Corrientes', 'Corrientes', a_id, false),
    ('qa0006-pb-pub',   'qa0006-pb-pub',   'QA0006 B publicada', 100, 'USD', 'venta', 'casa', 'Corrientes', 'Corrientes', b_id, true),
    ('qa0006-pb-draft', 'qa0006-pb-draft', 'QA0006 B borrador',  100, 'USD', 'venta', 'casa', 'Corrientes', 'Corrientes', b_id, false)
  on conflict (id) do nothing;

  insert into public.leads (id, name, phone, message, source, status, agency_id) values
    ('qa0006-la-1', 'QA0006 Lead A1', '+540000000001', 'lead de prueba qa0006', 'contact-form', 'new', a_id),
    ('qa0006-la-2', 'QA0006 Lead A2', '+540000000002', 'lead de prueba qa0006', 'contact-form', 'new', a_id),
    ('qa0006-lb-1', 'QA0006 Lead B1', '+540000000003', 'lead de prueba qa0006', 'contact-form', 'new', b_id)
  on conflict (id) do nothing;
end $$;

-- ----------------------------------------------------------
-- SHADOW para X7 (search_path hijack): tabla temp homónima
-- public→pg_temp.agency_members con una fila falsa que daría a
-- viewer_a un rol owner en la agencia B. El helper la debe ignorar.
-- ----------------------------------------------------------
create temp table agency_members (agency_id uuid, user_id uuid, role text);
insert into agency_members values
  ('a0000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000002', 'owner');
grant select on agency_members to authenticated, anon;

-- ----------------------------------------------------------
-- CHECKS ESTÁTICOS (como postgres) — función y policies
-- ----------------------------------------------------------
do $$
declare
  v_cnt int; v_txt text; v_bool boolean;
  fn oid := 'public.auth_memberships()'::regprocedure;
begin
  -- S1 SECURITY DEFINER
  select prosecdef into v_bool from pg_proc where oid = fn;
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S1_helper_security_definer','true', v_bool::text, v_bool, 'prosecdef');

  -- S2 volatilidad STABLE
  select provolatile into v_txt from pg_proc where oid = fn;
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S2_helper_stable','s', v_txt, v_txt = 's', 'provolatile (s=stable)');

  -- S3 search_path fijado
  select coalesce(array_to_string(proconfig, ';'),'<sin proconfig>') into v_txt from pg_proc where oid = fn;
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S3_helper_search_path_fijado','search_path=', v_txt, v_txt like '%search_path=%', 'proconfig');

  -- S4 owner postgres
  select pg_get_userbyid(proowner) into v_txt from pg_proc where oid = fn;
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S4_helper_owner','postgres', v_txt, v_txt = 'postgres', 'proowner');

  -- S5 ACL: PUBLIC y anon SIN execute; authenticated CON execute
  select
    not has_function_privilege('anon', fn, 'execute')
    and has_function_privilege('authenticated', fn, 'execute')
    and not exists (
      select 1 from aclexplode((select proacl from pg_proc where oid = fn)) a
       where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    into v_bool;
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S5_helper_acl_minima','true', v_bool::text, v_bool,
     'anon sin EXECUTE, authenticated con EXECUTE, PUBLIC(grantee 0) sin EXECUTE');

  -- S6 total de policies en las 4 tablas = 13 (12 de 0005 + CAMBIO-AUT-1)
  select count(*) into v_cnt from pg_policies
   where schemaname='public' and tablename in ('properties','leads','agencies','agency_members');
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S6_total_policies','13', v_cnt::text, v_cnt = 13, '12 originales (9 reescritas + 3 preservadas) + 1 nueva');

  -- S7 cero auto-referencias: ninguna policy de agency_members
  --    menciona la tabla agency_members en qual/with_check
  select count(*) into v_cnt from pg_policies
   where schemaname='public' and tablename='agency_members'
     and (coalesce(qual,'') ilike '%agency_members%' or coalesce(with_check,'') ilike '%agency_members%');
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S7_sin_autoreferencia','0', v_cnt::text, v_cnt = 0, 'policies de agency_members que referencian agency_members');

  -- S8 las 9 reescritas + managers/owners usan el helper
  select count(*) into v_cnt from pg_policies
   where schemaname='public' and tablename in ('properties','leads','agencies','agency_members')
     and (coalesce(qual,'') ilike '%auth_memberships%' or coalesce(with_check,'') ilike '%auth_memberships%');
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S8_policies_via_helper','9', v_cnt::text, v_cnt = 9, 'policies cuyo USING/CHECK usa auth_memberships()');

  -- S9 preservadas intactas
  select count(*) into v_cnt from pg_policies
   where schemaname='public' and (
     (tablename='properties' and policyname='anon select published properties' and lower(regexp_replace(qual,'\s','','g')) = '(published=true)') or
     (tablename='agencies' and policyname='anon select agencies public' and lower(regexp_replace(qual,'\s','','g')) = 'true') or
     (tablename='agency_members' and policyname='self select memberships' and lower(regexp_replace(qual,'\s','','g')) = '(user_id=auth.uid())'));
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S9_policies_preservadas','3', v_cnt::text, v_cnt = 3, 'anon properties + anon agencies + self memberships con qual original');

  -- S10 nómina exacta (ausentes / extras)
  with esperadas(t, p) as (values
    ('properties','anon select published properties'),
    ('properties','members select own properties'),
    ('properties','members insert own properties'),
    ('properties','members update own properties'),
    ('properties','managers delete own properties'),
    ('leads','members select own leads'),
    ('leads','members update own leads'),
    ('agencies','anon select agencies public'),
    ('agencies','managers update agency'),
    ('agencies','authenticated select agencies public'),
    ('agency_members','self select memberships'),
    ('agency_members','managers select agency members'),
    ('agency_members','owners manage members'))
  select coalesce(string_agg(x.lbl, ' | '), 'ninguna') into v_txt from (
    select 'AUSENTE:' || e.t || '.' || e.p as lbl from esperadas e
     where not exists (select 1 from pg_policies g where g.schemaname='public' and g.tablename=e.t and g.policyname=e.p)
    union all
    select 'EXTRA:' || g.tablename || '.' || g.policyname from pg_policies g
     where g.schemaname='public' and g.tablename in ('properties','leads','agencies','agency_members')
       and not exists (select 1 from esperadas e where e.t=g.tablename and e.p=g.policyname)) x;
  insert into v_out(caso,esperado,obtenido,ok,detalle) values
    ('S10_nomina_policies','ninguna', v_txt, v_txt = 'ninguna', 'policies ausentes o extra vs nómina esperada');
end $$;

-- ----------------------------------------------------------
-- CASOS DINÁMICOS (todo se revierte; nada persiste)
-- sub de cada usuario de prueba:
--  none  ...0001 · viewer_a ...0002 · agent_a ...0003 · admin_a ...0004
--  owner_a ...0005 · owner_b ...0006 · dual ...0007
-- ----------------------------------------------------------
do $$
declare
  s_none  text := '00000000-0000-4000-8000-000000000001';
  s_view  text := '00000000-0000-4000-8000-000000000002';
  s_agent text := '00000000-0000-4000-8000-000000000003';
  s_admin text := '00000000-0000-4000-8000-000000000004';
  s_owner text := '00000000-0000-4000-8000-000000000005';
  s_ownb  text := '00000000-0000-4000-8000-000000000006';
  s_dual  text := '00000000-0000-4000-8000-000000000007';
  q_props text := 'select count(*)::text from public.properties where id like ''qa0006-%''';
  q_leads text := 'select count(*)::text from public.leads where id like ''qa0006-%''';
  q_membs text := 'select count(*)::text from public.agency_members';
begin
  -- ===== CASO A — usuario autenticado SIN membership =====
  perform pg_temp.rc('A1_none_agency_members','0', s_none, 'authenticated', q_membs);
  perform pg_temp.rc('A2_none_leads','0', s_none, 'authenticated', q_leads);
  perform pg_temp.rc('A3_none_properties_solo_publicadas','2', s_none, 'authenticated', q_props);
  perform pg_temp.rc('A4_none_helper_vacio','0', s_none, 'authenticated',
    'select count(*)::text from public.auth_memberships()');

  -- ===== CASO B — viewer de A =====
  perform pg_temp.rc('B1_viewer_memberships_visibles_solo_propia','1', s_view, 'authenticated', q_membs);
  perform pg_temp.rc('B2_viewer_properties_pub2_mas_draft_A','3', s_view, 'authenticated', q_props);
  perform pg_temp.rc('B3_viewer_leads_de_A','2', s_view, 'authenticated', q_leads);
  perform pg_temp.rc('B4_viewer_no_update_lead','0', s_view, 'authenticated',
    'with x as (update public.leads set status=''contacted'' where id=''qa0006-la-1'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('B5_viewer_no_update_property','0', s_view, 'authenticated',
    'with x as (update public.properties set title=''hack'' where id=''qa0006-pa-pub'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('B6_viewer_no_insert_property','ERROR 42501', s_view, 'authenticated',
    'with x as (insert into public.properties (id,slug,title,price,currency,operation_type,property_type,city,province,agency_id,published) select ''qa0006-hack'',''qa0006-hack'',''hack'',1,''USD'',''venta'',''casa'',''C'',''C'',id,true from public.agencies where slug=''valterra'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('B7_viewer_no_ve_draft_B','0', s_view, 'authenticated',
    'select count(*)::text from public.properties where id=''qa0006-pb-draft''');

  -- ===== CASO C — agent de A =====
  perform pg_temp.rc('C1_agent_memberships_solo_propia','1', s_agent, 'authenticated', q_membs);
  perform pg_temp.rc('C2_agent_update_lead_A','1', s_agent, 'authenticated',
    'with x as (update public.leads set status=''contacted'' where id=''qa0006-la-1'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('C3_agent_update_property_A','1', s_agent, 'authenticated',
    'with x as (update public.properties set title=''QA0006 edit'' where id=''qa0006-pa-pub'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('C4_agent_insert_property_A','1', s_agent, 'authenticated',
    'with x as (insert into public.properties (id,slug,title,price,currency,operation_type,property_type,city,province,agency_id,published) select ''qa0006-tmp'',''qa0006-tmp'',''QA0006 tmp property'',1,''USD'',''venta'',''casa'',''Corrientes'',''Corrientes'',id,true from public.agencies where slug=''valterra'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('C5_agent_no_delete_property','0', s_agent, 'authenticated',
    'with x as (delete from public.properties where id=''qa0006-pa-draft'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('C6_agent_no_update_lead_B','0', s_agent, 'authenticated',
    'with x as (update public.leads set status=''contacted'' where id=''qa0006-lb-1'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('C7_agent_no_admin_members','ERROR 42501', s_agent, 'authenticated',
    'with x as (insert into public.agency_members (agency_id,user_id,role) select id, ''00000000-0000-4000-8000-000000000001''::uuid, ''viewer'' from public.agencies where slug=''valterra'' returning 1) select count(*)::text from x');

  -- ===== CASO D — admin de A =====
  perform pg_temp.rc('D1_admin_ve_members_de_A','5', s_admin, 'authenticated', q_membs);
  perform pg_temp.rc('D2_admin_update_agency_A','1', s_admin, 'authenticated',
    'with x as (update public.agencies set contact_phone=''+54000'' where slug=''valterra'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('D3_admin_update_lead_A','1', s_admin, 'authenticated',
    'with x as (update public.leads set status=''qualified'' where id=''qa0006-la-2'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('D4_admin_delete_property_A','1', s_admin, 'authenticated',
    'with x as (delete from public.properties where id=''qa0006-pa-draft'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('D5_admin_NO_gestiona_members','0', s_admin, 'authenticated',
    'with x as (update public.agency_members set role=''agent'' where user_id=''00000000-0000-4000-8000-000000000002'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('D6_admin_no_update_agency_B','0', s_admin, 'authenticated',
    'with x as (update public.agencies set contact_phone=''+54000'' where slug=''qa0006-agency-b'' returning 1) select count(*)::text from x');

  -- ===== CASO E — owner de A =====
  perform pg_temp.rc('E1_owner_ve_members_de_A','5', s_owner, 'authenticated', q_membs);
  perform pg_temp.rc('E2_owner_cambia_rol_member_A','1', s_owner, 'authenticated',
    'with x as (update public.agency_members set role=''agent'' where user_id=''00000000-0000-4000-8000-000000000002'' and role=''viewer'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('E3_owner_remueve_member_A','1', s_owner, 'authenticated',
    'with x as (delete from public.agency_members where user_id=''00000000-0000-4000-8000-000000000003'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('E4_owner_A_no_ve_members_B','0', s_owner, 'authenticated',
    'select count(*)::text from public.agency_members m join public.agencies a on a.id=m.agency_id where a.slug=''qa0006-agency-b''');
  perform pg_temp.rc('E5_owner_A_no_modifica_members_B','0', s_owner, 'authenticated',
    'with x as (update public.agency_members m set role=''viewer'' from public.agencies a where a.id=m.agency_id and a.slug=''qa0006-agency-b'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('E6_owner_A_no_inserta_en_B','ERROR 42501', s_owner, 'authenticated',
    'with x as (insert into public.agency_members (agency_id,user_id,role) select id, ''00000000-0000-4000-8000-000000000001''::uuid, ''viewer'' from public.agencies where slug=''qa0006-agency-b'' returning 1) select count(*)::text from x');

  -- ===== CASO F — aislamiento cruzado / doble membership =====
  perform pg_temp.rc('F1_dual_helper_dos_memberships','2', s_dual, 'authenticated',
    'select count(*)::text from public.auth_memberships()');
  perform pg_temp.rc('F2_dual_properties_ambas','4', s_dual, 'authenticated', q_props);
  perform pg_temp.rc('F3_dual_leads_ambas','3', s_dual, 'authenticated', q_leads);
  perform pg_temp.rc('F4_dual_members_visibles','3', s_dual, 'authenticated', q_membs);
  perform pg_temp.rc('F5_dual_owner_B_gestiona_B','1', s_dual, 'authenticated',
    'with x as (update public.agency_members set role=''owner'' where user_id=''00000000-0000-4000-8000-000000000006'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('F6_dual_viewer_A_no_gestiona_A','0', s_dual, 'authenticated',
    'with x as (update public.agency_members m set role=''viewer'' from public.agencies a where a.id=m.agency_id and a.slug=''valterra'' and m.user_id=''00000000-0000-4000-8000-000000000005'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('F7_ownerB_no_ve_leads_A','1', s_ownb, 'authenticated', q_leads);

  -- ===== CASO G — anon =====
  perform pg_temp.rc('G1_anon_properties_solo_publicadas','2', null, 'anon', q_props);
  perform pg_temp.rc('G2_anon_leads_cero','0', null, 'anon', q_leads);
  perform pg_temp.rc('G3_anon_members_cero','0', null, 'anon', q_membs);
  perform pg_temp.rc('G4_anon_agencies_publicas','2', null, 'anon',
    'select count(*)::text from public.agencies where slug in (''valterra'',''qa0006-agency-b'')');

  -- ===== CAMBIO-AUT-1 — agencies para authenticated =====
  perform pg_temp.rc('H1_auth_agencies_publicas','2', s_none, 'authenticated',
    'select count(*)::text from public.agencies where slug in (''valterra'',''qa0006-agency-b'')');
  perform pg_temp.rc('H2_join_membership_agencies_funciona','valterra', s_view, 'authenticated',
    'select coalesce(string_agg(a.slug, '',''), ''<null>'') from public.agency_members m left join public.agencies a on a.id = m.agency_id where m.user_id = auth.uid()');

  -- ===== SABOTAJES =====
  perform pg_temp.rc('X1_helper_como_anon_denegado','ERROR 42501', null, 'anon',
    'select count(*)::text from public.auth_memberships()');
  perform pg_temp.rc('X2_jwt_sin_sub_todo_publico','2', null, 'authenticated', q_props);
  perform pg_temp.rc('X3_jwt_sin_sub_leads_cero','0', null, 'authenticated', q_leads);
  perform pg_temp.rc('X4_usuario_inexistente_cero_privado','0',
    'ffffffff-ffff-4fff-8fff-ffffffffffff', 'authenticated', q_leads);
  perform pg_temp.rc('X5_agent_no_se_autopromueve','0', s_agent, 'authenticated',
    'with x as (update public.agency_members set role=''owner'' where user_id=''00000000-0000-4000-8000-000000000003'' returning 1) select count(*)::text from x');
  perform pg_temp.rc('X6_owner_no_borra_member_de_B','0', s_owner, 'authenticated',
    'with x as (delete from public.agency_members where user_id=''00000000-0000-4000-8000-000000000006'' returning 1) select count(*)::text from x');
  -- X7: shadow temp table homónima "agency_members" con una fila
  -- falsa (membership en B). El query fuerza search_path=pg_temp,public
  -- ANTES de llamar al helper: uno mal escrito tomaría la sombra; el
  -- nuestro (search_path='' + public.agency_members) la ignora → 1 (solo A).
  perform pg_temp.rc('X7_shadow_temp_table_ignorada','1', s_view, 'authenticated',
    'select count(*)::text from (select set_config(''search_path'',''pg_temp,public'',true)) c, public.auth_memberships() m');
  -- X8: alterar el search_path de sesión no cambia el resultado del
  -- helper (inmune por set search_path propio).
  perform pg_temp.rc('X8_search_path_sesion_alterado','1', s_view, 'authenticated',
    'select count(*)::text from (select set_config(''search_path'', ''pg_temp, public'', true)) c, public.auth_memberships() m');
  perform pg_temp.rc('X9_recursion_indirecta_50_queries','50', s_view, 'authenticated',
    'select count(*)::text from generate_series(1,50) g, lateral (select count(*) from public.leads where id like ''qa0006-%'') l');
  perform pg_temp.rc('X10_helper_solo_filas_propias','viewer', s_view, 'authenticated',
    'select coalesce(string_agg(distinct role, '',''), ''<vacio>'') from public.auth_memberships()');
end $$;

-- Nota X7: mk_shadow crea una tabla temp homónima "agency_members"
-- con una fila falsa que le daría al atacante membership en B; si
-- el helper o las policies la tomaran (search_path hijack), los
-- counts cambiarían. Definirla antes del DO de casos:
--   (se define aquí abajo porque pg_temp.rc ya existe; el runner
--    la invoca en X7 vía pg_temp.mk_shadow())

-- ----------------------------------------------------------
-- RESULTADO ÚNICO
-- ----------------------------------------------------------
select caso, esperado, obtenido, ok, detalle
  from v_out
 order by n;

-- Resumen (segunda consulta informativa; la grilla de arriba es la evidencia)
select count(*) filter (where ok) || '/' || count(*) as verdes,
       coalesce(string_agg(caso, ', ') filter (where not ok), 'ninguno') as fallidos
  from v_out;

-- ----------------------------------------------------------
-- LIMPIEZA DE FIXTURES (solo datos qa0006-)
-- ----------------------------------------------------------
delete from public.leads where id like 'qa0006-%';
delete from public.properties where id like 'qa0006-%';
delete from public.agency_members where user_id in (
  select id from auth.users where email like 'qa0006-%');
delete from public.agencies where slug = 'qa0006-agency-b';
delete from auth.users where email like 'qa0006-%';
