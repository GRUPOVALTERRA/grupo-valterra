"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { log } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { headers as nextHeaders } from "next/headers";

const COOKIE_NAME = "valterra-admin-session";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

/**
 * Server action de login admin.
 * Compara password contra ADMIN_PASSWORD env. Si matchea, setea cookie
 * HttpOnly+Secure con valor ADMIN_TOKEN (env), que el middleware compara.
 *
 * Rate limit: 5 intentos / 5 min por IP.
 */
export async function loginAction(formData: FormData): Promise<{ ok: false; error: string } | void> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminPassword || !adminToken) {
    log.warn("admin/login", "ADMIN_PASSWORD o ADMIN_TOKEN no configurados");
    return { ok: false, error: "Auth no configurado en el servidor" };
  }

  const password = String(formData.get("password") ?? "").trim();
  const nextPath = String(formData.get("next") ?? "/admin/leads");
  // Whitelist defensivo: nextPath debe empezar con /admin
  const safeNext = nextPath.startsWith("/admin") && !nextPath.startsWith("/admin/login")
    ? nextPath
    : "/admin/leads";

  // Rate limit por IP
  const hdrs = await nextHeaders();
  const ip = getClientIp(hdrs);
  const rl = rateLimit(`login:${ip}`, { limit: 5, windowMs: 5 * 60_000 });
  if (!rl.allowed) {
    log.warn("admin/login", "rate limit", { ip, retryAfterSec: rl.retryAfterSec });
    return { ok: false, error: `Demasiados intentos. Reintentá en ${rl.retryAfterSec}s.` };
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

  log.info("admin/login", "login OK", { ip });
  redirect(safeNext);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  log.info("admin/login", "logout");
  redirect("/admin/login");
}
