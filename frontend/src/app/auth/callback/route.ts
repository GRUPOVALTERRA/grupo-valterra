import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { log } from "@/lib/logger";
import { addAgencyMembership, type AgencyRole } from "@/services/agencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /auth/callback?code=xxx&next=/admin/leads
 *
 * 1. Exchange code → Supabase session (set cookies)
 * 2. Sprint 10 MF6: si user_metadata.pending_agency_id presente
 *    → INSERT agency_members (SERVICE_ROLE) + clear metadata
 * 3. Redirect a safeNext
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/admin/leads";
  const safeNext = nextRaw.startsWith("/admin") && !nextRaw.startsWith("/admin/login")
    ? nextRaw
    : "/admin/leads";

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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    log.warn("auth/callback", "exchange failed", { message: error.message });
    return NextResponse.redirect(`${origin}/admin/login?error=invalid-link`);
  }

  // ============================================================
  // Sprint 10 MF6: process pending invite metadata (si aplica)
  // ============================================================
  const user = data.user;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const pendingAgencyId = typeof meta.pending_agency_id === "string" ? meta.pending_agency_id : null;
  const pendingRoleRaw = typeof meta.pending_role === "string" ? meta.pending_role : null;
  const validRoles: AgencyRole[] = ["owner", "admin", "agent", "viewer"];
  const pendingRole = pendingRoleRaw && validRoles.includes(pendingRoleRaw as AgencyRole)
    ? (pendingRoleRaw as AgencyRole) : null;

  if (user && pendingAgencyId && pendingRole) {
    log.info("auth/callback", "pending invite detected", { userId: user.id, agencyId: pendingAgencyId, role: pendingRole });

    const memRes = await addAgencyMembership({
      agencyId: pendingAgencyId,
      userId: user.id,
      role: pendingRole,
      fromInvite: true,
    });

    if (memRes.ok) {
      // Clear pending metadata via admin API (NO bloquea redirect si falla)
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        try {
          const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          await admin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...meta,
              pending_agency_id: null,
              pending_role: null,
              joined_agency_id: pendingAgencyId,
              joined_at: new Date().toISOString(),
            },
          });
        } catch (err) {
          log.warn("auth/callback", "clear metadata failed (non-blocking)", err instanceof Error ? { message: err.message } : { err: String(err) });
        }
      }
      log.info("auth/callback", "membership created from invite", { userId: user.id, agencyId: pendingAgencyId });
    } else {
      log.error("auth/callback", "membership insert failed", { userId: user.id, agencyId: pendingAgencyId, error: memRes.error });
    }
  }

  log.info("auth/callback", "session established", { redirect: safeNext, userId: user?.id });
  return response;
}
