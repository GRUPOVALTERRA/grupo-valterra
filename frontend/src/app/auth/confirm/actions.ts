"use server";

import { cookies, headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { log } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sanitizeNext, isAllowedOtpType, DEFAULT_NEXT } from "@/lib/auth-confirm";

/**
 * Server action del flujo token_hash (Sprint 13 · C1).
 *
 * Se ejecuta SOLO ante el POST del usuario (click en "Ingresar" de /auth/confirm).
 * Un GET (escáner de email / prefetch) renderiza la página intermedia pero NO
 * llega acá → el token de un solo uso NO se consume por prefetch.
 *
 * A diferencia de PKCE (exchangeCodeForSession), verifyOtp({token_hash,type}) NO
 * requiere la cookie code_verifier → el link funciona en cualquier dispositivo.
 *
 * SEGURIDAD: nunca se loguea el token_hash. Sin enumeración de emails.
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://grupo-valterra.vercel.app";
  const origin = siteUrl.replace(/\/$/, "");
  const safeNext = sanitizeNext(nextRaw, origin);

  // Validaciones (sin exponer el token). Solo se atiende el login por email.
  if (!tokenHash || !isAllowedOtpType(typeRaw)) {
    log.warn("auth/confirm", "invalid params", { hasToken: Boolean(tokenHash), type: typeRaw });
    redirect("/admin/login?error=invalid-link");
  }
  // Tipo fijo 'email' (única variante soportada por esta ruta).
  const type: EmailOtpType = "email";

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
    log.warn("auth/confirm", "verifyOtp failed", { ip, message: error?.message ?? "no-session" });
    redirect("/admin/login?error=invalid-link");
  }

  // Éxito: sin userId ni token en logs.
  log.info("auth/confirm", "session established", { redirect: safeNext });
  redirect(safeNext);
}
