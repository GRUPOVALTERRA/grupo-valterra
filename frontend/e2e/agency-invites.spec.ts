import { test, expect } from "@playwright/test";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  normalizeInviteEmail,
  isValidInviteRole,
  canGrantRole,
  buildInviteIdempotencyKey,
  INVITE_ROLES,
} from "../src/services/agency-invites-repo";

/**
 * Sprint 13 · C2 — cobertura del flujo de invitaciones.
 *
 * DOS GRUPOS, con guardas de entorno distintas:
 *
 *  1. HELPERS PUROS del repositorio — corren SIEMPRE, sin infraestructura.
 *
 *  2. INTEGRACIÓN SQL contra PostgreSQL — ejercita de verdad la migración 0007
 *     y la RPC de 0008. Requiere:
 *        INVITES_TEST_DB = cadena de conexión libpq a una base VACÍA y DESECHABLE
 *        (ej. postgres://postgres@/valterra_test?host=/tmp/pgsock&port=5433)
 *     y el binario `psql` en el PATH.
 *     El grupo se OMITE (skip) si falta la variable; nunca se marca verde sin correr.
 *
 * ⚠️ La suite CREA Y DESTRUYE objetos en esa base. Jamás apuntarla a producción:
 *     hay una guarda explícita que aborta si la URL parece de Supabase.
 */

/* ================================================================== */
/* 1. HELPERS PUROS — sin infraestructura                             */
/* ================================================================== */

test.describe("repositorio de invitaciones — helpers puros", () => {
  test("normalizeInviteEmail normaliza a minúsculas y sin espacios", () => {
    expect(normalizeInviteEmail("  Nuevo@Test.LOCAL  ")).toBe("nuevo@test.local");
    expect(normalizeInviteEmail("USER@DOMAIN.COM")).toBe("user@domain.com");
    expect(normalizeInviteEmail("a@b.co")).toBe("a@b.co");
  });

  test("normalizeInviteEmail rechaza entradas inválidas", () => {
    for (const v of [
      "",
      "   ",
      "sin-arroba",
      "a@b",
      "a b@c.com",
      "a@b c.com",
      "@dominio.com",
      "usuario@",
      null,
      undefined,
      42,
      {},
      `${"x".repeat(320)}@test.local`, // > 320
    ]) {
      expect(normalizeInviteEmail(v)).toBeNull();
    }
  });

  test("normalizeInviteEmail produce SIEMPRE un valor que satisface el CHECK de 0007", () => {
    // El CHECK exige: email = lower(btrim(email)) y longitud 3..320
    for (const raw of ["  MiXeD@Case.Com ", "plain@test.local", "UPPER@CASE.ORG"]) {
      const out = normalizeInviteEmail(raw);
      expect(out).not.toBeNull();
      expect(out).toBe(out!.trim().toLowerCase());
      expect(out!.length).toBeGreaterThanOrEqual(3);
      expect(out!.length).toBeLessThanOrEqual(320);
    }
  });

  test("isValidInviteRole = misma allowlist que el CHECK de agency_members", () => {
    expect([...INVITE_ROLES].sort()).toEqual(["admin", "agent", "owner", "viewer"]);
    for (const r of INVITE_ROLES) expect(isValidInviteRole(r)).toBe(true);
    for (const r of ["superadmin", "OWNER", "root", "", null, undefined, 1, {}]) {
      expect(isValidInviteRole(r)).toBe(false);
    }
  });

  test("canGrantRole — matriz de autorización del diseño C2 §14", () => {
    // super_admin y owner pueden otorgar los cuatro roles
    for (const inviter of ["super_admin", "owner"] as const) {
      for (const target of INVITE_ROLES) expect(canGrantRole(inviter, target)).toBe(true);
    }
    // admin sólo agent y viewer
    expect(canGrantRole("admin", "agent")).toBe(true);
    expect(canGrantRole("admin", "viewer")).toBe(true);
    expect(canGrantRole("admin", "admin")).toBe(false);
    expect(canGrantRole("admin", "owner")).toBe(false);
    // agent y viewer no invitan a nadie
    for (const inviter of ["agent", "viewer"] as const) {
      for (const target of INVITE_ROLES) expect(canGrantRole(inviter, target)).toBe(false);
    }
  });

  test("canGrantRole nunca eleva por un rol desconocido", () => {
    // Un rol que no existe jamás debe habilitar nada (default deny).
    const bogus = "root" as unknown as "admin";
    for (const target of INVITE_ROLES) expect(canGrantRole(bogus, target)).toBe(false);
  });

  test("buildInviteIdempotencyKey es determinista, acotada y sin secretos", () => {
    const k1 = buildInviteIdempotencyKey("ag-1", "a@test.local", "n1");
    const k2 = buildInviteIdempotencyKey("ag-1", "a@test.local", "n1");
    const k3 = buildInviteIdempotencyKey("ag-1", "a@test.local", "n2");
    expect(k1).toBe(k2); // mismo input → misma clave
    expect(k1).not.toBe(k3); // el nonce permite reemisión tras revocar
    expect(k1).toContain("ag-1");
    expect(k1.length).toBeLessThanOrEqual(200); // CHECK de 0007
    expect(k1).not.toMatch(/token|secret|key=|eyJ/i);
  });

  test("la clave respeta el límite del CHECK con entradas largas", () => {
    const k = buildInviteIdempotencyKey("x".repeat(300), `${"y".repeat(200)}@test.local`, "z".repeat(100));
    expect(k.length).toBeLessThanOrEqual(200);
  });
});

