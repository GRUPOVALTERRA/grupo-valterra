import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth client server-side - Sprint 10 MF1 foundation.
 *
 * Coexiste con getSupabaseAdmin() (SERVICE_ROLE) en lib/supabase.ts.
 *
 * Diferencia clave:
 *   - getSupabaseAdmin: SERVICE_ROLE - bypassa RLS, usado por API routes
 *     server-only para leer/escribir cualquier fila.
 *   - getSupabaseServer (este archivo): ANON_KEY + session cookies del user
 *     autenticado. Respeta RLS y opera bajo el user actual. Sprint 10 MF3+
 *     conecta esto con login Supabase Auth.
 *
 * Si NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no estan
 * configurados, lanza error explicito (no silently no-op - estos son
 * requisitos hard para Sprint 10).
 */
export async function getSupabaseServer(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no configurados (Sprint 10 MF1 requirement)",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Set llamado desde un Server Component RSC - sin acceso a Response.
          // En ese caso el middleware refresh (Sprint 10 MF3) maneja la rotacion.
        }
      },
    },
  });
}
