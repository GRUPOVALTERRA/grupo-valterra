import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware - Sprint 10 MF3 · actualizado por SPEC-S23.
 *
 * Responsabilidades:
 *  1. Propagar x-pathname (server components leen pathname actual)
 *  2. Refresh de Supabase Auth session (cookies se rotan automaticamente)
 *  3. Guard /admin/*: UNICO path de autorizacion = sesion Supabase Auth valida.
 *
 *  S23 retiro el break-glass por cookie: ninguna cookie propia autoriza el
 *  panel. La unica cookie que cuenta es la de sesion de Supabase, y vale
 *  porque getUser() la valida contra Supabase Auth, no por su mero valor.
 *
 *  /admin/login se excluye del guard (evita loop).
 *  /auth/callback y /auth/confirm procesan el magic link y no son /admin/*.
 */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Header de pathname para server components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Response default (con headers actualizados)
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // ============================================================
  // Supabase session refresh (rota cookies si esta cerca de expirar)
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
  // Guard /admin/* (excluyendo /admin/login)
  // ============================================================
  const isAdminPath = pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");

  if (isAdminPath) {
    const hasSupabaseAccess = Boolean(supabaseUserId);
    // Bypass solo en dev cuando Supabase no esta configurado. En production, bloquear siempre.
    const noAuthConfigured = process.env.NODE_ENV !== "production" && !url;

    if (!hasSupabaseAccess && !noAuthConfigured) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ============================================================
  // Sprint 13 · C1 — hardening de /auth/confirm.
  // El token_hash viaja en la URL: evitar caché y fuga por Referer,
  // y reforzar noindex (sobre-escribe el Referrer-Policy global).
  // ============================================================
  if (pathname === "/auth/confirm") {
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
