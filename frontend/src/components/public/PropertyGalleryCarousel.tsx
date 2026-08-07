"use client";

import { useCallback, useState } from "react";

export interface GalleryCarouselImage {
  url: string;
  alt: string;
}

interface PropertyGalleryCarouselProps {
  images: GalleryCarouselImage[];
  /** Overlay superior (badges de operación/etiquetas) renderizado por el server component. */
  children?: React.ReactNode;
}

/**
 * Carrusel de galería para la ficha pública de propiedad (Sprint 17).
 * Flechas, contador y miniaturas; sin dependencias externas.
 * El contenedor padre define el aspect ratio (aspect-[16/9]).
 */
export function PropertyGalleryCarousel({ images, children }: PropertyGalleryCarouselProps) {
  const [index, setIndex] = useState(0);
  const count = images.length;

  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);

  if (count === 0) return null;
  const current = images[Math.min(index, count - 1)];

  return (
    <div
      className="absolute inset-0"
      role="group"
      aria-roledescription="carrusel"
      aria-label="Galería de fotos de la propiedad"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") prev();
        if (e.key === "ArrowRight") next();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- imágenes remotas del bucket público */}
      <img
        src={current.url}
        alt={current.alt}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {children}

      {count > 1 && (
        <>
          {/* Flechas */}
          <button
            type="button"
            onClick={prev}
            aria-label="Foto anterior"
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#0A2342]/70 text-white backdrop-blur-sm transition-colors hover:bg-[#0A2342]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Foto siguiente"
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#0A2342]/70 text-white backdrop-blur-sm transition-colors hover:bg-[#0A2342]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Contador */}
          <span className="absolute right-4 top-4 rounded-full bg-[#0A2342]/75 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            {index + 1} / {count}
          </span>

          {/* Miniaturas */}
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2 px-4">
            {images.map((img, i) => (
              <button
                key={img.url}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === index}
                className={`h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                  i === index
                    ? "border-[#C9A86A] opacity-100"
                    : "border-white/60 opacity-70 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura remota */}
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
