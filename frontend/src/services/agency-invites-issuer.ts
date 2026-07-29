import "server-only";

import { randomUUID } from "node:crypto";
import type { AgencyRole } from "@/services/agencies";
import { sanitizeNext, isValidInviteId } from "@/lib/auth-confirm";
import {
  canGrantRole,
  isValidInviteRole,
  maskEmail,
  normalizeInviteEmail,
  type AgencyInviteRow,
  type InviteRepoError,
  type InviterRole,
  type RepoResult,
} from "@/lib/agency-invites-core";

/**
 * EMISOR NUEVO de invitaciones — Sprint 13 · C2D2 (DORMIDO).
 *
 * Reemplazo del flujo viejo de `services/agency-invites.ts` según el diseño
 * aprobado S13_C2D1_NEW_INVITE_EMITTER_DESIGN.md. Este módulo NO tiene call
 * sites productivos: `admin/agencies/actions.ts` sigue usando el emisor viejo
 * hasta el cutover (C2D4).
 *
 * PRINCIPIOS
 *   · la FILA de public.agency_invites es la fuente de verdad y se crea antes
 *     que el token y que el email;
 *   · CERO user_metadata: no se escribe pending_agency_id, pending_role,
 *     invited_to_agency_name ni invited_by (el nombre de la agencia viaja en
 *     el template del email, no en Auth);
 *   · el link propio lleva SOLO token_hash + type + invite_id + next interno;
 *   · una invitación jamás crea ni modifica memberships (eso es exclusivo de
 *     la RPC accept_agency_invite) ni cambia roles existentes;
 *   · TODAS las dependencias con efectos (repo, Auth admin, email, reloj,
 *     nonce, logger) se INYECTAN: el módulo es testeable sin red ni claves y
 *     su import no ejecuta absolutamente nada.
 */

/* ---------------------------------------------------------- */
/* Contratos                                                  */
/* ---------------------------------------------------------- */

/** Contexto del actor YA AUTENTICADO, resuelto server-side por el caller
 *  (getAdminContext / memberships). El issuer re-valida autorización de rol,
 *  pero jamás deriva identidad de datos del cliente. */
export interface IssuerActor {
  userId: string;
  email: string | null;
  /** Rol REAL del actor en la agencia destino (o super_admin). null = sin membership. */
  roleInAgency: InviterRole | null;
}

export interface IssueInviteInput {
  agencyId: string;
  /** Nombre visible de la agencia, sólo para el template del email. */
  agencyName: string;
  email: string;
  role: AgencyRole;
  /** Ruta interna post-aceptación; se sanitiza SIEMPRE. */
  next?: string | null;
}

/** Resultado hacia el caller. `inviteId` se conserva para logs/tests y UI
 *  administrativa; NUNCA revela existencia de cuentas Auth ni detalles del
 *  proveedor. */
export type IssueInviteOutcome =
  | { status: "sent"; inviteId: string }
  | { status: "resent"; inviteId: string }
  | { status: "already_member" }
  | { status: "member_with_different_role" }
  | { status: "invite_created_email_failed"; inviteId: string }
  | { status: "forbidden" }
  | { status: "invalid_input"; field: string }
  | { status: "agency_not_found" }
  | { status: "provider_error" }
  | { status: "internal_error" };

export interface InviteEmailPayload {
  to: string;
  agencyName: string;
  link: string;
  expiresAt: string;
  invitedByEmail: string | null;
  /** Distinta en CADA emisión/reenvío (invite_id + nonce), nunca agency+email. */
  idempotencyKey: string;
}

export interface GenerateLinkRequest {
  type: "invite" | "magiclink";
  email: string;
}

export interface GenerateLinkSuccess {
  hashedToken: string | null;
  userId: string | null;
}

export interface GenerateLinkFailure {
  code?: string | null;
  status?: number | null;
  message?: string | null;
}

export interface IssuerLogger {
  info(scope: string, message: string, data?: Record<string, unknown>): void;
  warn(scope: string, message: string, data?: Record<string, unknown>): void;
  error(scope: string, message: string, data?: Record<string, unknown>): void;
}

