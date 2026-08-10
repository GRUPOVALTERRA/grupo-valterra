import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { resolvePublicLocation } from "@/lib/geo/public-location";
import type { PublicLocation } from "@/lib/geo/types";

/**
 * S18 PR3 — lectura PÚBLICA de la ubicación de una propiedad.
 *
 * Invariante CORE-GEO-01: este módulo selecciona ÚNICAMENTE las columnas
 * `public_*`. Las coordenadas internas (`lat`/`lng`) no aparecen en el
 * SELECT ni en el tipo de retorno, así que no pueden filtrarse al
 * cliente ni por descuido ni por refactor.
 *
 * Devuelve un `PublicLocation` ya resuelto por el core (fail-closed):
 * ante cualquier error, modo inválido o centro público ausente, el
 * resultado es `hidden`.
 */

const PUBLIC_GEO_COLUMNS =
  "public_location_mode,public_latitude,public_longitude,public_radius_m";

const HIDDEN: PublicLocation = { kind: "hidden" };

interface PublicGeoRow {
  public_location_mode: string | null;
  public_latitude: number | string | null;
  public_longitude: number | string | null;
  public_radius_m: number | string | null;
}

/** Ubicación publicable de una propiedad publicada. Nunca lanza. */
export async function getPublicLocationByPropertyId(
  propertyId: string | undefined,
): Promise<PublicLocation> {
  if (!propertyId || !isSupabaseConfigured()) return HIDDEN;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("properties")
        .select(PUBLIC_GEO_COLUMNS)
        .eq("id", propertyId)
        .eq("published", true)
        .maybeSingle<PublicGeoRow>(),
      4000,
      "properties.publicLocation",
    );
    if (error) {
      // Columnas aún no migradas o error transitorio: fail-closed silencioso.
      log.warn("property-public-location", "select error", {
        propertyId,
        code: error.code ?? "unknown",
      });
      return HIDDEN;
    }
    if (!data) return HIDDEN;
    return resolvePublicLocation(data);
  } catch (err) {
    log.warn("property-public-location", "exception", {
      propertyId,
      kind: err instanceof Error ? err.name : "unknown",
    });
    return HIDDEN;
  }
}
