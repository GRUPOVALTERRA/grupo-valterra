import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SOCIAL_NETWORKS,
  OTHER_NETWORK_ID,
  networkLabel,
  classifyNetwork,
  normalizeCampaign,
  buildUtmUrl,
  UTM_MEDIUM_SOCIAL,
} from "../src/lib/social-utm";
import { sortSocial, totalSocial, type SocialRow } from "../src/lib/analytics-metrics";

/**
 * S20-PR4 — pestaña "Redes sociales".
 * Unit puro sobre la clasificación y el armado de enlaces, más guardas
 * estáticas sobre la migración 0016. Sin red, sin Supabase, sin navegador.
 */

const migration = () =>
  readFileSync(join(__dirname, "../supabase/migrations/0016_analytics_social.sql"), "utf8");

/**
 * La migración sin líneas de comentario.
 *
 * Las guardas tienen que mirar el SQL que se ejecuta, no la documentación:
 * el encabezado nombra `visit_hash` justamente para explicar que no se
 * expone, y un `toContain` sobre el archivo entero lo tomaría como
 * infracción.
 */
const migrationSql = () =>
  migration()
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

test.describe("clasificacion de red de origen", () => {
  test("1. utm_source manda por sobre el referrer", () => {
    expect(classifyNetwork({ utmSource: "instagram", referrerHost: "facebook.com" })).toBe(
      "instagram",
    );
  });

  test("2. alias de utm_source", () => {
    expect(classifyNetwork({ utmSource: "ig" })).toBe("instagram");
    expect(classifyNetwork({ utmSource: "FB" })).toBe("facebook");
    expect(classifyNetwork({ utmSource: " Meta " })).toBe("facebook");
    expect(classifyNetwork({ utmSource: "twitter" })).toBe("x");
    expect(classifyNetwork({ utmSource: "yt" })).toBe("youtube");
  });

  test("3. subdominios que usan las apps moviles", () => {
    expect(classifyNetwork({ referrerHost: "l.instagram.com" })).toBe("instagram");
    expect(classifyNetwork({ referrerHost: "lm.facebook.com" })).toBe("facebook");
    expect(classifyNetwork({ referrerHost: "m.facebook.com" })).toBe("facebook");
    expect(classifyNetwork({ referrerHost: "vm.tiktok.com" })).toBe("tiktok");
    expect(classifyNetwork({ referrerHost: "www.youtube.com" })).toBe("youtube");
  });

  test("4. acortadores y hosts exactos", () => {
    expect(classifyNetwork({ referrerHost: "t.co" })).toBe("x");
    expect(classifyNetwork({ referrerHost: "youtu.be" })).toBe("youtube");
    expect(classifyNetwork({ referrerHost: "wa.me" })).toBe("whatsapp");
    expect(classifyNetwork({ referrerHost: "fb.me" })).toBe("facebook");
  });

  test("5. referrer desconocido cae en 'otros', no se descarta", () => {
    expect(classifyNetwork({ referrerHost: "portalinmobiliario.com" })).toBe(OTHER_NETWORK_ID);
    expect(classifyNetwork({ utmSource: "newsletter" })).toBe(OTHER_NETWORK_ID);
  });

  test("6. trafico directo devuelve null y queda fuera del reporte", () => {
    // Es la regla que evita inflar el denominador de conversion por red.
    expect(classifyNetwork({})).toBeNull();
    expect(classifyNetwork({ utmSource: null, referrerHost: null })).toBeNull();
    expect(classifyNetwork({ utmSource: "  ", referrerHost: "" })).toBeNull();
  });

  test("7. un host que solo CONTIENE el nombre no es la red", () => {
    // no-instagram.com termina en "instagram.com" como substring pero no
    // es un subdominio suyo: sin el punto, seria un falso positivo.
    expect(classifyNetwork({ referrerHost: "no-instagram.com" })).toBe(OTHER_NETWORK_ID);
    expect(classifyNetwork({ referrerHost: "fakefacebook.com" })).toBe(OTHER_NETWORK_ID);
  });
});

test.describe("etiquetas de red", () => {
  test("8. toda red conocida tiene etiqueta y 'otros' no se muestra crudo", () => {
    for (const n of SOCIAL_NETWORKS) expect(networkLabel(n.id)).toBe(n.label);
    expect(networkLabel(OTHER_NETWORK_ID)).toBe("Otros sitios");
    expect(networkLabel(OTHER_NETWORK_ID)).not.toBe(OTHER_NETWORK_ID);
  });
});

test.describe("normalizacion de campana", () => {
  test("9. acentos, mayusculas y espacios convergen al mismo slug", () => {
    expect(normalizeCampaign("Verano 2027")).toBe("verano-2027");
    expect(normalizeCampaign("  verano   2027  ")).toBe("verano-2027");
    expect(normalizeCampaign("Promoción Otoño")).toBe("promocion-otono");
  });

  test("10. vacio o solo simbolos no inventa campana", () => {
    expect(normalizeCampaign("")).toBe("");
    expect(normalizeCampaign("   ")).toBe("");
    expect(normalizeCampaign("!!!")).toBe("");
  });
});

