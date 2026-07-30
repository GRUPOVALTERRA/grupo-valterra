"use server";

import { cookies, headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { log } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sanitizeNext, classifyConfirmRequest, DEFAULT_NEXT } from "@/lib/auth-confirm";

/**
 * Server action del flujo token_hash (Sprint 13 · C1 y C2).
 *
 * Se ejecuta SOLO ante el POST del usuario (click en el botón de /auth/confirm).
 * Un GET (escáner de email / prefetch) renderiza la página intermedia pero NO
 * llega acá → el token de un solo uso NO se consume por prefetch.
 *
 * A diferencia de PKCE (exchangeCodeForSession), verifyOtp({token_hash,type}) NO
 * requiere la cookie code_verifier → el link funciona en cualquier dispositivo.
 *
 * DOS CAMINOS:
 *   · type=email  → login por magic link (C1, activo).
 *   · type=invite → aceptación de invitación (C2, DORMIDO: nadie emite todavía
 *     links con este tipo). Tras verificar la identidad, delega la autorización
 *     en la RPC public.accept_agency_invite(p_invite_id), que es la ÚNICA que
 *     puede crear la membership.
 *
 * SEGURIDAD:
 *   · nunca se loguea el token_hash, el userId, el email ni el invite_id completo
 *   · NO se envían agencia, rol ni email a la RPC: sólo p_invite_id
 *   · el rol y la agencia salen de la fila server-controlled, nunca del cliente
 *   · sin enumeración: todos los fallos devuelven un error genérico
 */
export async function confirmMagicLink(formData: FormData): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    log.error("auth/confirm", "supabase env not configured");
    redirect("/admin/login?error=server-config");
  }

  const tokenHash = String(formData.get("token_hash") ?? "");
  const typeRaw = String(formData.get("type") ?? "");
  const nextRaw = String(formData.get("next") ?? DEFAULT_NEXT);
  const inviteIdRaw = String(formData.get("invite_id") ?? "");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://grupo-valterra.vercel.app";
  const origin = siteUrl.replace(/\/$/, "");
  const safeNext = sanitizeNext(nextRaw, origin);

  // Clasificación ÚNICA del request (helper puro, testeable). Define si es
  // login común, flujo de invitación (type=email o invite + invite_id válido)
  // o inválido. Mismo criterio que la página. Ver @/lib/auth-confirm.
  const decision = classifyConfirmRequest({ tokenHash, type: typeRaw, inviteId: inviteIdRaw });
  if (decision.kind === "invalid") {
    log.warn("auth/confirm", "invalid params", { hasToken: Boolean(tokenHash), type: typeRaw });
    redirect("/admin/login?error=invalid-link");
  }

  const isAgencyInviteFlow = decision.kind === "invite";
  const inviteId = decision.kind === "invite" ? decision.inviteId : "";
  // Referencia corta para logs: nunca el invite_id completo.
  const inviteRef = isAgencyInviteFlow ? inviteId.slice(0, 8) : "";

  // verifyOtp CONSERVA su semántica: usa el tipo recibido ('invite' o 'email').
  const type: EmailOtpType = decision.otpType;

  // Rate limit por IP (defensa ante fuerza bruta de token_hash).
  const hdrs = await nextHeaders();
  const ip = getClientIp(hdrs);
  const rl = rateLimit(`confirm:${ip}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!rl.allowed) {
    log.warn("auth/confirm", "rate limit", { ip, retryAfterSec: rl.retryAfterSec });
    redirect("/admin/login?error=too-many");
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // En contexto sin Response escribible; el middleware rota cookies.
        }
      },
    },
  });

  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error || !data?.session) {
    // Sin enumeración: mensaje genérico. No se loguea el token.
    log.warn("auth/confirm", "verifyOtp failed", { ip, type, message: error?.message ?? "no-session" });
    redirect("/admin/login?error=invalid-link");
  }

  // ------------------------------------------------------------------
  // Camino INVITACIÓN (Sprint 13 · C2 — dormido).
  // La identidad ya está verificada; la AUTORIZACIÓN la resuelve la RPC.
  // Se envía ÚNICAMENTE p_invite_id: ni agencia, ni rol, ni email, ni userId.
  // ------------------------------------------------------------------
  if (isAgencyInviteFlow) {
    let accepted = false;
    let reason = "unknown";

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("accept_agency_invite", {
        p_invite_id: inviteId,
      });

      if (rpcError) {
        reason = "rpc_error";
        log.warn("auth/confirm", "rpc accept_agency_invite error", {
          ip,
          invite: inviteRef,
          message: rpcError.message,
        });
      } else {
        // Interpretación defensiva: el shape se valida, no se asume.
        const result = rpcData as { ok?: unknown; reason?: unknown } | null;
        accepted = Boolean(result && typeof result === "object" && result.ok === true);
        if (result && typeof result.reason === "string") reason = result.reason;
      }
    } catch (err) {
      reason = "exception";
      log.error(
        "auth/confirm",
        "rpc accept_agency_invite exception",
        err instanceof Error ? { message: err.message } : { err: String(err) },
      );
    }

    if (!accepted) {
      // La sesión quedó creada (el token ya se consumió) pero NO hay membership.
      // Fallar la autorización nunca debe fallar de forma insegura.
      log.warn("auth/confirm", "invitacion no aceptada", { ip, invite: inviteRef, reason });
      redirect("/admin/login?error=invite-failed");
    }

    log.info("auth/confirm", "invitacion aceptada", { redirect: safeNext, invite: inviteRef });
    redirect(safeNext);
  }

  // Éxito (login por email): sin userId ni token en logs.
  log.info("auth/confirm", "session established", { redirect: safeNext });
  redirect(safeNext);
}
