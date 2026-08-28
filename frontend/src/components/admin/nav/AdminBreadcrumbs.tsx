import Link from "next/link";
import { Fragment } from "react";

/**
 * AdminBreadcrumbs — miga de pan para páginas profundas del panel.
 * Solo se usa donde aporta (ej.: Panel > Propiedades > Editar propiedad);
 * las secciones de primer nivel no la necesitan (ya está la nav principal).
 */

export interface BreadcrumbItem {
  label: string;
  /** Sin href → es la página actual (aria-current="page"). */
  href?: string;
}

export function AdminBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Ruta de navegación" className="text-xs text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <Fragment key={`${item.label}-${i}`}>
            {i > 0 && (
              <li aria-hidden className="select-none text-[#C9A86A]">
                ›
              </li>
            )}
            <li>
              {item.href ? (
                <Link
                  href={item.href}
                  className="font-medium text-[#4A5568] underline-offset-2 hover:text-[#0A2342] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A2342]"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="font-semibold text-[#0A2342]">
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
