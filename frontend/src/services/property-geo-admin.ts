import { getSupabaseAdmin, isSupabaseConfigured, withTimeout } from "@/lib/supabase";
import { log } from "@/lib/logger";
import type { GeoPoint, PublicLocationMode } from "@/lib/geo/types";
import { isPublicLocationMode, toFiniteNumberOrNull } from "@/lib/geo/validate";

/**
 * S18 PR2 — servicio ADMINISTRATIVO de geolocalización.
 *
 * DTO separado a propósito: el `Property` público NO expone lat/lng
 * (invariante CORE-GEO-01, PR1) y este módulo es el ÚNICO camino por el
 * que la ubicación interna exacta llega al editor admin. Nunca importar
 * desde código público, nunca fusionar con el tipo Property.
 *
 * Scoping: toda query filtra por (id, agency_id) con service_role —
 * mismo patrón que updateProperty. El caller (server action) ya validó
 * membership/rol; este servicio vuelve a exigir agencyId igual.
 */

/** DTO admin: lo que el editor GEO ve y guarda. */
export interface PropertyAdminGeo {
  internal: GeoPoint | null;
  publicLocationMode: PublicLocationMode;
  publicPoint: GeoPoint | null;
  publicRadiusM: number;
}

const GEO_COLUMNS = "lat,lng,public_location_mode,public_latitude,public_longitude,public_radius_m";

interface GeoRow {
  lat: number | string | null;
  lng: number | string | null;
  public_location_mode: string | null;
  public_latitude: number | string | null;
  public_longitude: number | string | null;
  public_radius_m: number | string | null;
}

function toPoint(lat: unknown, lng: unknown): GeoPoint | null {
  const la = toFiniteNumberOrNull(lat);
  const ln = toFiniteNumberOrNull(lng);
  return la !== null && ln !== null ? { latitude: la, longitude: ln } : null;
}

export async function getPropertyAdminGeo(args: {
  propertyId: string;
  agencyId: string;
}): Promise<{ ok: true; geo: PropertyAdminGeo } | { ok: false; error: string }> {
  if (!args.propertyId || !args.agencyId) return { ok: false, error: "propertyId y agencyId requeridos" };
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase no configurado" };
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await withTimeout(
      supabase
        .from("properties")
        .select(GEO_COLUMNS)
        .eq("id", args.propertyId)
        .eq("agency_id", args.agencyId)
        .maybeSingle<GeoRow>(),
      6000,
      "properties.geo.select",
    );
    if (error) {
      log.error("property-geo-admin", "select error", { propertyId: args.propertyId, message: error.message });
      return { ok: false, error: error.message };
    }
    if (!data) return { ok: false, error: "Property no encontrada en esta agencia" };
    const mode = isPublicLocationMode(data.public_location_mode ?? "")
      ? (data.public_location_mode as PublicLocationMode)
      : "approximate";
    return {
      ok: true,
      geo: {
        internal: toPoint(data.lat, data.lng),
        publicLocationMode: mode,
        publicPoint: toPoint(data.public_latitude, data.public_longitude),
        publicRadiusM: toFiniteNumberOrNull(data.public_radius_m) ?? 300,
      },
    };
  } catch (err) {
    log.error("property-geo-admin", "select exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/**
 * Persiste el GEO completo en una única operación coherente.
 * Solo columnas geo: jamás toca título, precio, estado ni cover.
 */
export async function updatePropertyAdminGeo(args: {
  propertyId: string;
  agencyId: string;
  geo: PropertyAdminGeo;
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.propertyId || !args.agencyId) return { ok: false, error: "propertyId y agencyId requeridos" };
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase no configurado" };
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await withTimeout(
      supabase
        .from("properties")
        .update({
          lat: args.geo.internal?.latitude ?? null,
          lng: args.geo.internal?.longitude ?? null,
          public_location_mode: args.geo.publicLocationMode,
          public_latitude: args.geo.publicPoint?.latitude ?? null,
          public_longitude: args.geo.publicPoint?.longitude ?? null,
          public_radius_m: args.geo.publicRadiusM,
        })
        .eq("id", args.propertyId)
        .eq("agency_id", args.agencyId),
      6000,
      "properties.geo.update",
    );
    if (error) {
      log.error("property-geo-admin", "update error", { propertyId: args.propertyId, message: error.message, code: error.code });
      return { ok: false, error: error.message };
    }
    log.info("property-geo-admin", "geo actualizado", {
      propertyId: args.propertyId,
      agencyId: args.agencyId,
      mode: args.geo.publicLocationMode,
      hasInternal: args.geo.internal !== null,
      hasPublic: args.geo.publicPoint !== null,
    });
    return { ok: true };
  } catch (err) {
    log.error("property-geo-admin", "update exception", err instanceof Error ? err : { err: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
