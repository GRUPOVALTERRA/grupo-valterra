import { NextResponse, type NextRequest } from "next/server";
import { getAllProperties, type PropertyFilters } from "@/services/properties";
import type { Property } from "@/services/mock-properties";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/properties
 *
 * Query params (todos opcionales):
 *   featured        → "1" | "true" para forzar destacadas
 *   limit           → 1..50 (default sin límite)
 *   city            → coincidencia exacta (ej. "Paraná")
 *   operation_type  → venta | alquiler | alquiler-temporal
 *   property_type   → casa | departamento | ph | terreno | local | oficina | campo | country
 *
 * Sin overfetch: si llega `limit` se respeta server-side.
 * Read-only, runtime nodejs para Supabase service role.
 */

type OperationType = Property["operation"];
type PropertyTypeT = Property["type"];

const VALID_OPERATION: ReadonlySet<OperationType> = new Set<OperationType>([
  "venta",
  "alquiler",
  "alquiler-temporal",
]);

const VALID_TYPE: ReadonlySet<PropertyTypeT> = new Set<PropertyTypeT>([
  "casa",
  "departamento",
  "ph",
  "terreno",
  "local",
  "oficina",
  "campo",
  "country",
]);

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), 50);
}

function parseFeatured(raw: string | null): boolean | undefined {
  if (raw === null) return undefined;
  return raw === "1" || raw.toLowerCase() === "true";
}

function parseOperation(raw: string | null): OperationType | undefined {
  if (!raw) return undefined;
  return VALID_OPERATION.has(raw as OperationType) ? (raw as OperationType) : undefined;
}

function parsePropertyType(raw: string | null): PropertyTypeT | undefined {
  if (!raw) return undefined;
  return VALID_TYPE.has(raw as PropertyTypeT) ? (raw as PropertyTypeT) : undefined;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const filters: PropertyFilters = {
    featured: parseFeatured(sp.get("featured")),
    limit: parseLimit(sp.get("limit")),
    city: sp.get("city")?.trim() || undefined,
    operationType: parseOperation(sp.get("operation_type")),
    propertyType: parsePropertyType(sp.get("property_type")),
  };

  const items = await getAllProperties(filters);
  return NextResponse.json({ ok: true, count: items.length, items });
}
