import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";

/**
 * S18 PR2 — editor GEO admin: unitarios puros + guardas estáticas.
 * Sin navegador, sin red, sin Supabase.
 */

const require_ = Module.createRequire(__filename);
const SRC = join(__dirname, "../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const { validateGeo } = require_("../src/lib/validateGeo.ts");

const okBase = {
  lat: "",
  lng: "",
  public_location_mode: "hidden",
  public_latitude: "",
  public_longitude: "",
  public_radius_m: "300",
};

/* ---------------- validateGeo ---------------- */

test.describe("validateGeo — server-side", () => {
  test("hidden sin coordenadas es válido (estado 'sin ubicación todavía')", () => {
    const r = validateGeo(okBase);
    expect(r.valid).toBe(true);
    expect(r.data).toEqual({
      internal: null,
      publicLocationMode: "hidden",
      publicPoint: null,
      publicRadiusM: 300,
    });
  });

  test("rangos: lat/lng interna fuera de rango se rechazan", () => {
    expect(validateGeo({ ...okBase, lat: "91", lng: "-58.8" }).valid).toBe(false);
    expect(validateGeo({ ...okBase, lat: "-27.5", lng: "-181" }).valid).toBe(false);
    expect(validateGeo({ ...okBase, lat: "abc", lng: "-58.8" }).valid).toBe(false);
  });

  test("interna: ambas o ninguna", () => {
    const r = validateGeo({ ...okBase, lat: "-27.5", lng: "" });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.lat).toContain("ambas");
  });

  test("mode allowlist estricta", () => {
    for (const bad of ["", "public", "EXACT", "aprox", null]) {
      expect(validateGeo({ ...okBase, public_location_mode: bad }).valid).toBe(false);
    }
  });

  test("approximate/exact sin centro público => RECHAZADO (no fingir publicación)", () => {
    for (const mode of ["approximate", "exact"]) {
      const r = validateGeo({ ...okBase, public_location_mode: mode });
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.public_latitude).toBeTruthy();
    }
  });

  test("centro público pareado y en rango", () => {
    expect(
      validateGeo({
        ...okBase,
        public_location_mode: "approximate",
        public_latitude: "-27.47",
        public_longitude: "",
      }).valid,
    ).toBe(false);
    expect(
      validateGeo({
        ...okBase,
        public_location_mode: "exact",
        public_latitude: "91",
        public_longitude: "-58.8",
      }).valid,
    ).toBe(false);
  });

  test("radius 50..5000, entero", () => {
    expect(validateGeo({ ...okBase, public_radius_m: "49" }).valid).toBe(false);
    expect(validateGeo({ ...okBase, public_radius_m: "5001" }).valid).toBe(false);
    expect(validateGeo({ ...okBase, public_radius_m: "" }).valid).toBe(false);
    expect(validateGeo({ ...okBase, public_radius_m: "300" }).valid).toBe(true);
  });

  test("approximate válido completo pasa (coma decimal aceptada)", () => {
    const r = validateGeo({
      lat: "-27,4692",
      lng: "-58,8306",
      public_location_mode: "approximate",
      public_latitude: "-27.4700",
      public_longitude: "-58.8300",
      public_radius_m: "500",
    });
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.data.internal).toEqual({ latitude: -27.4692, longitude: -58.8306 });
      expect(r.data.publicPoint).toEqual({ latitude: -27.47, longitude: -58.83 });
      expect(r.data.publicRadiusM).toBe(500);
    }
  });

  test("exact NO auto-copia la interna: el centro público es independiente", () => {
    // interna cargada + exact sin centro público => rechazo, no copia.
    const r = validateGeo({
      lat: "-27.5",
      lng: "-58.8",
      public_location_mode: "exact",
      public_latitude: "",
      public_longitude: "",
      public_radius_m: "300",
    });
    expect(r.valid).toBe(false);
  });

  test("limpiar interna: ambas vacías => internal null", () => {
    const r = validateGeo({ ...okBase, lat: "", lng: "" });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.data.internal).toBeNull();
  });
});

/* ---------------- guardas estáticas ---------------- */

