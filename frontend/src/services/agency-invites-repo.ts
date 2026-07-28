import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import type { AgencyRole } from "@/services/agencies";
import {
  ok,
  fail,
  maskEmail,
  mapDbError,
  normalizeInviteEmail,
  isValidInviteRole,
  canGrantRole,
  buildInviteIdempotencyKey,
  type AgencyInviteRow,
  type AgencyInviteStatus,
  type InviterRole,
  type RepoResult,
} from "@/lib/agency-invites-core";

/**
 * Repositorio de invitaciones de agencia — Sprint 13 · C2 fase 1 (DORMIDO).
 *
 * ⚠️ SERVER-ONLY, y ahora impuesto por el compilador: `import "server-only"`
 * hace que el build FALLE si este módulo entra en un bundle de cliente.
 * Usa getSupabaseAdmin() (SERVICE_ROLE, bypassa RLS) igual que el resto de
 * services/.
 *
 * Los helpers PUROS (normalización de email, allowlist de roles, matriz de
 * autorización y clave de idempotencia) viven en `@/lib/agency-invites-core`
 * y se re-exportan desde acá: así pueden testearse sin arrastrar el límite
 * server-only ni el cliente admin.
 *
 * Este módulo NO está conectado todavía a ningún flujo: `agency-invites.ts`
 * sigue usando la estrategia vieja. Se activa recién en la fase 3.
 *
 * RESPONSABILIDADES
 *   · normalizar y validar la entrada ANTES de tocar la base
 *   · resolver la autorización del invitador en el servidor
 *   · crear / consultar / revocar / marcar fallida una invitación
 *   · devolver errores TIPADOS y distinguibles
 *
 * FUERA DE ALCANCE — deliberadamente
 *   · NO crea memberships (eso es exclusivo de la RPC
 *     public.accept_agency_invite, migración 0008)
 *   · NO envía emails
 *   · NO genera links ni toca Supabase Auth
 *   · NO guarda token_hash, action_link ni ningún secreto
 *   · NO escribe user_metadata ni app_metadata
 *
 * REGLA DEL PROYECTO (C2A): user_metadata es dato de presentación,
 * NUNCA de autorización. La agencia y el rol viven en esta tabla.
 */

/* ---------------------------------------------------------- */
/* Tipos y helpers puros — viven en @/lib/agency-invites-core  */
/* y se re-exportan para no romper a los consumidores.         */
/* ---------------------------------------------------------- */

export {
  INVITE_ROLES,
  normalizeInviteEmail,
  isValidInviteRole,
  canGrantRole,
  buildInviteIdempotencyKey,
} from "@/lib/agency-invites-core";

export type {
  AgencyInviteStatus,
  InviterRole,
  AgencyInviteRow,
  InviteRepoError,
  RepoResult,
} from "@/lib/agency-invites-core";

const TABLE = "agency_invites";
const COLUMNS =
  "id, agency_id, email_normalized, role, invited_by, invited_by_email, auth_user_id, status, created_at, expires_at, accepted_at, accepted_by, revoked_at, revoked_by, last_error, idempotency_key";

/* ---------------------------------------------------------- */
/* Operaciones                                                */
/* ---------------------------------------------------------- */

export interface CreateInviteInput {
  agencyId: string;
  /** Email crudo: se normaliza acá. */
  email: string;
  role: AgencyRole;
  /** Rol REAL del invitador, resuelto en el servidor. */
  inviterRole: InviterRole;
  invitedBy?: string | null;
  invitedByEmail?: string | null;
  /** Nonce de la emisión (p. ej. un uuid del caller). */
  nonce: string;
  /** Vencimiento opcional; si se omite, la base aplica su default de 7 días. */
  expiresAt?: string;
}

/**
 * Crea una invitación en estado `pending`.
 *
 * Valida, EN ESTE ORDEN: configuración · email · rol · autorización del
 * invitador · existencia de la agencia. Recién entonces inserta.
 */
