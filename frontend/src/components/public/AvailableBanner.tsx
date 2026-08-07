import Image from "next/image";
import Link from "next/link";

/**
 * Banner institucional de Grupo Valterra que se muestra en el sitio público
 * cuando todavía no hay propiedades reales publicadas (reemplaza al snapshot
 * de propiedades de muestra, que quedó deshabilitado para el público).
 */
export function AvailableBanner() {
  return (
    <section className="bg-[#0A2342] py-20 md:py-28">
      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 text-center lg:px-8">
        <Image
          src="/brand/isotipo-vt.svg"
          alt="Grupo Valterra"
          width={72}
          height={72}
          priority
        />
        <span className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          Grupo Valterra · Soluciones Inmobiliarias del Litoral
        </span>
        <h2 className="mt-4 text-4xl font-bold uppercase tracking-[0.18em] text-[#C9A86A] md:text-6xl">
          Disponible
        </h2>
        <p className="mt-4 max-w-xl text-sm text-white/80 md:text-base">
          Estamos preparando nuestro catálogo de propiedades. Muy pronto vas a
          encontrar acá las mejores oportunidades del litoral.
        </p>
        <Link
          href="/#contacto"
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-[#C9A86A] px-8 text-sm font-semibold text-[#0A2342] transition-colors hover:bg-[#C9A86A]/90"
        >
          Contactanos
        </Link>
      </div>
    </section>
  );
}
