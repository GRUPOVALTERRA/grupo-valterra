import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase admin para server-side.
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY — bypassa RLS y SOLO puede vivir en código
 * que corre en el servidor (route handlers, server components). NUNCA
 * exponer esta key al cliente.
 *
 * Cached a nivel de módulo para evitar recrear clientes en hot reload.
 *
 * Si las variables de entorno no están configuradas, los métodos del service
 * caen en modo memoria — útil para desarrollo sin Supabase y para CI.
 */

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase no configurado. Definir SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });

  return cached;
}

/**
 * Helper: ejecuta una operación Supabase con timeout y mensaje de error claro.
 */
export async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms = 8000,
  label = "supabase",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[${label}] timeout tras ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
