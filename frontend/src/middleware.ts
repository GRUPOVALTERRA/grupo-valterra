import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware - Sprint 10 MF3.
 *
 * Responsabilidades:
 *  1. Propagar x-pathname (server components leen pathname actual)
 *  2. Refresh de Supabase Auth session (cookies se rotan automaticamente)
 *  3. Guard /admin/* aceptando dos paths:
 *     - cookie ADMIN_TOKEN legacy (super-admin)
 *     - Supabase Auth session valida (cualquier user logueado)
 *
 *  /admin/login se excluye del guard (evita loop).
 *  /auth/callback se excluye (procesa magic link).
 */

const ADMIN_COOKIE = "valterra-admin-session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Header de pathname para server components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Response default (con headers actualizados)
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // ============================================================
  // Supabase session refresh (rota cookies si esta cerca de expirar)
  // Si las env vars no estan, skip silencioso - el ADMIN_TOKEN path
  // sigue funcionando como antes.
  // ============================================================
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let supabaseUserId: string | null = null;

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    });

    // getUser() valida el token con Supabase Auth y refresca cookies si hace falta
    const { data } = await supabase.auth.getUser();
    supabaseUserId = data.user?.id ?? null;
  }

  // ============================================================
  // Guard /admin/* (excluyendo /admin/login y /auth/callback)
  // ============================================================
  const isAdminPath = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");

  if (isAdminPath) {
    const adminToken = process.env.ADMIN_TOKEN;
    const tokenCookie = request.cookies.get(ADMIN_COOKIE)?.value;

    const hasLegacyAccess = Boolean(adminToken && tokenCookie === adminToken);
    const hasSupabaseAccess = Boolean(supabaseUserId);
    const noAuthConfigured = !adminToken && !url; // dev mode permisivo

    if (!hasLegacyAccess && !hasSupabaseAccess && !noAuthConfigured) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
