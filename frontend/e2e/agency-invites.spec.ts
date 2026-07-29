import { test, expect } from "@playwright/test";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
// Se importa el NÚCLEO PURO, no el repositorio: éste lleva `import "server-only"`
// y arrastraría el cliente admin. Los helpers son exactamente los mismos objetos
// (el repositorio los re-exporta desde acá), así que no hay riesgo de testear una copia.
import {
  normalizeInviteEmail,
  isValidInviteRole,
  canGrantRole,
  buildInviteIdempotencyKey,
  INVITE_ROLES,
} from "../src/lib/agency-invites-core";

/**
 * Sprint 13 · C2 — cobertura del flujo de invitaciones.
 *
 * DOS GRUPOS, con guardas de entorno distintas:
 *
 *  1. HELPERS PUROS del repositorio — corren SIEMPRE, sin infraestructura.
 *
 *  2. INTEGRACIÓN SQL contra PostgreSQL — ejercita de verdad la migración 0007
 *     y la RPC de 0008. Requiere:
 *        INVITES_TEST_DB          = cadena libpq a una base VACÍA y DESECHABLE
 *                                   (ej. postgres://postgres@/valterra_test?host=/tmp/pgsock&port=5433)
 *        INVITES_TEST_DESTRUCTIVE = YES   (confirmación explícita)
 *     y el binario `psql` en el PATH.
 *     Sin INVITES_TEST_DB el grupo se OMITE (skip) explicando qué falta; nunca se
 *     marca verde sin correr.
 *
 * ⚠️ La suite CREA Y DESTRUYE objetos. La guarda es una ALLOWLIST, no una lista
 *    negra: sólo se aceptan loopback o socket Unix local, con un nombre de base
 *    terminado en _test/_tmp/_scratch, y la base debe estar vacía de tablas de la
 *    aplicación. Cualquier host remoto —Supabase, Neon, Railway, RDS, un VPS—
 *    aborta. Ver inspectInviteTestDbUrl() y su batería de pruebas puras.
 *
 * Los comandos se ejecutan con execFile (sin shell) y ni la URL ni las
 * credenciales se imprimen jamás.
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
    expect(k1).toMatch(/^invite:[0-9a-f]{64}$/); // derivada por SHA-256, no concatenada
    expect(k1.length).toBeLessThanOrEqual(200); // CHECK de 0007
    expect(k1).not.toMatch(/token|secret|key=|eyJ/i);
  });

  test("la clave respeta el límite del CHECK con entradas largas", () => {
    const k = buildInviteIdempotencyKey("x".repeat(300), `${"y".repeat(200)}@test.local`, "z".repeat(100));
    expect(k.length).toBeLessThanOrEqual(200);
  });

  test("el nonce NUNCA desaparece, ni con el email máximo de 320 caracteres", () => {
    // Regresión del hallazgo C2A5-B: la versión anterior concatenaba y truncaba
    // a 200, de modo que un email largo se comía el nonce y dos emisiones
    // distintas colisionaban en la misma clave.
    const maxEmail = `${"a".repeat(310)}@x.co`; // 316 caracteres
    expect(maxEmail.length).toBeLessThanOrEqual(320);
    const agency = "b1b8b5e3-7d7f-47f0-b5d8-a135fb562fc9";
    const k1 = buildInviteIdempotencyKey(agency, maxEmail, "nonce-1");
    const k2 = buildInviteIdempotencyKey(agency, maxEmail, "nonce-2");
    expect(k1).not.toBe(k2);
    expect(k1.length).toBe(71);
    expect(k2.length).toBe(71);
  });

  test("distinta agencia o distinto email producen claves distintas", () => {
    const base = buildInviteIdempotencyKey("ag-1", "a@test.local", "n");
    expect(buildInviteIdempotencyKey("ag-2", "a@test.local", "n")).not.toBe(base);
    expect(buildInviteIdempotencyKey("ag-1", "b@test.local", "n")).not.toBe(base);
  });

  test("la codificación es inyectiva: no colisiona por reagrupar separadores", () => {
    // Con una concatenación ingenua "a:b"+"c" y "a"+"b:c" darían el mismo material.
    expect(buildInviteIdempotencyKey("a:b", "c@t.co", "n")).not.toBe(
      buildInviteIdempotencyKey("a", "b:c@t.co", "n"),
    );
    expect(buildInviteIdempotencyKey("a", "b@t.co", "c|d")).not.toBe(
      buildInviteIdempotencyKey("a", "b@t.co|c", "d"),
    );
  });

  test("la clave no expone PII: ni el email ni la agencia aparecen en claro", () => {
    const k = buildInviteIdempotencyKey("b1b8b5e3-7d7f-47f0", "gustavo@valterra.com.ar", "n1");
    expect(k).not.toContain("gustavo");
    expect(k).not.toContain("valterra");
    expect(k).not.toContain("b1b8b5e3");
    expect(k).toMatch(/^invite:[0-9a-f]{64}$/);
  });
});

test.describe("guarda de base desechable — inspectInviteTestDbUrl", () => {
  const ok = (u: string) => inspectInviteTestDbUrl(u);

  test("acepta loopback con base descartable", () => {
    expect(ok("postgres://postgres@localhost:5432/valterra_test").ok).toBe(true);
    expect(ok("postgres://u:p@127.0.0.1:5433/algo_tmp").ok).toBe(true);
    expect(ok("postgresql://postgres@[::1]:5432/x_scratch").ok).toBe(true);
  });

  test("acepta socket Unix local", () => {
    expect(ok("postgres://postgres@/valterra_test?host=/tmp/pgsock&port=5433").ok).toBe(true);
    expect(ok("postgres://postgres@/x_tmp?host=/var/run/postgresql").ok).toBe(true);
  });

  test("rechaza Supabase, Neon, Railway, RDS y cualquier host remoto", () => {
    for (const u of [
      "postgres://u:p@db.rbjfvhtpytspaekvefng.supabase.co:5432/postgres_test",
      "postgres://u:p@ep-cool-1234.eu-central-1.aws.neon.tech/neondb_test",
      "postgres://u:p@containers-us-west-1.railway.app:6543/railway_test",
      "postgres://u:p@mydb.abc123.us-east-1.rds.amazonaws.com:5432/app_test",
      "postgres://u:p@10.0.0.5:5432/app_test",
      "postgres://u:p@192.168.1.20:5432/app_test",
      "postgres://u:p@db.interno.valterra.ar:5432/app_test",
    ]) {
      const v = ok(u);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(/host no loopback/);
    }
  });

  test("rechaza un socket fuera de rutas locales permitidas", () => {
    const v = ok("postgres://postgres@/x_test?host=/mnt/remoto/pg");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/ruta local permitida/);
  });

  test("rechaza la forma sin host y sin socket", () => {
    const v = ok("postgres://postgres@/x_test");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/no declara host ni socket local/);
  });

  test("rechaza socket local combinado con host TCP remoto", () => {
    const v = ok("postgres://u:p@db.remoto.com:5432/x_test?host=/tmp/pgsock");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/host no loopback/);
  });

  test("rechaza traversal en la ruta del socket", () => {
    const v = ok("postgres://postgres@/x_test?host=/tmp/../etc/pg");
    expect(v.ok).toBe(false);
  });

  test("rechaza nombres de base productivos aunque el host sea local", () => {
    for (const db of ["postgres", "valterra", "produccion", "main", "app"]) {
      const v = ok(`postgres://postgres@localhost:5432/${db}`);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(/no termina en/);
    }
  });

  test("rechaza entradas vacías, no-URL y protocolos ajenos", () => {
    expect(ok("").ok).toBe(false);
    expect(ok("   ").ok).toBe(false);
    expect(ok("no-es-una-url").ok).toBe(false);
    expect(ok("mysql://root@localhost/x_test").ok).toBe(false);
    expect(ok("postgres://postgres@localhost:5432/").ok).toBe(false);
  });

  test("el motivo del rechazo nunca incluye credenciales", () => {
    const v = ok("postgres://usuario:SUPERSECRETO@db.remoto.com:5432/app_test");
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).not.toContain("SUPERSECRETO");
      expect(v.reason).not.toContain("usuario");
    }
  });

  test("la lista de tablas de aplicación cubre todo el esquema propio", () => {
    expect([...APP_TABLES].sort()).toEqual([
      "agencies",
      "agency_invites",
      "agency_members",
      "leads",
      "properties",
    ]);
  });
});

/* ================================================================== */
/* 2. INTEGRACIÓN SQL — migración 0007 + RPC 0008                     */
/* ================================================================== */

