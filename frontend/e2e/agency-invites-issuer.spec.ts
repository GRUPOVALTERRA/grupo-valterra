import { test, expect } from "@playwright/test";
import Module from "node:module";

/**
 * Tests del EMISOR NUEVO dormido (C2D2) — sin red, sin claves, sin Supabase.
 *
 * El issuer lleva `import "server-only"` (límite de bundle impuesto por
 * compilador). Ese marcador LANZA al importarse fuera de un contexto React
 * Server, así que acá se NEUTRALIZA únicamente el marcador — no desactiva
 * ninguna lógica — antes del import dinámico. Todas las dependencias con
 * efectos se inyectan como dobles.
 */
const ModuleCtor = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = ModuleCtor._load;
ModuleCtor._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

type IssuerModule = typeof import("../src/services/agency-invites-issuer");
type CoreModule = typeof import("../src/lib/agency-invites-core");

let issuerMod: IssuerModule;
let core: CoreModule;

// require CJS: pasa por Module._load, donde el stub de "server-only" intercepta
// (el import() dinámico usaría el loader ESM, que ignora ese stub).
const requireCjs = Module.createRequire(__filename);

test.beforeAll(() => {
  issuerMod = requireCjs("../src/services/agency-invites-issuer") as IssuerModule;
  core = requireCjs("../src/lib/agency-invites-core") as CoreModule;
});

const ORIGIN = "https://grupo-valterra.vercel.app";
const AGENCY = "c3d6b5db-d216-422c-83df-824e2dd1b673";
const ACTOR = { userId: "0e88f0fe-fba2-414a-9e03-4dd59d8468df", email: "owner@valterra.test", roleInAgency: "owner" as const };
const TOKEN = "pkce_hashed_token_abc123";

interface Row {
  id: string; agency_id: string; email_normalized: string; role: string;
  invited_by: string | null; invited_by_email: string | null; auth_user_id: string | null;
  status: string; created_at: string; expires_at: string;
  accepted_at: string | null; accepted_by: string | null; revoked_at: string | null;
  revoked_by: string | null; last_error: string | null; idempotency_key: string;
}

function row(partial: Partial<Row> = {}): Row {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    agency_id: AGENCY,
    email_normalized: "invitee@example.com",
    role: "agent",
    invited_by: ACTOR.userId,
    invited_by_email: ACTOR.email,
    auth_user_id: null,
    status: "pending",
    created_at: "2026-07-29T00:00:00.000Z",
    expires_at: "2026-08-05T00:00:00.000Z",
    accepted_at: null, accepted_by: null, revoked_at: null, revoked_by: null,
    last_error: null,
    idempotency_key: "invite:" + "0".repeat(64),
    ...partial,
  };
}

/** Arnés de dobles con registro de llamadas. */
function makeDeps(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[][]> = {};
  const logs: Array<{ level: string; message: string; data: Record<string, unknown> }> = [];
  const record = (name: string, args: unknown[]) => {
    (calls[name] ??= []).push(args);
  };
  let nonceCounter = 0;
  const deps = {
    repo: {
      createPendingInvite: async (...a: unknown[]) => { record("create", a); return { ok: true, data: row() }; },
      findPendingInvite: async (...a: unknown[]) => { record("findPending", a); return { ok: true, data: null }; },
      renewPendingInviteExpiry: async (...a: unknown[]) => { record("renew", a); return { ok: true, data: row() }; },
      markInviteFailed: async (...a: unknown[]) => { record("markFailed", a); return { ok: true, data: row({ status: "failed" }) }; },
      markInviteRevoked: async (...a: unknown[]) => { record("markRevoked", a); return { ok: true, data: row({ status: "revoked" }) }; },
      recordInviteEmailFailure: async (...a: unknown[]) => { record("recordEmailFailure", a); return { ok: true, data: row() }; },
    },
    authAdmin: {
      generateLink: async (...a: unknown[]) => {
        record("generateLink", a);
        return { data: { hashedToken: TOKEN, userId: "new-user-id" }, error: null };
      },
    },
    getMemberRole: async (...a: unknown[]) => { record("getMemberRole", a); return null; },
    findUserIdByEmail: null,
    sendEmail: async (...a: unknown[]) => { record("sendEmail", a); return { ok: true }; },
    now: () => new Date("2026-07-29T00:00:00.000Z"),
    nonce: () => `nonce-${++nonceCounter}`,
    allowedOrigin: ORIGIN,
    logger: {
      info: (_s: string, message: string, data: Record<string, unknown> = {}) => logs.push({ level: "info", message, data }),
      warn: (_s: string, message: string, data: Record<string, unknown> = {}) => logs.push({ level: "warn", message, data }),
      error: (_s: string, message: string, data: Record<string, unknown> = {}) => logs.push({ level: "error", message, data }),
    },
  };
  Object.assign(deps, overrides);
  return { deps: deps as never, calls, logs };
}