test.describe("action GEO — autorización y flujo server-side", () => {
  const actions = read("app/admin/properties/actions.ts");
  const geoBlock = actions.slice(actions.indexOf("updatePropertyGeoAction"));

  test("usa requireAgencyPermission con rol de edición (viewer queda fuera)", () => {
    expect(geoBlock).toContain('requireAgencyPermission(ctx, "edit"');
    expect(actions).toContain('const EDITOR_ROLES = ["owner", "admin", "agent"] as const');
    expect(actions.match(/EDITOR_ROLES = \[[^\]]*\]/)?.[0]).not.toContain("viewer");
  });

  test("agencia resuelta server-side: el cliente no aporta agency_id", () => {
    expect(geoBlock).not.toMatch(/formData\.get\(["']agency/);
    expect(geoBlock).toContain("property.agencyId");
  });

  test("valida con validateGeo antes de persistir y persiste vía servicio admin", () => {
    expect(geoBlock.indexOf("validateGeo(")).toBeGreaterThan(-1);
    expect(geoBlock.indexOf("validateGeo(")).toBeLessThan(geoBlock.indexOf("updatePropertyAdminGeo("));
  });

  test("la action nunca copia lat/lng interna hacia public_*", () => {
    expect(geoBlock).not.toMatch(/public_latitude['"]?\s*[:=]\s*.*\b(lat|internal)\b/);
  });
});

test.describe("DTO admin separado", () => {
  const svc = read("services/property-geo-admin.ts");

  test("scoping por id + agency_id en select y update", () => {
    expect(svc.match(/\.eq\("id", args\.propertyId\)/g)?.length).toBe(2);
    expect(svc.match(/\.eq\("agency_id", args\.agencyId\)/g)?.length).toBe(2);
  });

  test("no reutiliza el Property público", () => {
    expect(svc).not.toContain("mock-properties");
    expect(svc).not.toMatch(/import[^;]*from "@\/services\/properties"/);
  });

  test("update toca SOLO columnas geo", () => {
    const update = svc.slice(svc.indexOf(".update({"), svc.indexOf("})", svc.indexOf(".update({")));
    for (const forbidden of ["title", "price", "status", "cover_image", "published", "slug"]) {
      expect(update).not.toContain(forbidden);
    }
  });
});

test.describe("Property público sigue sin lat/lng (invariante PR1)", () => {
  test("COLUMNS_BASE y mapper limpios", () => {
    const source = read("services/properties.ts");
    const columns = source.match(/const COLUMNS_BASE =[\s\S]*?;/)?.[0] ?? "";
    expect(columns).not.toMatch(/[",]lat[,"]/);
    expect(columns).not.toMatch(/[",]lng[,"]/);
    expect(source).not.toMatch(/row\.lat\b/);
  });
});

test.describe("UI — reglas de privacidad y mapa", () => {
  const section = read("components/admin/properties/PropertyLocationSection.tsx");
  const picker = read("components/admin/geo/GeoMapPicker.tsx");

  test("copia interna→pública SOLO con botón explícito + advertencia + confirm", () => {
    expect(section).toContain("Esta acción hará pública la ubicación exacta de esta propiedad.");
    const copyFn = section.slice(
      section.indexOf("const copyInternalToPublic"),
      section.indexOf("};", section.indexOf("const copyInternalToPublic")),
    );
    expect(copyFn).toContain("window.confirm");
    expect(copyFn).toContain("setPublicPoint");
  });

  test("HARDENING: el botón de copia solo existe en modo exact (approximate sin camino internal→public)", () => {
    // El botón vive dentro de un bloque condicional exclusivo de exact...
    const gate = section.indexOf('{mode === "exact" && (');
    expect(gate).toBeGreaterThan(-1);
    const btn = section.indexOf("Usar ubicación interna como ubicación pública");
    expect(btn).toBeGreaterThan(gate);
    // ...y aparece UNA sola vez en todo el componente (sin duplicados fuera del gate).
    expect(section.match(/Usar ubicación interna como ubicación pública/g)?.length).toBe(1);
    // El bloque approximate posterior solo contiene la nota (sin botón de copia).
    const approxNote = section.lastIndexOf('{mode === "approximate" && (');
    expect(approxNote).toBeGreaterThan(btn);
    expect(section.slice(approxNote)).toContain("no se");
    expect(section.slice(approxNote)).not.toContain("Usar ubicación interna");
  });

  test("cambiar modo NO copia coordenadas", () => {
    const modeButtons = section.slice(
      section.indexOf("MODE_OPTIONS.map"),
      section.indexOf("fieldErrors.public_location_mode"),
    );
    expect(modeButtons).toContain("setMode(o.value)");
    expect(modeButtons).not.toContain("setPublicPoint");
    expect(modeButtons).not.toContain("internal");
  });

  test("el centro inicial del mapa no se persiste", () => {
    const saveFn = section.slice(
      section.indexOf("const save = ()"),
      section.indexOf("};", section.indexOf("const save = ()")),
    );
    expect(saveFn).not.toContain("FALLBACK_CENTER");
    expect(saveFn).toContain('fd.set("lat", fmt(internal?.latitude))');
    // El picker solo emite onChange por interacción del operador.
    expect(picker).toMatch(/map\.on\("click"/);
    expect(picker).toMatch(/marker\.on\("dragend"/);
    const changes = picker.match(/onChangeRef\.current\?\.\(/g) ?? [];
    expect(changes.length).toBe(2); // click + dragend, nada más
  });

  test("mensaje de hidden presente", () => {
    expect(section).toContain("La ubicación no se mostrará públicamente.");
  });

  test("preview usa resolvePublicLocation (mismo CORE-GEO-01)", () => {
    expect(section).toMatch(/import[^;]*resolvePublicLocation[^;]*from "@\/lib\/geo\/public-location"/);
    expect(section).toContain("resolvePublicLocation({");
  });

  test("Leaflet: dynamic ssr:false + atribución de tiles visible + sin API key", () => {
    expect(section).toContain("ssr: false");
    expect(picker).toContain("server.arcgisonline.com");
    expect(picker).toMatch(/attribution:[\s\S]*Esri/);
    expect(picker).toContain("attributionControl: true");
    expect(picker).not.toMatch(/api[_-]?key/i);
  });

  test("mobile básico: layout apilable (grid responsivo)", () => {
    expect(section).toContain("lg:grid-cols-2");
  });
});

test.describe("persistencia/reload server-side", () => {
  const page = read("app/admin/properties/[slug]/edit/page.tsx");

  test("la página de edición hidrata initialGeo desde el servicio admin", () => {
    expect(page).toContain("getPropertyAdminGeo(");
    expect(page).toContain("initialGeo={adminGeo}");
    expect(page).toContain("updatePropertyGeoAction");
  });

  test("HARDENING: viewer nunca recibe el DTO GEO interno", () => {
    // La consulta del DTO está gated por canEditGeo: sin permiso no se
    // consulta ni se serializa nada sensible al cliente.
    expect(page).toMatch(/if \(canEditGeo && property\.id && property\.agencyId\)/);
    // El componente sensible tampoco se renderiza para viewer.
    expect(page).toMatch(/\{canEditGeo && adminGeo && \(\s*<PropertyLocationSection/);
    // No hay camino alternativo que llame al servicio fuera del gate.
    expect(page.match(/getPropertyAdminGeo\(/g)?.length).toBe(1);
    // Y no se finge permiso: sin canEditGeo, adminGeo queda null.
    expect(page).toContain("let adminGeo: PropertyAdminGeo | null = null");
  });
});

test.describe("HARDENING: errores cerrados (sin detalles del proveedor)", () => {
  const svc = read("services/property-geo-admin.ts");
  const actions = read("app/admin/properties/actions.ts");
  const geoBlock = actions.slice(actions.indexOf("updatePropertyGeoAction"));

  test("el servicio nunca devuelve error.message crudo", () => {
    expect(svc).not.toMatch(/error:\s*error\.message/);
    expect(svc).not.toMatch(/reason:\s*error\.message/);
    expect(svc).not.toMatch(/err\.message/);
    // Resultado cerrado por allowlist.
    expect(svc).toContain('"invalid-input" | "not-configured" | "not-found" | "db-error"');
  });

  test("los logs del servidor van saneados (código, no message/SQL)", () => {
    expect(svc).not.toMatch(/message:\s*error\.message/);
    expect(svc).toMatch(/code:\s*error\.code/);
  });

  test("la action devuelve mensaje genérico sin interpolar el reason", () => {
    expect(geoBlock).toContain('"No se pudo guardar la ubicación."');
    expect(geoBlock).not.toMatch(/No se pudo guardar[^"]*\$\{/);
  });
});