const PG_URL = process.env.INVITES_TEST_DB ?? "";
const HAS_PG = PG_URL.length > 0;
const DESTRUCTIVE_OK = process.env.INVITES_TEST_DESTRUCTIVE === "YES";
const execFileAsync = promisify(execFile);

/* ---------------- Guarda de base desechable (hallazgo C2A5-C) ---------------- */

export type DbGuardVerdict = { ok: true; database: string } | { ok: false; reason: string };

/** Hosts aceptados: sólo loopback demostrable. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0:0:0:0:0:0:0:1"]);
/** Sufijos obligatorios del nombre de base. */
const DISPOSABLE_SUFFIXES = ["_test", "_tmp", "_scratch"];
/** Rutas locales admitidas para sockets Unix. */
const LOCAL_SOCKET_PREFIXES = ["/tmp/", "/var/run/postgresql", "/run/postgresql", "/private/tmp/"];

/**
 * Valida —de forma PURA— que una cadena libpq apunte a una base local y desechable.
 *
 * No basta con rechazar Supabase: cualquier host remoto (Neon, Railway, RDS, un VPS)
 * podría contener datos reales. La política es allowlist, no denylist: se acepta
 * únicamente loopback o socket Unix local, y el nombre de la base debe declarar
 * explícitamente que es descartable.
 *
 * Nunca devuelve la URL ni credenciales en el motivo del rechazo.
 */