export async function createPendingAgencyInvite(
  input: CreateInviteInput,
): Promise<RepoResult<AgencyInviteRow>> {
  if (!isSupabaseConfigured()) return fail({ kind: "not_configured" });

  const email = normalizeInviteEmail(input.email);
  if (!email) {
    return fail({ kind: "invalid_input", field: "email", message: "Email invalido" });
  }
  if (!isValidInviteRole(input.role)) {
    return fail({ kind: "invalid_input", field: "role", message: "Rol invalido" });
  }
  if (!input.agencyId || typeof input.agencyId !== "string") {
    return fail({ kind: "invalid_input", field: "agencyId", message: "agencyId requerido" });
  }
  if (!input.nonce || typeof input.nonce !== "string") {
    return fail({ kind: "invalid_input", field: "nonce", message: "nonce requerido" });
  }
  // El rol NO es confiable sólo por venir del formulario: se contrasta contra
  // el rol real del invitador resuelto en el servidor.
  if (!canGrantRole(input.inviterRole, input.role)) {
    return fail({
      kind: "forbidden_role",
      inviterRole: input.inviterRole,
      targetRole: input.role,
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // La agencia debe existir ANTES de intentar el insert (mensaje claro en
    // lugar de un error de FK).
    const { data: agency, error: agencyErr } = await withTimeout(
      supabase.from("agencies").select("id").eq("id", input.agencyId).maybeSingle(),
      4000,
      "agency_invites.agencyLookup",
    );
    if (agencyErr) {
      log.error("agency_invites", "agency lookup error", { message: agencyErr.message });
      return fail({ kind: "database_error", message: agencyErr.message });
    }
    if (!agency) return fail({ kind: "agency_not_found" });

    const payload: Record<string, unknown> = {
      agency_id: input.agencyId,
      email_normalized: email,
      role: input.role,
      invited_by: input.invitedBy ?? null,
      invited_by_email: input.invitedByEmail ?? null,
      idempotency_key: buildInviteIdempotencyKey(input.agencyId, email, input.nonce),
    };
    if (input.expiresAt) payload.expires_at = input.expiresAt;

    const { data, error } = await withTimeout(
      supabase.from(TABLE).insert(payload).select(COLUMNS).single(),
      6000,
      "agency_invites.insert",
    );

    if (error) {
      const mapped = mapDbError(error.message, error.details);
      // Sin email completo ni datos sensibles en logs.
      log.warn("agency_invites", "insert rechazado", {
        agencyId: input.agencyId,
        email: maskEmail(email),
        role: input.role,
        kind: mapped.kind,
      });
      return fail(mapped);
    }

    log.info("agency_invites", "invitacion pending creada", {
      agencyId: input.agencyId,
      email: maskEmail(email),
      role: input.role,
    });
    return ok(data as unknown as AgencyInviteRow);
  } catch (err) {
    log.error(
      "agency_invites",
      "createPendingAgencyInvite exception",
      err instanceof Error ? { message: err.message } : { err: String(err) },
    );
    return fail({ kind: "database_error", message: err instanceof Error ? err.message : "unknown" });
  }
}

/** Invitación `pending` vigente para (agencia, email). Null si no hay. */
export async function findPendingInvite(
  agencyId: string,
  email: string,
): Promise<RepoResult<AgencyInviteRow | null>> {
  if (!isSupabaseConfigured()) return fail({ kind: "not_configured" });
  const normalized = normalizeInviteEmail(email);
  if (!normalized) {
    return fail({ kind: "invalid_input", field: "email", message: "Email invalido" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select(COLUMNS)
        .eq("agency_id", agencyId)
        .eq("email_normalized", normalized)
        .eq("status", "pending")
        .maybeSingle(),
      4000,
      "agency_invites.findPending",
    );
    if (error) return fail({ kind: "database_error", message: error.message });
    return ok((data as unknown as AgencyInviteRow | null) ?? null);
  } catch (err) {
    return fail({ kind: "database_error", message: err instanceof Error ? err.message : "unknown" });
  }
}

/** Todas las invitaciones `pending` de un email (para el fallback del panel). */
export async function findPendingInvitesForEmail(
  email: string,
): Promise<RepoResult<AgencyInviteRow[]>> {
  if (!isSupabaseConfigured()) return fail({ kind: "not_configured" });
  const normalized = normalizeInviteEmail(email);
  if (!normalized) {
    return fail({ kind: "invalid_input", field: "email", message: "Email invalido" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select(COLUMNS)
        .eq("email_normalized", normalized)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      4000,
      "agency_invites.findPendingForEmail",
    );
    if (error) return fail({ kind: "database_error", message: error.message });
    return ok((data as unknown as AgencyInviteRow[] | null) ?? []);
  } catch (err) {
    return fail({ kind: "database_error", message: err instanceof Error ? err.message : "unknown" });
  }
}

/** Listado administrativo por agencia (para managers). */
export async function listAgencyInvitesForManagers(
  agencyId: string,
  options?: { status?: AgencyInviteStatus; limit?: number },
): Promise<RepoResult<AgencyInviteRow[]>> {
  if (!isSupabaseConfigured()) return fail({ kind: "not_configured" });
  if (!agencyId) {
    return fail({ kind: "invalid_input", field: "agencyId", message: "agencyId requerido" });
  }

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from(TABLE)
      .select(COLUMNS)
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(options?.limit ?? 100);
    if (options?.status) query = query.eq("status", options.status);

    const { data, error } = await withTimeout(query, 5000, "agency_invites.listForManagers");
    if (error) return fail({ kind: "database_error", message: error.message });
    return ok((data as unknown as AgencyInviteRow[] | null) ?? []);
  } catch (err) {
    return fail({ kind: "database_error", message: err instanceof Error ? err.message : "unknown" });
  }
}

/**
 * Marca una invitación `pending` como `failed` (p. ej. si Resend rechazó el envío).
 * `reason` se trunca y NUNCA debe contener tokens ni secretos.
 */
export async function markInviteFailed(
  inviteId: string,
  reason: string,
): Promise<RepoResult<AgencyInviteRow>> {
  if (!isSupabaseConfigured()) return fail({ kind: "not_configured" });
  if (!inviteId) {
    return fail({ kind: "invalid_input", field: "inviteId", message: "inviteId requerido" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .update({ status: "failed", last_error: String(reason ?? "").slice(0, 500) })
        .eq("id", inviteId)
        .eq("status", "pending")
        .select(COLUMNS)
        .maybeSingle(),
      5000,
      "agency_invites.markFailed",
    );
    if (error) return fail({ kind: "database_error", message: error.message });
    if (!data) return fail({ kind: "not_found" });
    return ok(data as unknown as AgencyInviteRow);
  } catch (err) {
    return fail({ kind: "database_error", message: err instanceof Error ? err.message : "unknown" });
  }
}

/** Revoca una invitación `pending`. Sólo afecta filas pendientes. */
export async function markInviteRevoked(
  inviteId: string,
  revokedBy?: string | null,
): Promise<RepoResult<AgencyInviteRow>> {
  if (!isSupabaseConfigured()) return fail({ kind: "not_configured" });
  if (!inviteId) {
    return fail({ kind: "invalid_input", field: "inviteId", message: "inviteId requerido" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoked_by: revokedBy ?? null,
        })
        .eq("id", inviteId)
        .eq("status", "pending")
        .select(COLUMNS)
        .maybeSingle(),
      5000,
      "agency_invites.markRevoked",
    );
    if (error) return fail({ kind: "database_error", message: error.message });
    if (!data) return fail({ kind: "not_found" });
    log.info("agency_invites", "invitacion revocada", { inviteId });
    return ok(data as unknown as AgencyInviteRow);
  } catch (err) {
    return fail({ kind: "database_error", message: err instanceof Error ? err.message : "unknown" });
  }
}