/* ================================================================== */
/* 2. INTEGRACIÓN SQL — migración 0007 + RPC 0008                     */
/* ================================================================== */

const PG_URL = process.env.INVITES_TEST_DB ?? "";
const HAS_PG = PG_URL.length > 0;
const execFileAsync = promisify(execFile);

/** Emulación mínima de Supabase + migraciones reales del repo. */
function buildSchemaSql(): string {
  return `
create extension if not exists "pgcrypto";
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid
language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
`;
}

function psql(sql: string, opts: { file?: boolean } = {}): string {
  const args = ["-X", "-v", "ON_ERROR_STOP=1", "-At", PG_URL];
  if (opts.file) args.push("-f", sql);
  else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8" });
}

function psqlFile(sqlText: string): string {
  const dir = mkdtempSync(join(tmpdir(), "invites-"));
  const f = join(dir, "s.sql");
  writeFileSync(f, sqlText, "utf8");
  return psql(f, { file: true });
}

/** Ejecuta la RPC como un usuario autenticado concreto y devuelve el jsonb crudo. */
function acceptAs(uid: string, inviteId: string): Record<string, unknown> {
  const out = psql(
    `select set_config('request.jwt.claim.sub','${uid}',false); ` +
      `select public.accept_agency_invite('${inviteId}'::uuid);`,
  )
    .trim()
    .split("\n")
    .pop()!;
  return JSON.parse(out) as Record<string, unknown>;
}

function inviteId(key: string): string {
  return psql(`select id from public.agency_invites where idempotency_key='${key}';`).trim();
}

function memberRole(slug: string, uid: string): string {
  return psql(
    `select coalesce(max(m.role),'') from public.agency_members m ` +
      `join public.agencies a on a.id=m.agency_id where a.slug='${slug}' and m.user_id='${uid}';`,
  ).trim();
}

// Serial: la suite comparte una única base construida en beforeAll. Sin esto,
// Playwright reparte los tests entre workers y beforeAll correría más de una vez
// (0003 hace un RENAME no idempotente y fallaría en la segunda pasada).
test.describe.configure({ mode: "serial" });

