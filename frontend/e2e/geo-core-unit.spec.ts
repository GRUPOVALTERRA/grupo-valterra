import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";

/**
 * S18 PR1 — CORE-GEO-01: unitarios puros de la fundación geo.
 * Sin navegador, sin red, sin Supabase. Incluye tests específicos de
 * PRIVACIDAD y guardas anti-regresión sobre el fuente público.
 */

const require_ = Module.createRequire(__filename);
const geo = () => require_("../src/lib/geo/validate.ts");
const pub = () => require_("../src/lib/geo/public-location.ts");
const types = () => require_("../src/lib/geo/types.ts");

/* ---------------- validadores ---------------- */

test.describe("geo/validate", () => {
  test("rangos WGS84 estrictos", () => {
    const { isValidLatitude, isValidLongitude, isValidGeoPoint } = geo();
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(90.0001)).toBe(false);
    expect(isValidLatitude(NaN)).toBe(false);
    expect(isValidLatitude("-27.4")).toBe(false);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(180.1)).toBe(false);
    expect(isValidGeoPoint({ latitude: -27.47, longitude: -58.83 })).toBe(true);
    expect(isValidGeoPoint({ latitude: -27.47, longitude: 999 })).toBe(false);
    expect(isValidGeoPoint(null)).toBe(false);
  });

  test("modos: allowlist estricta", () => {
    const { isPublicLocationMode } = geo();
    for (const ok of ["exact", "approximate", "hidden"]) {
      expect(isPublicLocationMode(ok)).toBe(true);
    }
    for (const bad of ["EXACT", "", null, undefined, "aprox"]) {
      expect(isPublicLocationMode(bad)).toBe(false);
    }
  });

  test("radio: rango del CHECK 0013 y clamp", () => {
    const { isValidRadiusM, clampRadiusM } = geo();
    const { PUBLIC_RADIUS_MIN_M, PUBLIC_RADIUS_MAX_M } = types();
    expect(isValidRadiusM(PUBLIC_RADIUS_MIN_M)).toBe(true);
    expect(isValidRadiusM(PUBLIC_RADIUS_MAX_M)).toBe(true);
    expect(isValidRadiusM(PUBLIC_RADIUS_MIN_M - 1)).toBe(false);
    expect(isValidRadiusM(PUBLIC_RADIUS_MAX_M + 1)).toBe(false);
    expect(isValidRadiusM(300.5)).toBe(false);
    expect(clampRadiusM(1)).toBe(PUBLIC_RADIUS_MIN_M);
    expect(clampRadiusM(99999)).toBe(PUBLIC_RADIUS_MAX_M);
    expect(clampRadiusM(300)).toBe(300);
    expect(clampRadiusM(NaN)).toBe(PUBLIC_RADIUS_MIN_M);
  });

  test("numeric de Supabase (string) se convierte estricto", () => {
    const { toFiniteNumberOrNull } = geo();
    expect(toFiniteNumberOrNull("-27.469100")).toBeCloseTo(-27.4691);
    expect(toFiniteNumberOrNull(300)).toBe(300);
    expect(toFiniteNumberOrNull("")).toBeNull();
    expect(toFiniteNumberOrNull("12,5")).toBeNull();
    expect(toFiniteNumberOrNull(undefined)).toBeNull();
    expect(toFiniteNumberOrNull(Infinity)).toBeNull();
  });
});

/* ---------------- PRIVACIDAD ---------------- */

