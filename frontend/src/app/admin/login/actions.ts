"use server";

import { cookies, headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { log } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Server actions de login admin - Sprint 10 MF3 · actualizado por SPEC-S23.
 *
 * Un unico path de acceso:
 *   requestMagicLink: Supabase Auth signInWithOtp -> email magic link.
 *   Para super-admin Valterra (SUPER_ADMIN_EMAILS) y owner/admin/agent de agencies.
 *
 * S23 retiro loginAction (password -> cookie ADMIN_TOKEN) y con el la unica via
 * de acceso que no tenia identidad de usuario. logoutAction cierra la sesion
 * Supabase, que ahora es la unica que existe.
 */

/* ---------------------------------------------------------- */
/* Magic link: Supabase Auth signInWithOtp                    */
/* ---------------------------------------------------------- */
export async function requestMagicLink(
  formData: FormData,
): Promise<{ ok: true; sent: true } | { ok: false; error: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, error: "Supabase Auth no configurado en el servidor" };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nextPath = String(formData.get("next") ?? "/admin");
  const safeNext = nextPath.startsWith("/admin") && !nextPath.startsWith("/admin/login")
    ? nextPath
    : "/admin";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email invalido" };
  }

  const hdrs = await nextHeaders();
  const ip = getClientIp(hdrs);
  const rl = rateLimit(`magic-link:${ip}`, { limit: 3, windowMs: 10 * 60_000 });
  if (!rl.allowed) {
    log.warn("admin/login", "magic-link rate limit", { ip, retryAfterSec: rl.retryAfterSec });
    return { ok: false, error: `Demasiadas solicitudes. Reintenta en ${rl.retryAfterSec}s.` };
  }

  // Migración token_hash en DOS FASES (sin ventana de rotura):
  //  - FASE CÓDIGO (esta): emailRedirectTo sigue apuntando a /auth/callback → el
  //    magic link PKCE actual queda 100% funcional. /auth/confirm se agrega pero
  //    permanece dormido hasta la fase de configuración.
  //  - FASE CONFIG (posterior al deploy, sin deploy de código): se cambia SOLO el
  //    template "Magic link or OTP" a token_hash apuntando a {{ .SiteURL }}/auth/confirm
  //    (ver docs/auth/magic-link.token-hash.proposed.html). El template usa SiteURL
  //    (mismo sitio) → NO requiere nueva Redirect URL. Rollback = revertir el template.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://grupo-valterra.vercel.app";
  const origin = siteUrl.replace(/\/$/, "");
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

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
          // Server action sin acceso a Response - OK, el callback rota cookies
        }
      },
    },
  });

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });

  if (error) {
    // No revelar si el email existe - log internal, mensaje generico al user
    log.warn("admin/login", "signInWithOtp error", { ip, message: error.message });
    // shouldCreateUser:false hace que retorne error si el user no existe.
    // Para no revelar, devolvemos ok:true igual.
    return { ok: true, sent: true };
  }

  log.info("admin/login", "magic-link enviado", { ip, redirectTo });
  return { ok: true, sent: true };
}

/* ---------------------------------------------------------- */
/* Logout: cierra la sesion Supabase                          */
/* ---------------------------------------------------------- */
export async function logoutAction() {
  const cookieStore = await cookies();

  // Limpiar Supabase Auth session si esta activa
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    try {
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
              // ok
            }
          },
        },
      });
      await supabase.auth.signOut();
    } catch (err) {
      log.warn("admin/login", "supabase signOut failed", err instanceof Error ? { message: err.message } : { err: String(err) });
    }
  }

  log.info("admin/login", "logout");
  redirect("/admin/login");
}