export interface IssuerDeps {
  repo: {
    createPendingInvite(input: {
      agencyId: string;
      email: string;
      role: AgencyRole;
      inviterRole: InviterRole;
      invitedBy: string;
      invitedByEmail: string | null;
      nonce: string;
    }): Promise<RepoResult<AgencyInviteRow>>;
    findPendingInvite(agencyId: string, email: string): Promise<RepoResult<AgencyInviteRow | null>>;
    renewPendingInviteExpiry(inviteId: string): Promise<RepoResult<AgencyInviteRow>>;
    markInviteFailed(inviteId: string, reason: string): Promise<RepoResult<AgencyInviteRow>>;
    markInviteRevoked(inviteId: string, revokedBy?: string | null): Promise<RepoResult<AgencyInviteRow>>;
    recordInviteEmailFailure(inviteId: string, reason: string): Promise<RepoResult<AgencyInviteRow>>;
  };
  authAdmin: {
    generateLink(
      req: GenerateLinkRequest,
    ): Promise<{ data: GenerateLinkSuccess | null; error: GenerateLinkFailure | null }>;
  };
  /** Rol del usuario en la agencia (server-side). null = no es miembro. */
  getMemberRole(agencyId: string, userId: string): Promise<AgencyRole | null>;
  /** Lookup OPCIONAL email→userId (server-side). Si no está disponible, la
   *  detección de membership de usuarios existentes ocurre tras el fallback
   *  magiclink (ver §matriz C/D del diseño). Jamás lista usuarios global. */
  findUserIdByEmail?: ((email: string) => Promise<string | null>) | null;
  sendEmail(payload: InviteEmailPayload): Promise<{ ok: boolean; error?: string }>;
  now(): Date;
  nonce(): string;
  /** Origin permitido, fijado por configuración server-side. NUNCA del request. */
  allowedOrigin: string;
  logger: IssuerLogger;
}

/* ---------------------------------------------------------- */
/* Helpers puros (exportados para tests)                      */
/* ---------------------------------------------------------- */

/**
 * Clasifica el error de generateLink({type:'invite'}) como "el email ya tiene
 * usuario Auth" SIN enumerar usuarios.
 *
 * auth-js 2.105.4 (instalado) expone `AuthApiError.code: ErrorCode`, cuya unión
 * incluye los discriminantes ESTABLES 'email_exists' y 'user_already_exists'
 * (node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts). Se usan
 * primero. El fallback textual existe SOLO para respuestas sin `code`
 * (proxies/versiones de GoTrue viejas) y acepta únicamente patrones estrechos;
 * sus positivos y falsos positivos están cubiertos por tests.
 */
export function isExistingUserGenerateLinkError(error: GenerateLinkFailure | null): boolean {
  if (!error) return false;
  if (error.code === "email_exists" || error.code === "user_already_exists") return true;
  if (error.code) return false; // hay código y no es de existencia → NO activar fallback
  const message = (error.message ?? "").toLowerCase();
  if (!message) return false;
  return (
    /already\s+(been\s+)?registered/.test(message) ||
    /user\s+already\s+exists/.test(message) ||
    /email\s+address\s+already\s+registered/.test(message)
  );
}

const CONFIRM_PATH = "/auth/confirm";

/**
 * Link propio hacia /auth/confirm. Contiene EXCLUSIVAMENTE token_hash, type,
 * invite_id y next interno sanitizado. Prohibido (y ausente): role, agency_id,
 * email, user_id, action_link, secretos.
 */
export function buildInviteConfirmLink(args: {
  allowedOrigin: string;
  tokenHash: string;
  otpType: "invite" | "email";
  inviteId: string;
  next?: string | null;
}): string {
  const url = new URL(CONFIRM_PATH, args.allowedOrigin);
  const params = new URLSearchParams();
  params.set("token_hash", args.tokenHash);
  params.set("type", args.otpType);
  params.set("invite_id", args.inviteId);
  params.set("next", sanitizeNext(args.next ?? null, args.allowedOrigin));
  url.search = params.toString();
  return url.toString();
}

