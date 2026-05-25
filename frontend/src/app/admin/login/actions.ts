"use server";

import { cookies, headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { log } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Server actions de login admin - Sprint 10 MF3.
 *
 * Dos paths coexistentes:
 *   1. loginAction (legacy): password contra ADMIN_PASSWORD env -> cookie ADMIN_TOKEN
 *      Sigue siendo el path del super-admin Valterra. NO se rompe.
 *   2. requestMagicLink (nuevo): Supabase Auth signInWithOtp -> email magic link
 *      Para owner/admin/agent de agencies (Sprint 10 MF4+).
 *
 * logoutAction limpia ambos paths.
 */

const COOKIE_NAME = "valterra-admin-session";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

/* ---------------------------------------------------------- */
/* Legacy: password + ADMIN_TOKEN cookie (super-admin path)   */
/* ---------------------------------------------------------- */
export async function loginAction(formData: FormData): Promise<{ ok: false; error: string } | void> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminPassword || !adminToken) {
    log.warn("admin/login", "ADMIN_PASSWORD o ADMIN_TOKEN no configurados");
    return { ok: false, error: "Auth no configurado en el servidor" };
  }

  const password = String(formData.get("password") ?? "").trim();
  const nextPath = String(formData.get("next") ?? "/admin/leads");
  const safeNext = nextPath.startsWith("/admin") && !nextPath.startsWith("/admin/login")
    ? nextPath
    : "/admin/leads";

  const hdrs = await nextHeaders();
  const ip = getClientIp(hdrs);
  const rl = rateLimit(`login:${ip}`, { limit: 5, windowMs: 5 * 60_000 });
  if (!rl.allowed) {
    log.warn("admin/login", "rate limit", { ip, retryAfterSec: rl.retryAfterSec });
    return { ok: false, error: `Demasiados intentos. Reintenta en ${rl.retryAfterSec}s.` };
  }

  if (!password || password !== adminPassword) {
    log.warn("admin/login", "intento fallido", { ip });
    return { ok: false, error: "Contraseña incorrecta" };
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: COOKIE_NAME,
    value: adminToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  log.info("admin/login", "login OK (legacy)", { ip });
  redirect(safeNext);
}

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
  const nextPath = String(formData.get("next") ?? "/admin/leads");
  const safeNext = nextPath.startsWith("/admin") && !nextPath.startsWith("/admin/login")
    ? nextPath
    : "/admin/leads";

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

  // Resolver origen del request para el emailRedirectTo
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const host = hdrs.get("host") ?? "grupo-valterra.vercel.app";
  const origin = `${proto}://${host}`;
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
/* Logout: limpia ambos paths                                 */
/* ---------------------------------------------------------- */
export async function logoutAction() {
  const cookieStore = await cookies();

  // Limpiar cookie ADMIN_TOKEN legacy
  cookieStore.delete(COOKIE_NAME);

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
