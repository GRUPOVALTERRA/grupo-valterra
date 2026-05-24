import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";

/**
 * Agencies service - Sprint 10 MF4.
 *
 * Solo lookup minimo necesario para resolver el scope del super-admin.
 * MF6 lo extiende con CRUD completo.
 */

export interface AgencyLite {
  id: string;
  slug: string;
  name: string;
}

interface AgencyRow {
  id: string;
  slug: string;
  name: string;
}

// Cache module-level: el id de Valterra no cambia entre requests
let cachedValterra: AgencyLite | null = null;
let cachedValterraFailedAt = 0;
const FAIL_TTL_MS = 60_000; // si fallo, reintentar despues de 1 min

/**
 * Resuelve la agency canonica "Grupo Valterra" via slug.
 * Cached. Si falla la primera vez, reintenta tras FAIL_TTL_MS.
 * Si Supabase no esta configurado o falla → null (caller decide fallback).
 */
export async function getValterraAgency(): Promise<AgencyLite | null> {
  if (cachedValterra) return cachedValterra;
  if (Date.now() - cachedValterraFailedAt < FAIL_TTL_MS) return null;

  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("agencies")
        .select("id, slug, name")
        .eq("slug", "valterra")
        .maybeSingle(),
      4000,
      "agencies.valterra",
    );

    if (error) {
      log.error("agencies", "lookup valterra error", { message: error.message, code: error.code });
      cachedValterraFailedAt = Date.now();
      return null;
    }

    if (!data) {
      log.warn("agencies", "valterra no existe en DB (correr seed-agency-valterra.sql)");
      cachedValterraFailedAt = Date.now();
      return null;
    }

    cachedValterra = data as AgencyRow;
    return cachedValterra;
  } catch (err) {
    log.error("agencies", "getValterraAgency exception", err instanceof Error ? err : { err: String(err) });
    cachedValterraFailedAt = Date.now();
    return null;
  }
}

/** Atajo: solo el id. Devuelve null si Valterra no se pudo resolver. */
export async function getValterraAgencyId(): Promise<string | null> {
  const a = await getValterraAgency();
  return a?.id ?? null;
}