function emailIdempotencyKey(inviteId: string, nonce: string): string {
  return `invite-email:${inviteId}:${nonce}`;
}

/* ---------------------------------------------------------- */
/* Issuer                                                     */
/* ---------------------------------------------------------- */

const SCOPE = "invites_issuer";

export function createAgencyInviteIssuer(deps: IssuerDeps) {
  const { logger } = deps;

  async function generateTokenFor(
    email: string,
  ): Promise<
    | { ok: true; hashedToken: string; otpType: "invite" | "email"; userId: string | null; existing: boolean }
    | { ok: false }
  > {
    // Primer intento: usuario NUEVO (generateLink 'invite' crea el usuario,
    // SIN options.data — cero metadata).
    const first = await deps.authAdmin.generateLink({ type: "invite", email });
    if (!first.error && first.data?.hashedToken) {
      return { ok: true, hashedToken: first.data.hashedToken, otpType: "invite", userId: first.data.userId, existing: false };
    }
    if (first.error && isExistingUserGenerateLinkError(first.error)) {
      // Usuario EXISTENTE → magiclink; el token se consume con type=email.
      const second = await deps.authAdmin.generateLink({ type: "magiclink", email });
      if (!second.error && second.data?.hashedToken) {
        return { ok: true, hashedToken: second.data.hashedToken, otpType: "email", userId: second.data.userId, existing: true };
      }
      logger.warn(SCOPE, "generateLink magiclink fallo", {
        code: second.error?.code ?? null,
        status: second.error?.status ?? null,
      });
      return { ok: false };
    }
    logger.warn(SCOPE, "generateLink invite fallo", {
      code: first.error?.code ?? null,
      status: first.error?.status ?? null,
    });
    return { ok: false };
  }

  async function membershipOutcome(
    agencyId: string,
    userId: string,
    targetRole: AgencyRole,
  ): Promise<"already_member" | "member_with_different_role" | null> {
    const memberRole = await deps.getMemberRole(agencyId, userId);
    if (memberRole === null) return null;
    return memberRole === targetRole ? "already_member" : "member_with_different_role";
  }

  async function deliver(
    invite: AgencyInviteRow,
    input: IssueInviteInput,
    actor: IssuerActor,
    resent: boolean,
  ): Promise<IssueInviteOutcome> {
    const token = await generateTokenFor(invite.email_normalized);
    if (!token.ok) {
      await deps.repo.markInviteFailed(invite.id, "generateLink failed");
      return { status: "provider_error" };
    }

    // Usuario EXISTENTE detectado recién acá (sin lookup previo disponible):
    // si ya es miembro, no se envía nada y la fila se cierra como revocada.
    if (token.existing && token.userId) {
      const member = await membershipOutcome(invite.agency_id, token.userId, invite.role);
      if (member) {
        await deps.repo.markInviteRevoked(invite.id, actor.userId);
        logger.info(SCOPE, "invite_rejected_already_member", {
          invite_id: invite.id,
          agency_id: invite.agency_id,
          actor_user_id: actor.userId,
          reason: member,
        });
        return { status: member };
      }
    }

    const link = buildInviteConfirmLink({
      allowedOrigin: deps.allowedOrigin,
      tokenHash: token.hashedToken,
      otpType: token.otpType,
      inviteId: invite.id,
      next: input.next ?? null,
    });
    logger.info(SCOPE, "invite_link_generated", {
      invite_id: invite.id,
      agency_id: invite.agency_id,
      otp_type: token.otpType,
    });

    const emailResult = await deps.sendEmail({
      to: invite.email_normalized,
      agencyName: input.agencyName,
      link,
      expiresAt: invite.expires_at,
      invitedByEmail: actor.email,
      idempotencyKey: emailIdempotencyKey(invite.id, deps.nonce()),
    });

    if (!emailResult.ok) {
      await deps.repo.recordInviteEmailFailure(invite.id, emailResult.error ?? "email send failed");
      logger.warn(SCOPE, "invite_email_failed", {
        invite_id: invite.id,
        agency_id: invite.agency_id,
        reason: emailResult.error ?? "unknown",
      });
      return { status: "invite_created_email_failed", inviteId: invite.id };
    }

    logger.info(SCOPE, resent ? "invite_resent" : "invite_email_sent", {
      invite_id: invite.id,
      agency_id: invite.agency_id,
      actor_user_id: actor.userId,
      role: invite.role,
      email: maskEmail(invite.email_normalized),
    });
    return resent ? { status: "resent", inviteId: invite.id } : { status: "sent", inviteId: invite.id };
  }

  async function resendExisting(
    pending: AgencyInviteRow,
    input: IssueInviteInput,
    actor: IssuerActor,
  ): Promise<IssueInviteOutcome> {
    const renewed = await deps.repo.renewPendingInviteExpiry(pending.id);
    if (!renewed.ok) {
      return renewed.error.kind === "not_found"
        ? { status: "internal_error" }
        : mapRepoError(renewed.error);
    }
    return deliver(renewed.data, input, actor, true);
  }

  function mapRepoError(error: InviteRepoError): IssueInviteOutcome {
    switch (error.kind) {
      case "invalid_input":
        return { status: "invalid_input", field: error.field };
      case "forbidden_role":
        return { status: "forbidden" };
      case "agency_not_found":
        return { status: "agency_not_found" };
      case "not_configured":
      case "database_error":
      case "idempotency_conflict":
      case "not_found":
      default:
        return { status: "internal_error" };
    }
  }

  async function issueAgencyInvite(
    actor: IssuerActor,
    input: IssueInviteInput,
  ): Promise<IssueInviteOutcome> {
    // 1. Validación de entrada — antes de tocar cualquier dependencia.
    if (!actor?.userId) return { status: "forbidden" };
    if (!isValidInviteId(input.agencyId)) return { status: "invalid_input", field: "agencyId" };
    const email = normalizeInviteEmail(input.email);
    if (!email) return { status: "invalid_input", field: "email" };
    if (!isValidInviteRole(input.role)) return { status: "invalid_input", field: "role" };

    // 2. Autorización server-side: rol real del actor + matriz canGrantRole.
    if (!actor.roleInAgency || !canGrantRole(actor.roleInAgency, input.role)) {
      logger.warn(SCOPE, "invite_forbidden", {
        agency_id: input.agencyId,
        actor_user_id: actor.userId,
        role: input.role,
      });
      return { status: "forbidden" };
    }

    try {
      // 3. Membership existente (pre-chequeo cuando hay lookup disponible).
      if (deps.findUserIdByEmail) {
        const existingUserId = await deps.findUserIdByEmail(email);
        if (existingUserId) {
          const member = await membershipOutcome(input.agencyId, existingUserId, input.role);
          if (member) {
            logger.info(SCOPE, "invite_rejected_already_member", {
              agency_id: input.agencyId,
              actor_user_id: actor.userId,
              reason: member,
            });
            return { status: member };
          }
        }
      }

      // 4. Invitación pendiente previa.
      const previous = await deps.repo.findPendingInvite(input.agencyId, email);
      if (!previous.ok) return mapRepoError(previous.error);
      if (previous.data) {
        if (previous.data.role === input.role) {
          // Mismo rol → reenvío: mismo invite_id, expiración renovada, token nuevo.
          return resendExisting(previous.data, input, actor);
        }
        // Rol distinto → revocar la anterior y crear una nueva.
        const revoked = await deps.repo.markInviteRevoked(previous.data.id, actor.userId);
        if (!revoked.ok && revoked.error.kind !== "not_found") return mapRepoError(revoked.error);
        logger.info(SCOPE, "invite_revoked", {
          invite_id: previous.data.id,
          agency_id: input.agencyId,
          actor_user_id: actor.userId,
          reason: "role_changed",
        });
      }

      // 5. FILA primero (fuente de verdad), server-controlled.
      const created = await deps.repo.createPendingInvite({
        agencyId: input.agencyId,
        email,
        role: input.role,
        inviterRole: actor.roleInAgency,
        invitedBy: actor.userId,
        invitedByEmail: actor.email,
        nonce: deps.nonce(),
      });

      if (!created.ok) {
        if (created.error.kind === "duplicate_pending") {
          // Carrera: otro proceso creó la pending. Releer y convertir en reenvío.
          const raced = await deps.repo.findPendingInvite(input.agencyId, email);
          if (raced.ok && raced.data && raced.data.role === input.role) {
            return resendExisting(raced.data, input, actor);
          }
          return { status: "internal_error" };
        }
        return mapRepoError(created.error);
      }

      logger.info(SCOPE, "invite_created", {
        invite_id: created.data.id,
        agency_id: input.agencyId,
        actor_user_id: actor.userId,
        role: input.role,
        email: maskEmail(email),
      });

      // 6. Token → link → email (el email SIEMPRE al final).
      return deliver(created.data, input, actor, false);
    } catch (err) {
      logger.error(SCOPE, "issuer exception", {
        message: err instanceof Error ? err.message : "unknown",
      });
      return { status: "internal_error" };
    }
  }

  return { issueAgencyInvite };
}

