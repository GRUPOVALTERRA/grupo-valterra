import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { log } from "@/lib/logger";
import { sanitizeNext } from "@/lib/auth-confirm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /auth/callback?code=xxx&next=/admin/leads
 *
 * ÚNICA responsabilidad: intercambiar el `code` PKCE por una sesión y redirigir
 * a una ruta interna segura.
 *
 * Sprint 13 · C2D6 — RETIRADA DEL FLUJO LEGADO. Esta ruta ya NO:
 *   · lee user_metadata (pending_agency_id / pending_role);
 *   · crea ni modifica public.agency_members;
 *   · escribe metadata como parte de una autorización;
 *   · usa el SERVICE_ROLE.
 *
 * La ÚNICA vía para otorgar una membership por invitación es ahora:
 *   public.agency_invites → /auth/confirm → verifyOtp →
 *   public.accept_agency_invite(p_invite_id)
 * donde la agencia y el rol salen de una fila server-controlled y jamás de
 * datos que el usuario pueda escribir con la clave ANON.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Mismo saneamiento anti open-redirect que /auth/confirm (helper compartido).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? origin;
  const canonicalOrigin = siteUrl.replace(/\/$/, "");
  const safeNext = sanitizeNext(searchParams.get("next"), canonicalOrigin);

  if (!code) return NextResponse.redirect(`${origin}/admin/login?error=missing-code`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    log.error("auth/callback", "supabase env not configured");
    return NextResponse.redirect(`${origin}/admin/login?error=server-config`);
  }

  const response = NextResponse.redirect(`${origin}${safeNext}`);
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set({ name, value, ...options });
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Fallo de intercambio: NO se concede acceso ni se crea sesión.
    log.warn("auth/callback", "exchange failed", { message: error.message });
    return NextResponse.redirect(`${origin}/admin/login?error=invalid-link`);
  }

  // Sin userId ni datos personales en logs.
  log.info("auth/callback", "session established", { redirect: safeNext });
  return response;
}
