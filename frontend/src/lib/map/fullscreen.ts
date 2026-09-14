/**
 * S26-MAP-05 — pantalla completa del mapa. Modulo PURO.
 *
 * Decision del titular (13/09/2026): "al mapa le falta el boton de expandir
 * a toda la pantalla y minimizarla". Se implementa SIN la Fullscreen API
 * del navegador (Safari iOS no la ofrece para elementos comunes) y sin
 * dependencias: el contenedor del mapa pasa a `position: fixed` sobre todo
 * el viewport y vuelve con el mismo boton o con Escape.
 *
 * Escape tiene prioridad: si hay una tarjeta abierta, la cierra la tarjeta
 * (su propio listener) y el mapa no hace nada; recien el siguiente Escape
 * sale de pantalla completa. Asi el usuario nunca pierde las dos cosas de
 * un solo golpe.
 */

export type EscapeAction = "close-card" | "exit-fullscreen" | "none";

export function escapeAction(state: { fullscreen: boolean; hasSelection: boolean }): EscapeAction {
  if (state.hasSelection) return "close-card";
  if (state.fullscreen) return "exit-fullscreen";
  return "none";
}

export const FULLSCREEN_ENTER_LABEL = "Pantalla completa";
export const FULLSCREEN_EXIT_LABEL = "Salir de pantalla completa";

/** Etiqueta accesible del boton: describe la accion que VIENE, no el estado. */
export function fullscreenLabel(active: boolean): string {
  return active ? FULLSCREEN_EXIT_LABEL : FULLSCREEN_ENTER_LABEL;
}