/* ---------------------------------------------------------- */
/* Defaults de producción (NO se ejecutan al importar)        */
/* ---------------------------------------------------------- */

/**
 * Fabrica las dependencias reales. Se invoca RECIÉN desde un call site
 * server-side autorizado (C2D4); importar este módulo no crea clientes, no
 * lee claves y no ejecuta nada. El proveedor de email real (Resend) se
 * conectará en el cutover mediante `sendEmail`; acá sólo se define el
 * contrato para mantener el módulo libre de credenciales.
 */
export async function createDefaultIssuerDeps(args: {
  allowedOrigin: string;
  sendEmail: IssuerDeps["sendEmail"];
}): Promise<IssuerDeps> {
  const repo = await import("@/services/agency-invites-repo");
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const { getAgencyMember } = await import("@/services/agencies");
  const { log } = await import("@/lib/logger");

  return {
    repo: {
      createPendingInvite: (input) =>
        repo.createPendingAgencyInvite({
          agencyId: input.agencyId,
          email: input.email,
          role: input.role,
          inviterRole: input.inviterRole,
          invitedBy: input.invitedBy,
          invitedByEmail: input.invitedByEmail,
          nonce: input.nonce,
        }),
      findPendingInvite: repo.findPendingInvite,
      renewPendingInviteExpiry: (inviteId) => repo.renewPendingInviteExpiry(inviteId),
      markInviteFailed: repo.markInviteFailed,
      markInviteRevoked: repo.markInviteRevoked,
      recordInviteEmailFailure: repo.recordInviteEmailFailure,
    },
    authAdmin: {
      async generateLink(req) {
        const admin = getSupabaseAdmin();
        const { data, error } = await admin.auth.admin.generateLink({
          type: req.type,
          email: req.email,
        });
        if (error) {
          const apiError = error as { code?: string; status?: number; message?: string };
          return {
            data: null,
            error: {
              code: apiError.code ?? null,
              status: apiError.status ?? null,
              message: apiError.message ?? null,
            },
          };
        }
        return {
          data: {
            hashedToken: data.properties?.hashed_token ?? null,
            userId: data.user?.id ?? null,
          },
          error: null,
        };
      },
    },
    getMemberRole: async (agencyId, userId) => {
      const member = await getAgencyMember(agencyId, userId);
      return member?.role ?? null;
    },
    findUserIdByEmail: null,
    sendEmail: args.sendEmail,
    now: () => new Date(),
    nonce: () => randomUUID(),
    allowedOrigin: args.allowedOrigin,
    logger: log,
  };
}