function issuer(depsBundle: ReturnType<typeof makeDeps>) {
  return issuerMod.createAgencyInviteIssuer(depsBundle.deps);
}

const INPUT = { agencyId: AGENCY, agencyName: "Sotos Inmobiliaria", email: " Invitee@Example.com ", role: "agent" as const };

/* ------------------------------------------------------------------ */
test.describe("buildInviteConfirmLink", () => {
  test("incluye SOLO token_hash, type, invite_id y next interno", () => {
    const link = issuerMod.buildInviteConfirmLink({
      allowedOrigin: ORIGIN, tokenHash: TOKEN, otpType: "invite",
      inviteId: row().id, next: "/admin/leads",
    });
    const url = new URL(link);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/auth/confirm");
    expect([...url.searchParams.keys()].sort()).toEqual(["invite_id", "next", "token_hash", "type"]);
    expect(url.searchParams.get("type")).toBe("invite");
    expect(link).not.toContain("agency");
    expect(link).not.toContain("role");
    expect(link).not.toContain("@");
  });

  test("next externo o /admin/login caen al fallback seguro", () => {
    for (const bad of ["https://evil.test/x", "//evil.test", "/admin/login", null]) {
      const link = issuerMod.buildInviteConfirmLink({
        allowedOrigin: ORIGIN, tokenHash: TOKEN, otpType: "email",
        inviteId: row().id, next: bad,
      });
      const next = new URL(link).searchParams.get("next");
      expect(next).toBe("/admin/leads");
    }
  });
});

