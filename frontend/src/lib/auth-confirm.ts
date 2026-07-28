/**
 * Helpers puros para el flujo de verificación token_hash (/auth/confirm).
 * Sprint 13 · C1 — fix magic link multi-dispositivo (reemplaza PKCE por token_hash).
 *
 * SIN imports de Next/Supabase → testeable de forma aislada.
 *
 * Contexto: el magic link PKCE queda atado al navegador que lo pidió
 * (necesita la cookie code_verifier). token_hash + verifyOtp() no la necesita,
 * por lo que el link funciona en cualquier navegador/dispositivo.
 */

/**
 * Tipos de OTP aceptados por esta ruta: EXCLUSIVAMENTE 'email' e 'invite'.
 *
 *  · 'email'  → login por magic link (Sprint 13 · C1, activo en producción).
 *  · 'invite' → aceptación de invitación de agencia (Sprint 13 · C2, DORMIDO:
 *               nadie emite todavía links con este tipo).
 *
 * /auth/confirm NO es una ruta genérica: se excluyen a propósito
 * magiclink · recovery · signup · email_change.
 *
 * Ambos valores están tipados como EmailOtpType en @supabase/auth-js 2.105.4
 * (verificado sobre la versión instalada, no sobre documentación).
 */
export const ALLOWED_OTP_TYPES = ["email", "invite"] as const;

export type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number];

/** Ruta segura por defecto tras el login. */
export const DEFAULT_NEXT = "/admin/leads";

/**
 * Valida que `type` sea uno de los EmailOtpType permitidos.
 * Rechaza vacío, null, 'sms', 'phone_change' o cualquier valor arbitrario.
 */
export function isAllowedOtpType(type: unknown): type is AllowedOtpType {
  return typeof type === "string" && (ALLOWED_OTP_TYPES as readonly string[]).includes(type);
}

/** UUID v4 canónico (el que produce gen_random_uuid() en Postgres). */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Valida el `invite_id` que viaja en el link de invitación (Sprint 13 · C2).
 *
 * Acepta ÚNICAMENTE un UUID v4 bien formado. Rechaza vacío, no-string, UUID de
 * otra versión, y cualquier intento de inyección (comillas, espacios, SQL,
 * caracteres de control): al no matchear la regex nunca llega a la base.
 *
 * SEGURIDAD — `invite_id` NO es una credencial. Por sí solo no otorga nada:
 * la RPC public.accept_agency_invite() exige además sesión válida (auth.uid())
 * y que el email autenticado coincida con el de la invitación. Por eso puede
 * viajar en claro y no necesita firma.
 */
export function isValidInviteId(inviteId: unknown): inviteId is string {
  return typeof inviteId === "string" && UUID_V4.test(inviteId);
}

/**
 * Sanitiza el parámetro `next` para evitar open-redirect.
 *
 * Acepta:
 *  - rutas relativas bajo /admin  (ej "/admin/properties")
 *  - URLs absolutas del MISMO origin bajo /admin (ej "https://site/admin/leads",
 *    porque Supabase puede pasar {{ .RedirectTo }} como URL completa)
 *
 * Rechaza (→ DEFAULT_NEXT):
 *  - vacío / no-string
 *  - /admin/login (evita loop)
 *  - otro origin (https://evil.com/admin, //evil.com)
 *  - rutas fuera de /admin
 *  - path traversal que resuelva fuera de /admin
 *
 * Devuelve SIEMPRE una ruta relativa segura (path[+query]) para redirigir dentro del sitio.
 *
 * @param next  valor crudo del query param
 * @param origin  origin canónico del sitio (ej "https://grupo-valterra.vercel.app")
 */
export function sanitizeNext(next: unknown, origin: string): string {
  if (typeof next !== "string" || next.length === 0) return DEFAULT_NEXT;

  let resolved: URL;
  try {
    // Resuelve tanto relativo como absoluto contra el origin canónico.
    resolved = new URL(next, origin);
  } catch {
    return DEFAULT_NEXT;
  }

  // Debe ser el mismo origin (bloquea //evil.com y https://evil.com/...).
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return DEFAULT_NEXT;
  }
  if (resolved.origin !== base.origin) return DEFAULT_NEXT;

  const path = resolved.pathname;
  // Solo bajo /admin, y nunca /admin/login (loop) ni fuera de /admin.
  const underAdmin = path === "/admin" || path.startsWith("/admin/");
  if (!underAdmin || path.startsWith("/admin/login")) return DEFAULT_NEXT;

  // Devolver ruta relativa (path + query), descartando el origin.
  return path + resolved.search;
}
