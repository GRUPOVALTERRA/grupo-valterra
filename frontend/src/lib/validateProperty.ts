import type { PropertyOperation, PropertyType } from "@/services/mock-properties";

/**
 * Validacion pura de inputs para edicion de property.
 * Sin dependencias. NUNCA throws.
 * Espejo del shape de validateLead.ts.
 *
 * Sprint 11 MF3.
 *
 * Whitelists matchean DB CHECK constraints (migration 0002).
 * Si cambia el schema DB, sincronizar acá.
 */

export interface PropertyInput {
  title?: unknown;
  description?: unknown;
  price?: unknown;
  currency?: unknown;
  operation_type?: unknown;
  property_type?: unknown;
  city?: unknown;
  neighborhood?: unknown;
  province?: unknown;
  address?: unknown;
  bedrooms?: unknown;
  bathrooms?: unknown;
  parking?: unknown;
  covered_area_m2?: unknown;
  total_area_m2?: unknown;
  badges?: unknown;
  published?: unknown;
}

export interface PropertyValidationData {
  title: string;
  description?: string;
  price: number;
  currency: "USD" | "ARS";
  operation_type: PropertyOperation;
  property_type: PropertyType;
  city: string;
  neighborhood?: string;
  province: string;
  address?: string;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  covered_area_m2?: number;
  total_area_m2?: number;
  badges?: string[];
  published: boolean;
}

export interface PropertyValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  data: PropertyValidationData;
}

const VALID_CURRENCY: ReadonlySet<string> = new Set(["USD", "ARS"]);
const VALID_OPERATION: ReadonlySet<string> = new Set([
  "venta", "alquiler", "alquiler-temporal",
]);
const VALID_TYPE: ReadonlySet<string> = new Set([
  "casa", "departamento", "ph", "terreno", "local", "oficina", "campo", "country",
]);

const MAX_PRICE = 99_999_999_999.99; // numeric(14,2)
const MAX_DESCRIPTION = 5000;
const MAX_AREA = 10_000_000;
const MAX_BADGE_LENGTH = 50;
const MAX_BADGES = 10;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseNumberOrUndefined(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = typeof v === "string" ? v.trim() : v;
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseIntOrUndefined(v: unknown): number | undefined {
  const n = parseNumberOrUndefined(v);
  if (n === undefined) return undefined;
  if (Number.isNaN(n)) return NaN;
  return Math.floor(n);
}

function parseBoolean(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "on" || s === "1" || s === "yes";
  }
  return false;
}

function parseBadges(v: unknown): { value: string[]; error?: string } {
  const raw = asString(v).trim();
  if (!raw) return { value: [] };
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const deduped = Array.from(new Set(items));
  if (deduped.length > MAX_BADGES) {
    return { value: deduped.slice(0, MAX_BADGES), error: `Maximo ${MAX_BADGES} badges` };
  }
  const tooLong = deduped.find((b) => b.length > MAX_BADGE_LENGTH);
  if (tooLong) {
    return { value: deduped, error: `Badge demasiado largo: "${tooLong.slice(0, 20)}..."` };
  }
  return { value: deduped };
}

