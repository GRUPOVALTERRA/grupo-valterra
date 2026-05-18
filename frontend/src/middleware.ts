import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware Edge.
 * - Propaga x-pathname header para uso futuro en server components
 * - Protege /admin/* validando cookie `valterra-admin-session` vs ADMIN_TOKEN env
 * - Excluye /admin/login del check para evitar loop
 *
 * Auth strategy MVP: cookie estática comparada con env. Stateless, sin DB.
 * Cuando entre NextAuth + Supabase Auth, reemplazar este check por session().
 */

const COOKIE_NAME = "valterra-admin-session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Propagación de pathname para layouts/server components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Protección admin (excluye /admin/login)
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const adminToken = process.env.ADMIN_TOKEN;
    const cookie = request.cookies.get(COOKIE_NAME)?.value;

    // Si no hay ADMIN_TOKEN configurado, dev mode permisivo + warning visible
    // (mejor que romper /admin/leads en repos clonados sin .env.local).
    // En producción Vercel siempre tendrá ADMIN_TOKEN seteado.
    if (adminToken && cookie !== adminToken) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