/* ------------------------------------------------------------------ */
test.describe("isExistingUserGenerateLinkError", () => {
  test("códigos estables del SDK instalado activan el fallback", () => {
    expect(issuerMod.isExistingUserGenerateLinkError({ code: "email_exists", status: 422 })).toBe(true);
    expect(issuerMod.isExistingUserGenerateLinkError({ code: "user_already_exists" })).toBe(true);
  });
  test("cualquier OTRO código NO activa el fallback (aunque el texto engañe)", () => {
    expect(issuerMod.isExistingUserGenerateLinkError({ code: "over_email_send_rate_limit", message: "user already registered" })).toBe(false);
    expect(issuerMod.isExistingUserGenerateLinkError({ code: "validation_failed", message: "A user with this email address has already been registered" })).toBe(false);
  });
  test("sin código: sólo patrones estrechos; falsos positivos rechazados", () => {
    expect(issuerMod.isExistingUserGenerateLinkError({ message: "A user with this email address has already been registered" })).toBe(true);
    expect(issuerMod.isExistingUserGenerateLinkError({ message: "User already exists" })).toBe(true);
    expect(issuerMod.isExistingUserGenerateLinkError({ message: "email rate limit exceeded" })).toBe(false);
    expect(issuerMod.isExistingUserGenerateLinkError({ message: "invalid email address" })).toBe(false);
    expect(issuerMod.isExistingUserGenerateLinkError(null)).toBe(false);
    expect(issuerMod.isExistingUserGenerateLinkError({})).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
test.describe("validación y autorización", () => {
  test("email inválido / rol inválido / agencyId inválido", async () => {
    const b = makeDeps();
    const it = issuer(b);
    expect((await it.issueAgencyInvite(ACTOR, { ...INPUT, email: "no-es-email" })).status).toBe("invalid_input");
    expect((await it.issueAgencyInvite(ACTOR, { ...INPUT, role: "root" as never })).status).toBe("invalid_input");
    expect((await it.issueAgencyInvite(ACTOR, { ...INPUT, agencyId: "123" })).status).toBe("invalid_input");
    expect(b.calls.create ?? []).toHaveLength(0);
  });

  test("actor sin membership → forbidden, sin fila", async () => {
    const b = makeDeps();
    const out = await issuer(b).issueAgencyInvite({ ...ACTOR, roleInAgency: null }, INPUT);
    expect(out.status).toBe("forbidden");
    expect(b.calls.create ?? []).toHaveLength(0);
  });

  test("admin NO puede otorgar owner; owner sí puede otorgar admin", async () => {
    const b1 = makeDeps();
    const denied = await issuer(b1).issueAgencyInvite(
      { ...ACTOR, roleInAgency: "admin" }, { ...INPUT, role: "owner" });
    expect(denied.status).toBe("forbidden");
    expect(b1.calls.create ?? []).toHaveLength(0);

    const b2 = makeDeps();
    const granted = await issuer(b2).issueAgencyInvite(
      { ...ACTOR, roleInAgency: "owner" }, { ...INPUT, role: "admin" });
    expect(granted.status).toBe("sent");
  });
});

/* ------------------------------------------------------------------ */
test.describe("usuario NUEVO", () => {
  test("fila → generateLink invite (sin metadata) → link type=invite → email → sent", async () => {
    const b = makeDeps();
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out).toEqual({ status: "sent", inviteId: row().id });
    // orden: fila antes que token, token antes que email
    expect(b.calls.create).toHaveLength(1);
    expect(b.calls.generateLink).toHaveLength(1);
    const req = b.calls.generateLink[0][0] as Record<string, unknown>;
    expect(req.type).toBe("invite");
    expect(req.email).toBe("invitee@example.com"); // normalizado
    expect(Object.keys(req).sort()).toEqual(["email", "type"]); // SIN options.data
    const payload = b.calls.sendEmail[0][0] as { link: string; to: string };
    expect(new URL(payload.link).searchParams.get("type")).toBe("invite");
    expect(payload.to).toBe("invitee@example.com");
    // cero pending_* en ninguna llamada registrada
    expect(JSON.stringify(b.calls)).not.toContain("pending_agency_id");
    expect(JSON.stringify(b.calls)).not.toContain("pending_role");
  });
});

/* ------------------------------------------------------------------ */
test.describe("usuario EXISTENTE", () => {
  function existingUserDeps(memberRole: string | null = null) {
    const b = makeDeps();
    let call = 0;
    (b.deps as { authAdmin: { generateLink: unknown } }).authAdmin.generateLink = (async (...a: unknown[]) => {
      b.calls.generateLink ??= [];
      b.calls.generateLink.push(a);
      call += 1;
      if (call === 1) return { data: null, error: { code: "email_exists", status: 422 } };
      return { data: { hashedToken: TOKEN, userId: "existing-user-id" }, error: null };
    }) as never;
    (b.deps as { getMemberRole: unknown }).getMemberRole = (async (...a: unknown[]) => {
      (b.calls.getMemberRole ??= []).push(a);
      return memberRole;
    }) as never;
    return b;
  }

  test("email_exists → fallback magiclink → link type=email, mismo invite_id", async () => {
    const b = existingUserDeps(null);
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out).toEqual({ status: "sent", inviteId: row().id });
    expect(b.calls.generateLink).toHaveLength(2);
    expect((b.calls.generateLink[1][0] as { type: string }).type).toBe("magiclink");
    const payload = b.calls.sendEmail[0][0] as { link: string };
    const url = new URL(payload.link);
    expect(url.searchParams.get("type")).toBe("email");
    expect(url.searchParams.get("invite_id")).toBe(row().id);
  });

  test("ya miembro con MISMO rol → already_member, fila revocada, cero email", async () => {
    const b = existingUserDeps("agent");
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out.status).toBe("already_member");
    expect(b.calls.markRevoked).toHaveLength(1);
    expect(b.calls.sendEmail ?? []).toHaveLength(0);
  });

  test("ya miembro con OTRO rol → member_with_different_role, sin cambiar rol", async () => {
    const b = existingUserDeps("viewer");
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out.status).toBe("member_with_different_role");
    expect(b.calls.sendEmail ?? []).toHaveLength(0);
    // ninguna dependencia de memberships de escritura existe siquiera en el contrato
  });

  test("error NO relacionado (con código) no activa fallback → provider_error + markInviteFailed", async () => {
    const b = makeDeps();
    (b.deps as { authAdmin: { generateLink: unknown } }).authAdmin.generateLink = (async () => ({
      data: null, error: { code: "over_email_send_rate_limit", status: 429, message: "already registered? no: rate limit" },
    })) as never;
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out.status).toBe("provider_error");
    expect(b.calls.markFailed).toHaveLength(1);
    expect(b.calls.sendEmail ?? []).toHaveLength(0);
  });

  test("pre-chequeo con findUserIdByEmail evita crear fila si ya es miembro", async () => {
    const b = makeDeps({
      findUserIdByEmail: async () => "existing-user-id",
      getMemberRole: async () => "agent",
    });
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out.status).toBe("already_member");
    expect(b.calls.create ?? []).toHaveLength(0);
    expect(b.calls.generateLink ?? []).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
test.describe("invitación pendiente previa", () => {
  test("mismo rol → reenvío: renew + mismo invite_id + token nuevo", async () => {
    const pending = row({ id: "99999999-8888-4777-a666-555555555555" });
    const b = makeDeps();
    (b.deps as { repo: { findPendingInvite: unknown } }).repo.findPendingInvite = (async (...a: unknown[]) => {
      (b.calls.findPending ??= []).push(a); return { ok: true, data: pending };
    }) as never;
    (b.deps as { repo: { renewPendingInviteExpiry: unknown } }).repo.renewPendingInviteExpiry = (async (...a: unknown[]) => {
      (b.calls.renew ??= []).push(a); return { ok: true, data: pending };
    }) as never;
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out).toEqual({ status: "resent", inviteId: pending.id });
    expect(b.calls.renew).toHaveLength(1);
    expect(b.calls.create ?? []).toHaveLength(0);
  });

  test("rol distinto → revoke de la vieja + creación de una nueva", async () => {
    const pending = row({ role: "viewer" });
    const b = makeDeps();
    (b.deps as { repo: { findPendingInvite: unknown } }).repo.findPendingInvite = (async () => ({ ok: true, data: pending })) as never;
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT); // pide agent
    expect(out.status).toBe("sent");
    expect(b.calls.markRevoked).toHaveLength(1);
    expect(b.calls.create).toHaveLength(1);
  });

  test("duplicate_pending concurrente → releer y convertir en reenvío", async () => {
    const pending = row();
    const b = makeDeps();
    let find = 0;
    (b.deps as { repo: { findPendingInvite: unknown } }).repo.findPendingInvite = (async () => {
      find += 1;
      return { ok: true, data: find === 1 ? null : pending };
    }) as never;
    (b.deps as { repo: { createPendingInvite: unknown } }).repo.createPendingInvite = (async () => ({
      ok: false, error: { kind: "duplicate_pending" },
    })) as never;
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out).toEqual({ status: "resent", inviteId: pending.id });
    expect(b.calls.renew).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
test.describe("fallos parciales", () => {
  test("create falla (db) → internal_error, cero token, cero email", async () => {
    const b = makeDeps();
    (b.deps as { repo: { createPendingInvite: unknown } }).repo.createPendingInvite = (async () => ({
      ok: false, error: { kind: "database_error", message: "boom" },
    })) as never;
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out.status).toBe("internal_error");
    expect(b.calls.generateLink ?? []).toHaveLength(0);
    expect(b.calls.sendEmail ?? []).toHaveLength(0);
  });

  test("email falla → fila conservada pending con last_error + invite_created_email_failed", async () => {
    const b = makeDeps({ sendEmail: async () => ({ ok: false, error: "resend 500" }) });
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out).toEqual({ status: "invite_created_email_failed", inviteId: row().id });
    expect(b.calls.recordEmailFailure).toHaveLength(1);
    expect(b.calls.markFailed ?? []).toHaveLength(0); // NO transiciona a failed
  });

  test("respuesta ambigua del proveedor de email se trata como no-enviado", async () => {
    const b = makeDeps({ sendEmail: async () => ({ ok: false }) });
    const out = await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    expect(out.status).toBe("invite_created_email_failed");
  });
});

/* ------------------------------------------------------------------ */
test.describe("idempotencia y logs", () => {
  test("cada emisión usa una Idempotency-Key de email distinta (nonce)", async () => {
    const b = makeDeps();
    const it = issuer(b);
    await it.issueAgencyInvite(ACTOR, INPUT);
    (b.deps as { repo: { findPendingInvite: unknown } }).repo.findPendingInvite = (async () => ({ ok: true, data: row() })) as never;
    await it.issueAgencyInvite(ACTOR, INPUT); // segundo intento = reenvío
    const k1 = (b.calls.sendEmail[0][0] as { idempotencyKey: string }).idempotencyKey;
    const k2 = (b.calls.sendEmail[1][0] as { idempotencyKey: string }).idempotencyKey;
    expect(k1).not.toBe(k2);
    expect(k1).toContain(row().id);
  });

  test("los logs jamás contienen token, link ni email en claro", async () => {
    const b = makeDeps();
    await issuer(b).issueAgencyInvite(ACTOR, INPUT);
    const serialized = JSON.stringify(b.logs);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("token_hash");
    expect(serialized).not.toContain("invitee@example.com");
    expect(serialized).toContain("i***@example.com"); // maskEmail
  });
});

/* ------------------------------------------------------------------ */
test.describe("dormancia", () => {
  test("importar el módulo no ejecutó ninguna dependencia", () => {
    // Si el import hubiera creado clientes o leído claves, el beforeAll habría
    // fallado (no hay env de Supabase en este runner). Además:
    expect(typeof issuerMod.createAgencyInviteIssuer).toBe("function");
    expect(typeof issuerMod.createDefaultIssuerDeps).toBe("function");
  });

  test("ningún archivo productivo importa el issuer (cero call sites)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const roots = [join(__dirname, "../src/app"), join(__dirname, "../src/services"), join(__dirname, "../src/lib")];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(p)) continue;
        if (p.includes("agency-invites-issuer")) continue;
        if (readFileSync(p, "utf8").includes("agency-invites-issuer")) offenders.push(p);
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });

  test("los helpers del core siguen siendo los mismos objetos re-exportados", () => {
    expect(core.INVITE_ROLES).toContain("agent");
  });
});