export function validateProperty(input: PropertyInput): PropertyValidationResult {
  const errors: Record<string, string> = {};

  // title (DB CHECK char_length between 4 and 200)
  const title = asString(input.title).trim();
  if (!title) errors.title = "Titulo requerido";
  else if (title.length < 4) errors.title = "Titulo muy corto (minimo 4)";
  else if (title.length > 200) errors.title = "Titulo muy largo (maximo 200)";

  // description (opcional, sin DB constraint, cap razonable)
  // XSS strategy (defense-in-depth):
  //   1. Validator REJECTS strings containing < or > characters (HTML tags
  //      blocked at input · users get clear feedback "Sin HTML permitido").
  //   2. React render path NEVER uses dangerouslySetInnerHTML for description.
  //      All rendering goes through {description} JSX expressions which React
  //      auto-escapes to plain text. Verified across codebase.
  //   3. Server action stores raw string (no HTML transformation).
  //   4. If a HTML-rejected attempt arrives (malformed client), validator
  //      returns field error · NEVER throws · never silently strips.
  const descriptionRaw = asString(input.description).trim();
  let description: string | undefined;
  if (descriptionRaw) {
    if (descriptionRaw.length > MAX_DESCRIPTION) {
      errors.description = `Descripcion muy larga (maximo ${MAX_DESCRIPTION})`;
    } else if (/[<>]/.test(descriptionRaw)) {
      errors.description = "No se permite HTML en la descripcion";
    } else {
      description = descriptionRaw;
    }
  }

  // price (DB CHECK >= 0)
  const priceParsed = parseNumberOrUndefined(input.price);
  let price = 0;
  if (priceParsed === undefined) errors.price = "Precio requerido";
  else if (Number.isNaN(priceParsed)) errors.price = "Precio invalido";
  else if (priceParsed < 0) errors.price = "Precio debe ser >= 0";
  else if (priceParsed > MAX_PRICE) errors.price = "Precio excede limite";
  else price = priceParsed;

  // currency (DB CHECK in USD/ARS)
  const currencyRaw = asString(input.currency).trim().toUpperCase();
  if (!VALID_CURRENCY.has(currencyRaw)) errors.currency = "Currency invalida (USD o ARS)";
  const currency = (VALID_CURRENCY.has(currencyRaw) ? currencyRaw : "USD") as "USD" | "ARS";

  // operation_type
  const operationRaw = asString(input.operation_type).trim();
  if (!VALID_OPERATION.has(operationRaw)) {
    errors.operation_type = "Operacion invalida";
  }
  const operation_type = (VALID_OPERATION.has(operationRaw) ? operationRaw : "venta") as PropertyOperation;

  // property_type
  const propTypeRaw = asString(input.property_type).trim();
  if (!VALID_TYPE.has(propTypeRaw)) {
    errors.property_type = "Tipo invalido";
  }
  const property_type = (VALID_TYPE.has(propTypeRaw) ? propTypeRaw : "casa") as PropertyType;

  // city (DB NOT NULL)
  const city = asString(input.city).trim();
  if (!city) errors.city = "Ciudad requerida";
  else if (city.length > 100) errors.city = "Ciudad muy larga";

  // province (DB NOT NULL)
  const province = asString(input.province).trim();
  if (!province) errors.province = "Provincia requerida";
  else if (province.length > 100) errors.province = "Provincia muy larga";

  // neighborhood (opcional)
  const neighborhood = asString(input.neighborhood).trim() || undefined;
  if (neighborhood && neighborhood.length > 100) errors.neighborhood = "Barrio muy largo";

  // address (opcional)
  const address = asString(input.address).trim() || undefined;
  if (address && address.length > 200) errors.address = "Direccion muy larga";

  // bedrooms / bathrooms / parking (opt, int >= 0)
  const bedrooms = parseIntOrUndefined(input.bedrooms);
  if (bedrooms !== undefined) {
    if (Number.isNaN(bedrooms)) errors.bedrooms = "Dormitorios invalido";
    else if (bedrooms < 0) errors.bedrooms = "Dormitorios debe ser >= 0";
    else if (bedrooms > 50) errors.bedrooms = "Dormitorios excede limite";
  }
  const bathrooms = parseIntOrUndefined(input.bathrooms);
  if (bathrooms !== undefined) {
    if (Number.isNaN(bathrooms)) errors.bathrooms = "Banos invalido";
    else if (bathrooms < 0) errors.bathrooms = "Banos debe ser >= 0";
    else if (bathrooms > 50) errors.bathrooms = "Banos excede limite";
  }
  const parking = parseIntOrUndefined(input.parking);
  if (parking !== undefined) {
    if (Number.isNaN(parking)) errors.parking = "Cocheras invalido";
    else if (parking < 0) errors.parking = "Cocheras debe ser >= 0";
    else if (parking > 100) errors.parking = "Cocheras excede limite";
  }

  // covered_area_m2 / total_area_m2 (opt, decimal >= 0)
  const covered = parseNumberOrUndefined(input.covered_area_m2);
  if (covered !== undefined) {
    if (Number.isNaN(covered)) errors.covered_area_m2 = "Area cubierta invalida";
    else if (covered < 0) errors.covered_area_m2 = "Area cubierta >= 0";
    else if (covered > MAX_AREA) errors.covered_area_m2 = "Area excede limite";
  }
  const total = parseNumberOrUndefined(input.total_area_m2);
  if (total !== undefined) {
    if (Number.isNaN(total)) errors.total_area_m2 = "Area total invalida";
    else if (total < 0) errors.total_area_m2 = "Area total >= 0";
    else if (total > MAX_AREA) errors.total_area_m2 = "Area excede limite";
  }

  // badges (CSV)
  const badgesParsed = parseBadges(input.badges);
  if (badgesParsed.error) errors.badges = badgesParsed.error;

  // published (toggle)
  const published = parseBoolean(input.published);

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      title,
      description,
      price,
      currency,
      operation_type,
      property_type,
      city,
      neighborhood,
      province,
      address,
      bedrooms: bedrooms !== undefined && !Number.isNaN(bedrooms) ? bedrooms : undefined,
      bathrooms: bathrooms !== undefined && !Number.isNaN(bathrooms) ? bathrooms : undefined,
      parking: parking !== undefined && !Number.isNaN(parking) ? parking : undefined,
      covered_area_m2: covered !== undefined && !Number.isNaN(covered) ? covered : undefined,
      total_area_m2: total !== undefined && !Number.isNaN(total) ? total : undefined,
      badges: badgesParsed.value.length > 0 ? badgesParsed.value : undefined,
      published,
    },
  };
}