test.describe("generador de enlaces", () => {
  const baseUrl = "https://www.grupovalterra.com.ar";

  test("11. arma la URL con source y medium", () => {
    const url = buildUtmUrl({ baseUrl, path: "/", network: "instagram" });
    expect(url).toBe(
      `https://www.grupovalterra.com.ar/?utm_source=instagram&utm_medium=${UTM_MEDIUM_SOCIAL}`,
    );
  });

  test("12. incluye la campana normalizada", () => {
    const url = buildUtmUrl({
      baseUrl,
      path: "/propiedades/mi-terreno",
      network: "facebook",
      campaign: "Lanzamiento Camba Cuá",
    });
    expect(url).toContain("/propiedades/mi-terreno?");
    expect(url).toContain("utm_source=facebook");
    expect(url).toContain("utm_campaign=lanzamiento-camba-cua");
  });

  test("13. sin campana no agrega el parametro vacio", () => {
    const url = buildUtmUrl({ baseUrl, path: "/", network: "x", campaign: "   " });
    expect(url).not.toContain("utm_campaign");
  });

  test("14. es idempotente: mismo input, mismo string", () => {
    const args = { baseUrl, path: "/propiedades", network: "tiktok", campaign: "Verano" };
    expect(buildUtmUrl(args)).toBe(buildUtmUrl(args));
  });

  test("15. tolera barra final en baseUrl y ruta sin barra inicial", () => {
    const a = buildUtmUrl({ baseUrl: `${baseUrl}/`, path: "propiedades", network: "x" });
    expect(a.startsWith(`${baseUrl}/propiedades?`)).toBe(true);
    expect(a).not.toContain("//propiedades");
  });

  test("16. preserva parametros previos de la ruta", () => {
    const url = buildUtmUrl({ baseUrl, path: "/propiedades?tipo=terreno", network: "instagram" });
    expect(url).toContain("tipo=terreno");
    expect(url).toContain("utm_source=instagram");
  });

  test("17. el utm_source generado es el mismo id que devuelve la RPC", () => {
    // Si divergieran, el enlace publicado no se agruparia con su propia red.
    for (const n of SOCIAL_NETWORKS) {
      const url = buildUtmUrl({ baseUrl, path: "/", network: n.id });
      expect(url).toContain(`utm_source=${n.utmSource}`);
      expect(classifyNetwork({ utmSource: n.utmSource })).toBe(n.id);
    }
  });
});

test.describe("agregacion de filas", () => {
  const rows: SocialRow[] = [
    { network: "instagram", pageviews: 100, waClicks: 1 },
    { network: "facebook", pageviews: 10, waClicks: 5 },
    { network: "tiktok", pageviews: 10, waClicks: 5 },
  ];

  test("18. ordena por consultas y despues por visitas", () => {
    const [a, b, c] = sortSocial(rows);
    expect(a.network).toBe("facebook");
    expect(b.network).toBe("tiktok");
    expect(c.network).toBe("instagram");
  });

  test("19. sortSocial no muta el arreglo original", () => {
    const copia = [...rows];
    sortSocial(rows);
    expect(rows).toEqual(copia);
  });

  test("20. totalSocial suma ambas columnas", () => {
    expect(totalSocial(rows)).toEqual({ pageviews: 120, waClicks: 11 });
    expect(totalSocial([])).toEqual({ pageviews: 0, waClicks: 0 });
  });
});

test.describe("guardas de la migracion 0016", () => {
  test("21. es aditiva: no altera ni borra nada", () => {
    const sql = migrationSql().toLowerCase();
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("alter table");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("update ");
    expect(sql).not.toContain("insert into");
  });

  test("22. security invoker, nunca definer", () => {
    const sql = migrationSql().toLowerCase();
    expect(sql).toContain("security invoker");
    expect(sql).not.toContain("security definer");
  });

  test("23. revoca execute a public y conserva service_role", () => {
    const sql = migrationSql().toLowerCase();
    expect(sql).toContain("revoke all on function %s from public");
    expect(sql).toContain("grant execute on function %s to service_role");
  });

  test("24. no expone visit_hash", () => {
    expect(migrationSql()).not.toContain("visit_hash");
  });

  test("25. lleva el gate de Production en el encabezado", () => {
    expect(migration()).toContain("GATE");
  });

  test("26. cubre en SQL las mismas redes que el modulo TS", () => {
    const sql = migrationSql().toLowerCase();
    for (const n of SOCIAL_NETWORKS) expect(sql).toContain(`'${n.id}'`);
    expect(sql).toContain(`'${OTHER_NETWORK_ID}'`);
  });
});