test.describe("integración SQL — agency_invites + accept_agency_invite", () => {
  test.skip(
    !HAS_PG,
    "Definí INVITES_TEST_DB con una cadena libpq a una base VACÍA y desechable (requiere psql en el PATH)",
  );

  test.beforeAll(() => {
    if (!HAS_PG) return;
    // Guarda dura: jamás contra Supabase / producción.
    if (/supabase\.co|supabase\.com/i.test(PG_URL)) {
      throw new Error("INVITES_TEST_DB apunta a Supabase. Esta suite destruye datos: abortada.");
    }
    // Idempotencia del setup: si el esquema ya está construido, no se re-aplica
    // (0003 contiene un RENAME que no es re-ejecutable).
    const already = psql(
      "select count(*) from pg_tables where schemaname='public' and tablename='agency_invites';",
    ).trim();
    if (already === "1") return;

    const root = join(process.cwd(), "supabase");
    psqlFile(buildSchemaSql());
    for (const f of [
      "migrations/0001_create_leads.sql",
      "migrations/0002_create_properties.sql",
      "migrations/0003_rename_leads_agency_id.sql",
      "migrations/0004_create_agencies.sql",
      "seed-agency-valterra.sql",
      "migrations/0005_fk_rls_backfill.sql",
      "migrations/0006_fix_agency_members_rls_recursion.sql",
      "migrations/0007_create_agency_invites.sql",
      "migrations/0008_accept_agency_invite_rpc.sql",
    ]) {
      psql(join(root, f), { file: true });
    }
    // Grants por defecto de Supabase en el schema public. Son imprescindibles
    // para que la prueba de RLS sea honesta: en Supabase `authenticated` SÍ
    // tiene privilegios de tabla y lo que filtra es la RLS. Sin estos grants
    // la consulta fallaría por permisos y el test daría un verde engañoso.
    psqlFile(`
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
`);

    // Fixtures
    psqlFile(`
insert into public.agencies (slug,name) values ('inv-a','Agencia A'),('inv-b','Agencia B')
  on conflict (slug) do nothing;
insert into auth.users (id,email) values
 ('10000000-0000-4000-8000-000000000001','nuevo@inv.local'),
 ('10000000-0000-4000-8000-000000000002','existente@inv.local'),
 ('10000000-0000-4000-8000-000000000003','yamiembro@inv.local'),
 ('10000000-0000-4000-8000-000000000004','ajeno@inv.local'),
 ('10000000-0000-4000-8000-000000000005','meta@inv.local'),
 ('10000000-0000-4000-8000-000000000006','conc@inv.local'),
 ('10000000-0000-4000-8000-000000000007','venc@inv.local'),
 ('10000000-0000-4000-8000-000000000008','revoc@inv.local')
 on conflict (id) do nothing;
insert into public.agency_members (agency_id,user_id,role)
  select a.id,'10000000-0000-4000-8000-000000000003','owner' from public.agencies a where a.slug='inv-a'
  on conflict (agency_id,user_id) do nothing;
`);
  });

  test("usuario nuevo acepta y obtiene la membership con el rol de la invitación", () => {
    psqlFile(`insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
      select a.id,'nuevo@inv.local','viewer','it-new' from public.agencies a where a.slug='inv-a';`);
    const r = acceptAs("10000000-0000-4000-8000-000000000001", inviteId("it-new"));
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("accepted");
    expect(r.role).toBe("viewer");
    expect(r.role_unchanged).toBe(false);
    expect(memberRole("inv-a", "10000000-0000-4000-8000-000000000001")).toBe("viewer");
  });

  test("usuario EXISTENTE sin membership también acepta", () => {
    psqlFile(`insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
      select a.id,'existente@inv.local','agent','it-exist' from public.agencies a where a.slug='inv-a';`);
    const r = acceptAs("10000000-0000-4000-8000-000000000002", inviteId("it-exist"));
    expect(r.ok).toBe(true);
    expect(memberRole("inv-a", "10000000-0000-4000-8000-000000000002")).toBe("agent");
  });

  test("membership existente: el rol NUNCA cambia (ni sube ni baja)", () => {
    // El usuario ya es OWNER de inv-a y se lo invita como VIEWER.
    psqlFile(`insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
      select a.id,'yamiembro@inv.local','viewer','it-role' from public.agencies a where a.slug='inv-a';`);
    const r = acceptAs("10000000-0000-4000-8000-000000000003", inviteId("it-role"));
    expect(r.ok).toBe(true);
    expect(r.role_unchanged).toBe(true);
    expect(r.role).toBe("owner"); // rol REAL de la base, no el solicitado
    expect(memberRole("inv-a", "10000000-0000-4000-8000-000000000003")).toBe("owner");
  });

  test("email distinto al de la invitación → email_mismatch y sin membership", () => {
    psqlFile(`insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
      select a.id,'nadie@inv.local','owner','it-mismatch' from public.agencies a where a.slug='inv-b';`);
    const r = acceptAs("10000000-0000-4000-8000-000000000004", inviteId("it-mismatch"));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("email_mismatch");
    expect(memberRole("inv-b", "10000000-0000-4000-8000-000000000004")).toBe("");
  });

  test("invitación VENCIDA → expired y transiciona en la base", () => {
    psqlFile(`
insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
  select a.id,'venc@inv.local','viewer','it-exp' from public.agencies a where a.slug='inv-b';
update public.agency_invites set created_at=now()-interval '30 days', expires_at=now()-interval '1 hour'
  where idempotency_key='it-exp';`);
    const r = acceptAs("10000000-0000-4000-8000-000000000007", inviteId("it-exp"));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("expired");
    expect(psql(`select status from public.agency_invites where idempotency_key='it-exp';`).trim()).toBe(
      "expired",
    );
    expect(memberRole("inv-b", "10000000-0000-4000-8000-000000000007")).toBe("");
  });

  test("invitación REVOCADA → not_pending y sin membership", () => {
    psqlFile(`
insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
  select a.id,'revoc@inv.local','viewer','it-rev' from public.agencies a where a.slug='inv-b';
update public.agency_invites set status='revoked', revoked_at=now() where idempotency_key='it-rev';`);
    const r = acceptAs("10000000-0000-4000-8000-000000000008", inviteId("it-rev"));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_pending");
    expect(memberRole("inv-b", "10000000-0000-4000-8000-000000000008")).toBe("");
  });

  test("doble aceptación del mismo usuario es idempotente", () => {
    const id = inviteId("it-new");
    const r = acceptAs("10000000-0000-4000-8000-000000000001", id);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("already_accepted");
    const count = psql(
      `select count(*) from public.agency_members where user_id='10000000-0000-4000-8000-000000000001';`,
    ).trim();
    expect(count).toBe("1");
  });

  test("user_metadata y app_metadata manipuladas NO otorgan agencia ni rol", () => {
    psqlFile(`
update auth.users set
  raw_user_meta_data = jsonb_build_object(
     'pending_agency_id',(select id from public.agencies where slug='inv-a'),'pending_role','owner'),
  raw_app_meta_data  = jsonb_build_object('role','owner')
 where id='10000000-0000-4000-8000-000000000005';
insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
  select a.id,'meta@inv.local','viewer','it-meta' from public.agencies a where a.slug='inv-b';`);
    // Antes de aceptar: la metadata sola no creó nada.
    expect(memberRole("inv-a", "10000000-0000-4000-8000-000000000005")).toBe("");
    const r = acceptAs("10000000-0000-4000-8000-000000000005", inviteId("it-meta"));
    expect(r.ok).toBe(true);
    // Se otorga lo que dice la FILA (inv-b/viewer), no lo que dice la metadata (inv-a/owner).
    expect(memberRole("inv-b", "10000000-0000-4000-8000-000000000005")).toBe("viewer");
    expect(memberRole("inv-a", "10000000-0000-4000-8000-000000000005")).toBe("");
  });

  test("dos invitaciones pendientes a agencias DISTINTAS conviven; duplicar en la misma se rechaza", () => {
    psqlFile(`insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
      select a.id,'dual@inv.local','viewer','it-dual-a' from public.agencies a where a.slug='inv-a';`);
    psqlFile(`insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
      select a.id,'dual@inv.local','viewer','it-dual-b' from public.agencies a where a.slug='inv-b';`);
    expect(
      psql(
        `select count(*) from public.agency_invites where email_normalized='dual@inv.local' and status='pending';`,
      ).trim(),
    ).toBe("2");

    let rejected = false;
    try {
      psqlFile(`insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
        select a.id,'dual@inv.local','admin','it-dual-dup' from public.agencies a where a.slug='inv-a';`);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  test("CONCURRENCIA real: dos conexiones, una sola membership y una sola transición", async () => {
    psqlFile(`insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
      select a.id,'conc@inv.local','admin','it-conc' from public.agencies a where a.slug='inv-b';`);
    const id = inviteId("it-conc");
    const uid = "10000000-0000-4000-8000-000000000006";

    const dir = mkdtempSync(join(tmpdir(), "invites-conc-"));
    const fa = join(dir, "a.sql");
    const fb = join(dir, "b.sql");
    // A toma el lock con FOR UPDATE y lo retiene 2s antes de commitear.
    writeFileSync(
      fa,
      `begin;\nselect set_config('request.jwt.claim.sub','${uid}',true);\n` +
        `select 'A='||public.accept_agency_invite('${id}'::uuid)::text;\nselect pg_sleep(2);\ncommit;\n`,
      "utf8",
    );
    writeFileSync(
      fb,
      `select set_config('request.jwt.claim.sub','${uid}',false);\n` +
        `select 'B='||public.accept_agency_invite('${id}'::uuid)::text;\n`,
      "utf8",
    );

    const runA = execFileAsync("psql", ["-X", "-At", PG_URL, "-f", fa]);
    await new Promise((r) => setTimeout(r, 600)); // B arranca con A ya bloqueando
    const runB = execFileAsync("psql", ["-X", "-At", PG_URL, "-f", fb]);
    const [outA, outB] = await Promise.all([runA, runB]);

    const jsonA = JSON.parse(outA.stdout.split("A=")[1].split("\n")[0]);
    const jsonB = JSON.parse(outB.stdout.split("B=")[1].split("\n")[0]);

    expect(jsonA.ok).toBe(true);
    expect(jsonA.reason).toBe("accepted");
    expect(jsonB.ok).toBe(true);
    expect(jsonB.reason).toBe("already_accepted"); // B esperó el lock y vio el estado final
    expect(jsonB.role).toBe("admin"); // rol real, consistente

    expect(psql(`select count(*) from public.agency_members where user_id='${uid}';`).trim()).toBe("1");
    expect(
      psql(
        `select count(*) from public.agency_invites where idempotency_key='it-conc' and status='accepted';`,
      ).trim(),
    ).toBe("1");
  });

  test("anon NO puede ejecutar la RPC; authenticated sin rol de manager no lee la tabla", () => {
    let denied = false;
    try {
      psql(`set role anon; select public.accept_agency_invite('${inviteId("it-new")}'::uuid);`);
    } catch {
      denied = true;
    }
    expect(denied).toBe(true);

    const visible = psql(
      `set role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',false); ` +
        `select count(*) from public.agency_invites;`,
    )
      .trim()
      .split("\n")
      .pop();
    expect(visible).toBe("0");
  });

  test("ningún rol de membership cambió durante toda la suite", () => {
    // El owner de inv-a fue invitado como viewer y debe seguir siendo owner.
    expect(memberRole("inv-a", "10000000-0000-4000-8000-000000000003")).toBe("owner");
  });
});
