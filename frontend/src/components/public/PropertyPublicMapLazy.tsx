"use client";

import dynamic from "next/dynamic";

/**
 * Carga diferida del mapa público, sin SSR.
 *
 * POR QUE ESTE ARCHIVO EXISTE:
 *
 * `PropertyPublicMap` hace `import L from "leaflet"` en el nivel superior
 * del módulo, y Leaflet toca `window` apenas se evalúa. Un componente
 * `"use client"` igual se prerenderiza en el servidor, así que sin
 * `ssr: false` el módulo se ejecuta ahí y lanza
 * `ReferenceError: window is not defined`.
 *
 * Ese error no rompía la ficha —Next servía el `loading` y montaba el mapa
 * en el cliente, con la request en 200— pero ensuciaba los logs de runtime
 * en cada visita a una propiedad con ubicación visible.
 *
 * `ssr: false` NO puede declararse en `PropertyLocationBlock`: en App
 * Router está prohibido dentro de un Server Component. Y convertir ese
 * bloque a cliente sería peor, porque hoy decide en el servidor si la
 * sección existe: con modo `hidden` el navegador nunca recibe las
 * coordenadas. Por eso el `ssr: false` vive acá, en un wrapper cliente
 * mínimo — el mismo patrón que ya usa `PropertyLocationSection` en el
 * panel de administración.
 */
const PropertyPublicMapLazy = dynamic(
  () => import("@/components/public/PropertyPublicMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 w-full items-center justify-center rounded-2xl border border-[#D8D8D8] bg-slate-50 text-xs text-slate-400">
        Cargando mapa…
      </div>
    ),
  },
);

export default PropertyPublicMapLazy;
