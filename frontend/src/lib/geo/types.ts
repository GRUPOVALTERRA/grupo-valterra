/**
 * CORE-GEO-01 — tipos geograficos compartibles (S18 PR1).
 *
 * Modulo PURO: sin imports de dominio inmobiliario, sin Supabase, sin
 * Next. Candidato a reutilizacion (Grupo Valterra: propiedades y
 * demanda; Pati Feliz: mascotas/refugios/veterinarias). Las POLITICAS
 * de privacidad NO se comparten entre productos: cada consumidor
 * decide sus modos y radios; aca solo viven los tipos y la mecanica.
 */

/** Coordenada WGS84. Validar con `isValidGeoPoint` antes de persistir. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Modo de publicacion de la ubicacion de un recurso.
 *  - "exact":       el publico recibe un punto exacto, cargado
 *                   DELIBERADAMENTE (nunca derivado de la ubicacion
 *                   interna en forma automatica).
 *  - "approximate": el publico recibe un circulo (centro deliberado +
 *                   radio). Estandar del rubro para viviendas ocupadas.
 *  - "hidden":      la lectura publica no devuelve ubicacion.
 */
export type PublicLocationMode = "exact" | "approximate" | "hidden";

/**
 * Ubicacion publicable ya resuelta (fail-closed). Es lo UNICO que la
 * capa publica puede recibir: nunca un GeoPoint interno crudo.
 */
export type PublicLocation =
  | { kind: "exact"; point: GeoPoint }
  | { kind: "approximate"; center: GeoPoint; radiusM: number }
  | { kind: "hidden" };

/** Limites del radio publico (espejo del CHECK de la migracion 0013). */
export const PUBLIC_RADIUS_MIN_M = 50;
export const PUBLIC_RADIUS_MAX_M = 5000;
export const PUBLIC_RADIUS_DEFAULT_M = 300;

// DemandGeoProfile (VRE) NO se implementa aqui por decision directiva:
// queda solo documentado en docs/CORE-GEO-01.md hasta que arranque el
// Revenue Engine. Este modulo contiene unicamente contratos necesarios.
