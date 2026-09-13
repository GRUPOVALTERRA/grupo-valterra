/**
 * S26-MAP-01 — formato de la pastilla de precio. Modulo PURO.
 *
 * La pastilla del mapa compite con el mapa por el espacio: el precio
 * completo ("U$S 430.000") tapa calles. Se abrevia SOLO en la pastilla;
 * la tarjeta resumen y la ficha siguen mostrando el precio exacto con
 * `formatPrice`. Nunca se redondea hacia arriba: un precio que parece
 * mas bajo de lo que es genera consultas que terminan en frustracion.
 */

import type { Property } from "@/services/mock-properties";

const SYMBOL: Record<Property["currency"], string> = {
  USD: "U$S",
  ARS: "$",
};

export function compactPrice(amount: number, currency: Property["currency"]): string {
  const symbol = SYMBOL[currency] ?? "$";
  if (!Number.isFinite(amount) || amount <= 0) return "Consultar";

  // Siempre hacia ABAJO (floor): "U$S 430 mil" para 430.600, "1,4 M" para
  // 1.460.000. Redondear al mas cercano mostraria un precio menor al real.
  if (amount >= 1_000_000) {
    const decimas = Math.floor(amount / 100_000); // 14 para 1.460.000
    const enteras = Math.floor(decimas / 10);
    const resto = decimas % 10;
    const label =
      resto === 0 || enteras >= 10 ? String(enteras) : `${enteras},${resto}`;
    return `${symbol} ${label} M`;
  }

  if (amount >= 10_000) {
    return `${symbol} ${Math.floor(amount / 1000)} mil`;
  }

  return `${symbol} ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(amount)}`;
}