test.describe("resolvePublicLocation — fail-closed", () => {
  const center = { public_latitude: "-27.469100", public_longitude: "-58.830600" };

  test("hidden => hidden aunque haya centro cargado", () => {
    const { resolvePublicLocation } = pub();
    expect(
      resolvePublicLocation({ public_location_mode: "hidden", ...center, public_radius_m: 300 }),
    ).toEqual({ kind: "hidden" });
  });

  test("modo invalido/desconocido => hidden", () => {
    const { resolvePublicLocation } = pub();
    for (const mode of [null, undefined, "", "public", "EXACT", "aprox"]) {
      expect(
        resolvePublicLocation({ public_location_mode: mode, ...center, public_radius_m: 300 }).kind,
      ).toBe("hidden");
    }
  });

  test("approximate/exact sin centro publico => hidden (no inventa, no cae a la interna)", () => {
    const { resolvePublicLocation } = pub();
    for (const mode of ["approximate", "exact"]) {
      expect(
        resolvePublicLocation({
          public_location_mode: mode,
          public_latitude: null,
          public_longitude: null,
          public_radius_m: 300,
        }),
      ).toEqual({ kind: "hidden" });
    }
  });

  test("coordenadas internas coladas en la fila se IGNORAN", () => {
    const { resolvePublicLocation } = pub();
    const row = {
      public_location_mode: "approximate",
      public_latitude: null,
      public_longitude: null,
      public_radius_m: 300,
      lat: -27.111111, // interna exacta — jamás debe filtrarse
      lng: -58.222222,
    };
    expect(resolvePublicLocation(row)).toEqual({ kind: "hidden" });
  });

  test("approximate valido => circulo con radio clampeado", () => {
    const { resolvePublicLocation } = pub();
    const { PUBLIC_RADIUS_MIN_M } = types();
    expect(
      resolvePublicLocation({ public_location_mode: "approximate", ...center, public_radius_m: "10" }),
    ).toEqual({
      kind: "approximate",
      center: { latitude: -27.4691, longitude: -58.8306 },
      radiusM: PUBLIC_RADIUS_MIN_M,
    });
  });

  test("approximate sin radio => radio default", () => {
    const { resolvePublicLocation } = pub();
    const { PUBLIC_RADIUS_DEFAULT_M } = types();
    const loc = resolvePublicLocation({
      public_location_mode: "approximate",
      ...center,
      public_radius_m: null,
    });
    expect(loc.kind).toBe("approximate");
    expect(loc.radiusM).toBe(PUBLIC_RADIUS_DEFAULT_M);
  });

  test("exact deliberado => punto exacto publicado", () => {
    const { resolvePublicLocation } = pub();
    expect(
      resolvePublicLocation({ public_location_mode: "exact", ...center, public_radius_m: 300 }),
    ).toEqual({ kind: "exact", point: { latitude: -27.4691, longitude: -58.8306 } });
  });

  test("centro fuera de rango => hidden", () => {
    const { resolvePublicLocation } = pub();
    expect(
      resolvePublicLocation({
        public_location_mode: "exact",
        public_latitude: "91",
        public_longitude: "-58.83",
        public_radius_m: 300,
      }),
    ).toEqual({ kind: "hidden" });
  });

  test("googleMapsLink: hidden => null; visible => deep link gratuito", () => {
    const { googleMapsLink } = pub();
    expect(googleMapsLink({ kind: "hidden" })).toBeNull();
    expect(
      googleMapsLink({ kind: "exact", point: { latitude: -27.5, longitude: -58.8 } }),
    ).toBe("https://www.google.com/maps?q=-27.5,-58.8");
  });
});

/* ---------------- anti-regresión sobre el fuente ---------------- */

test.describe("properties.ts — sin coordenadas internas hacia el publico", () => {
  const source = readFileSync(join(__dirname, "../src/services/properties.ts"), "utf8");

  test("COLUMNS publico no vuelve a contener lat/lng internas", () => {
    const columns = source.match(/const COLUMNS_BASE =[\s\S]*?;/)?.[0] ?? "";
    expect(columns).not.toMatch(/[",]lat[,"]/);
    expect(columns).not.toMatch(/[",]lng[,"]/);
  });

  test("el mapper no copia row.lat / row.lng", () => {
    expect(source).not.toMatch(/row\.lat\b/);
    expect(source).not.toMatch(/row\.lng\b/);
  });

  test("el modulo geo es puro: sin imports de dominio/infra", () => {
    for (const f of ["types.ts", "validate.ts", "public-location.ts", "geocoding.ts"]) {
      const src = readFileSync(join(__dirname, "../src/lib/geo", f), "utf8");
      const imports = src.match(/^\s*import[\s\S]*?from\s+"[^"]+";?$/gm) ?? [];
      for (const line of imports) {
        // Solo imports relativos internos del modulo o node builtins.
        expect(line).toMatch(/from "(\.\/|node:)/);
        expect(line).not.toMatch(/supabase|next|resend|@\//i);
      }
    }
  });
});