/** Marcador interno para la forma con socket Unix, que no declara host. */
const SOCKET_PLACEHOLDER = "unix.invalid";

/**
 * `new URL()` (WHATWG) RECHAZA la forma libpq de socket Unix
 * `postgres://usuario@/base?host=/tmp/sock`: hay userinfo pero la autoridad no
 * declara host. Se inserta un host marcador sólo para poder parsear, y se
 * recuerda que la autoridad venía sin host.
 */
function toParseableUrl(raw: string): { url: string; authorityHadNoHost: boolean } {
  const m = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/?#]*)(\/[\s\S]*)?$/);
  if (!m) return { url: raw, authorityHadNoHost: false };
  const [, scheme, authority, rest = ""] = m;
  const hostPart = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;
  if (hostPart === "") {
    return { url: `${scheme}${authority}${SOCKET_PLACEHOLDER}${rest}`, authorityHadNoHost: true };
  }
  return { url: raw, authorityHadNoHost: false };
}

export function inspectInviteTestDbUrl(raw: string): DbGuardVerdict {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "INVITES_TEST_DB vacía" };
  }
  const { url: parseable, authorityHadNoHost } = toParseableUrl(raw.trim());
  let u: URL;
  try {
    u = new URL(parseable);
  } catch {
    return { ok: false, reason: "INVITES_TEST_DB no es una URL válida" };
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) {
    return { ok: false, reason: `protocolo no soportado: ${u.protocol}` };
  }

  // Socket Unix: libpq lo expresa como ?host=/ruta, con la autoridad sin host.
  const socketHost = u.searchParams.get("host");
  if (socketHost) {
    if (!socketHost.startsWith("/") || socketHost.includes("..")) {
      return { ok: false, reason: "el socket no es una ruta local absoluta" };
    }
    if (!LOCAL_SOCKET_PREFIXES.some((p) => socketHost.startsWith(p))) {
      return { ok: false, reason: "el socket no está en una ruta local permitida" };
    }
    // Si además se declaró un host TCP, debe ser loopback.
    if (!authorityHadNoHost && !LOCAL_HOSTS.has(u.hostname)) {
      return { ok: false, reason: `socket local pero host no loopback: ${u.hostname}` };
    }
  } else if (authorityHadNoHost) {
    // Sin host en la autoridad y sin ?host=: no se puede demostrar que sea local.
    return { ok: false, reason: "la URL no declara host ni socket local" };
  } else if (!LOCAL_HOSTS.has(u.hostname)) {
    // Cualquier host que no sea loopback queda fuera, sin importar el proveedor.
    return { ok: false, reason: `host no loopback: ${u.hostname || "(vacío)"}` };
  }

  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!database) return { ok: false, reason: "la URL no indica base de datos" };
  if (!DISPOSABLE_SUFFIXES.some((s) => database.endsWith(s))) {
    return {
      ok: false,
      reason: `el nombre de base "${database}" no termina en ${DISPOSABLE_SUFFIXES.join(" / ")}`,
    };
  }
  return { ok: true, database };
}

