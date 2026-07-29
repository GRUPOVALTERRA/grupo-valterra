import { createHash } from "node:crypto";
import type { AgencyRole } from "@/services/agencies";

/**
 * Núcleo PURO de invitaciones de agencia — Sprint 13 · C2 fase 1 (dormido).
 *
 * Sin imports de Supabase, sin cliente admin, sin I/O: sólo tipos y funciones
 * deterministas. Vive separado de `services/agency-invites-repo.ts` —que lleva
 * `import "server-only"`— para poder testearse de forma aislada sin arrastrar
 * ese límite ni el `SERVICE_ROLE`.
 *
 * REGLA DEL PROYECTO (C2A): user_metadata es dato de presentación, NUNCA de
 * autorización. La agencia y el rol viven en public.agency_invites.
 */

export const INVITE_ROLES: readonly AgencyRole[] = ["owner", "admin", "agent", "viewer"] as const;

export type AgencyInviteStatus = "pending" | "accepted" | "expired" | "revoked" | "failed";

/** Rol efectivo del invitador, YA resuelto en el servidor. Nunca viene del formulario. */
export type InviterRole = AgencyRole | "super_admin";

export interface AgencyInviteRow {
  id: string;
  agency_id: string;
  email_normalized: string;
  role: AgencyRole;
  invited_by: string | null;
  invited_by_email: string | null;
  auth_user_id: string | null;
  status: AgencyInviteStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  last_error: string | null;
  idempotency_key: string;
}

export type InviteRepoError =
  | { kind: "not_configured" }
  | { kind: "invalid_input"; field: string; message: string }
  | { kind: "forbidden_role"; inviterRole: InviterRole; targetRole: AgencyRole }
  | { kind: "agency_not_found" }
  | { kind: "duplicate_pending" }
  | { kind: "idempotency_conflict" }
  | { kind: "not_found" }
  | { kind: "database_error"; message: string };

export type RepoResult<T> = { ok: true; data: T } | { ok: false; error: InviteRepoError };

export const ok = <T>(data: T): RepoResult<T> => ({ ok: true, data });
export const fail = <T>(error: InviteRepoError): RepoResult<T> => ({ ok: false, error });

/**
 * Normaliza un email al mismo formato que exige el CHECK de la migración 0007:
 * minúsculas, sin espacios extremos, longitud 3–320, forma básica válida.
 * Devuelve null si no es aceptable (nunca lanza).
 */
export function normalizeInviteEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 320) return null;
  if (/\s/.test(email)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Valida que el rol pedido esté en la allowlist. Nunca confía en el tipo declarado. */
export function isValidInviteRole(raw: unknown): raw is AgencyRole {
  return typeof raw === "string" && (INVITE_ROLES as readonly string[]).includes(raw);
}

/**
 * Matriz de autorización (diseño C2 §14). Se evalúa con el rol REAL del
 * invitador resuelto en el servidor — jamás con un rol enviado por el cliente.
 *
 *   super_admin → owner, admin, agent, viewer
 *   owner       → owner, admin, agent, viewer   (la UI confirma el caso 'owner')
 *   admin       → agent, viewer
 *   agent       → nada
 *   viewer      → nada
 */
export function canGrantRole(inviterRole: InviterRole, targetRole: AgencyRole): boolean {
  switch (inviterRole) {
    case "super_admin":
    case "owner":
      return isValidInviteRole(targetRole);
    case "admin":
      return targetRole === "agent" || targetRole === "viewer";
    case "agent":
    case "viewer":
    default:
      return false;
  }
}

/**
 * Clave de idempotencia por INTENTO DE EMISIÓN.
 *
 * Se deriva de un hash SHA-256 sobre una codificación INYECTIVA (con prefijo de
 * longitud por campo), no de una concatenación truncada.
 *
 * Motivo — hallazgo C2A5-B: la versión anterior concatenaba
 * `invite:<agencyId>:<email>:<nonce>` y aplicaba `.slice(0, 200)`. Con emails
 * largos (el CHECK admite hasta 320 caracteres) el truncado podía comerse el
 * nonce entero, de modo que dos intentos distintos producían la MISMA clave →
 * `idempotency_conflict` espurio y reenvío bloqueado.
 *
 * Propiedades garantizadas:
 *   · longitud fija de 71 caracteres, muy por debajo del límite de 200
 *   · mismo input → misma clave
 *   · nonce distinto → clave distinta, incluso con email de 320 caracteres
 *   · el prefijo de longitud hace imposible que `("a:b", "c")` y `("a", "b:c")`
 *     colisionen
 *   · sin PII visible: el email no aparece en claro
 *   · sin tokens ni secretos
 *
 * `v1` versiona el esquema de derivación para poder evolucionarlo sin ambigüedad.
 */
export function buildInviteIdempotencyKey(
  agencyId: string,
  emailNormalized: string,
  nonce: string,
): string {
  const part = (s: string) => `${s.length}:${s}`;
  const material = `v1|${part(agencyId)}|${part(emailNormalized)}|${part(nonce)}`;
  const digest = createHash("sha256").update(material, "utf8").digest("hex");
  return `invite:${digest}`; // 7 + 64 = 71 caracteres
}

/** Oculta el email en logs: conserva sólo la inicial y el dominio. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

/** Traduce errores de PostgREST/Postgres a errores tipados del repositorio. */
export function mapDbError(message: string, details?: string | null): InviteRepoError {
  const haystack = `${message} ${details ?? ""}`;
  if (haystack.includes("agency_invites_one_pending_idx")) return { kind: "duplicate_pending" };
  if (haystack.includes("agency_invites_idempotency_idx")) return { kind: "idempotency_conflict" };
  if (haystack.includes("agency_invites_agency_id_fkey")) return { kind: "agency_not_found" };
  return { kind: "database_error", message };
}
