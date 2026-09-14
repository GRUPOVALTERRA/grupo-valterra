import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { resolvePublicUrl } from "@/lib/storage";
import { isAgencyLogoPath } from "@/lib/agency-logo";
import { effectiveAgencyLogo, PORTAL_BADGE_SRC, type AgencyBadge } from "@/lib/map/badge";
import { CANONICAL_AGENCY_SLUG } from "@/services/agencies";

/**
 * S26-MAP-02 — lectura PUBLICA de la insignia de cada agencia
 * (nombre + logo miniatura) para el pin del mapa y la tarjeta.
 *
 * Solo dos columnas no sensibles: `name` y `logo_url`. Nada de CUIT,
 * email, telefono ni domicilio: eso vive en otros servicios con otros
 * permisos.
 *
 * `logo_url` guarda un PATH del bucket (no una URL). Se resuelve a URL
 * publica unicamente si tiene la forma exacta que escribe
 * `setAgencyLogo`; cualquier otro valor => sin logo (fail-closed).
 */

const BUCKET = "properties";
const CACHE_TTL_MS = 5 * 60_000;

let cache: { value: Record<string, AgencyBadge>; at: number } | null = null;

interface BadgeRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
}

export function resolveAgencyLogoUrl(value: string | null | undefined): string | null {
  if (!isAgencyLogoPath(value)) return null;
  return resolvePublicUrl(BUCKET, value);
}

/** agencyId → { name, logoUrl }. Nunca lanza; sin datos devuelve {}. */
export async function getAgencyBadgeMap(): Promise<Record<string, AgencyBadge>> {
  if (cache && Date.now() - cache.at <= CACHE_TTL_MS) return cache.value;
  if (!isSupabaseConfigured()) return {};

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase.from("agencies").select("id, slug, name, logo_url"),
      4000,
      "agencies.badgeMap",
    );
    if (error || !data) {
      if (error) log.warn("agency-badges", "badgeMap error", { code: error.code ?? "unknown" });
      return {};
    }
    const map: Record<string, AgencyBadge> = {};
    for (const row of data as BadgeRow[]) {
      map[row.id] = {
        name: row.name,
        // S26-MAP-04: la agencia canonica sin logo propio usa el isotipo del kit.
        logoUrl: effectiveAgencyLogo(row.slug, resolveAgencyLogoUrl(row.logo_url), CANONICAL_AGENCY_SLUG),
      };
    }
    cache = { value: map, at: Date.now() };
    return map;
  } catch (err) {
    log.error("agency-badges", "badgeMap exception", {
      kind: err instanceof Error ? err.name : "unknown",
    });
    return {};
  }
}

/** Invalida la cache tras un cambio de logo (misma instancia del servidor). */
export function invalidateAgencyBadgeCache(): void {
  cache = null;
}

export interface AgencyLogoProfile {
  id: string;
  slug: string;
  name: string;
  /** Logo subido por la agencia (path del bucket resuelto), o null. */
  ownLogoUrl: string | null;
  /** Isotipo del portal: solo para la agencia canonica (S26-MAP-04). */
  portalDefaultUrl: string | null;
  /** Lo que efectivamente se dibuja: propio ?? portal ?? null (inicial). */
  logoUrl: string | null;
}

/** Ficha minima de UNA agencia para la pantalla "Mi agencia". */
export async function getAgencyLogoProfile(agencyId: string): Promise<AgencyLogoProfile | null> {
  if (!agencyId || !isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("agencies")
        .select("id, slug, name, logo_url")
        .eq("id", agencyId)
        .maybeSingle<BadgeRow>(),
      4000,
      "agencies.logoProfile",
    );
    if (error || !data) return null;
    const ownLogoUrl = resolveAgencyLogoUrl(data.logo_url);
    const portalDefaultUrl = data.slug === CANONICAL_AGENCY_SLUG ? PORTAL_BADGE_SRC : null;
    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      ownLogoUrl,
      portalDefaultUrl,
      logoUrl: ownLogoUrl ?? portalDefaultUrl,
    };
  } catch {
    return null;
  }
}