/** Tablas de la aplicación: si alguna existe, la base NO está vacía. */
const APP_TABLES = ["leads", "properties", "agencies", "agency_members", "agency_invites"];

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

    // ---- Guarda de base desechable, ANTES de cualquier DDL ----
    // 1. Confirmación destructiva explícita.
    if (!DESTRUCTIVE_OK) {
      throw new Error(
        "Falta INVITES_TEST_DESTRUCTIVE=YES. Esta suite crea y destruye objetos: abortada.",
      );
    }
    // 2. La URL debe ser demostrablemente local y de una base descartable.
    const verdict = inspectInviteTestDbUrl(PG_URL);
    if (!verdict.ok) {
      throw new Error(`INVITES_TEST_DB rechazada: ${verdict.reason}. Abortada.`);
    }
    // 3. La base debe estar VACÍA de tablas de la aplicación. Si alguna existe,
    //    se aborta ruidosamente — nunca un return silencioso que siga usándola.
    const existing = psql(
      `select coalesce(string_agg(tablename, ','), '') from pg_tables ` +
        `where schemaname='public' and tablename in (${APP_TABLES.map((t) => `'${t}'`).join(",")});`,
    ).trim();
    if (existing !== "") {
      throw new Error(
        `La base "${verdict.database}" ya contiene tablas de la aplicación (${existing}). ` +
          "Se exige una base VACÍA y desechable: abortada.",
      );
    }

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

  test("membership eliminada tras aceptar → membership_missing, sin recrearla", () => {
    // Hallazgo C2A5-A: el invitado conserva el invite_id. Si un owner lo expulsa
    // y vuelve a invocar la RPC, devolver already_accepted sería un falso éxito
    // (ok=true con role=null) y reinsertar sería revertir la expulsión.
    psqlFile(`insert into public.agency_invites (agency_id,email_normalized,role,idempotency_key)
      select a.id,'expuls@inv.local','agent','it-kick' from public.agencies a where a.slug='inv-b';`);
    psqlFile(`insert into auth.users (id,email) values
      ('10000000-0000-4000-8000-00000000000f','expuls@inv.local') on conflict (id) do nothing;`);
    const id = inviteId("it-kick");
    const uid = "10000000-0000-4000-8000-00000000000f";

    // 1. acepta
    const first = acceptAs(uid, id);
    expect(first.ok).toBe(true);
    expect(first.reason).toBe("accepted");
    expect(memberRole("inv-b", uid)).toBe("agent");

    // 2. un owner elimina la membership
    psqlFile(`delete from public.agency_members where user_id='${uid}';`);
    expect(memberRole("inv-b", uid)).toBe("");

    // 3. el invitado reutiliza el invite_id
    const again = acceptAs(uid, id);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe("membership_missing");
    // 4. no se inventa rol ni agencia
    expect(again.role).toBeUndefined();
    expect(again.agency_id).toBeUndefined();
    // 5. la membership sigue ausente: la expulsión no se revierte
    expect(memberRole("inv-b", uid)).toBe("");
    // 6. la invitación permanece accepted, sin modificarse
    expect(
      psql(`select status from public.agency_invites where idempotency_key='it-kick';`).trim(),
    ).toBe("accepted");
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
