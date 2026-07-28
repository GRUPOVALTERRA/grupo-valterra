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
 * Tipo de OTP aceptado por esta ruta: EXCLUSIVAMENTE 'email' (login por email).
 *
 * Es el valor que la doc oficial de Supabase indica para magic link vía token_hash
 * (template `type=email` + `verifyOtp({ token_hash, type: 'email' })`).
 *
 * /auth/confirm NO es una ruta genérica: se excluyen a propósito
 * magiclink · recovery · signup · email_change · invite.
 * Las invitaciones permanecen en /auth/callback sin cambios.
 */
export const ALLOWED_OTP_TYPES = ["email"] as const;

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
