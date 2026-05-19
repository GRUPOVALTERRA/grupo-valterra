import Image from "next/image";

interface LogoProps {
  variant?: "full" | "isotipo" | "isotipo-on-light";
  /** Tamaño en px del lado del isotipo, o altura del wordmark en variant=full */
  size?: number;
  className?: string;
  /** Mostrar descriptor "SOLUCIONES INMOBILIARIAS DEL LITORAL" debajo */
  showDescriptor?: boolean;
}

/**
 * Logo oficial Valterra. Fuente: VALTERRA_BRAND_KIT_OPCION_C (Corporativo Internacional).
 *
 * Variantes:
 *  - "full": isotipo + wordmark + descriptor (versión horizontal para footers / login)
 *  - "isotipo": cuadrado VT con fondo navy (default - navbar, favicon, avatars)
 *  - "isotipo-on-light": misma estructura pero pensado para fondos navy
 *
 * Asset paths absolutos desde /public/brand/* → servidos como /brand/*.svg.
 */
export function Logo({
  variant = "isotipo",
  size = 40,
  className = "",
  showDescriptor = false,
}: LogoProps) {
  if (variant === "full") {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <Image
          src="/brand/isotipo-vt.svg"
          alt="Grupo Valterra"
          width={size}
          height={size}
          priority
        />
        <div className="flex flex-col leading-tight">
          <span
            className="font-semibold tracking-[0.04em] text-[#0A2342]"
            style={{
              fontSize: Math.max(14, size * 0.36),
              fontFamily: "var(--font-montserrat), Inter, sans-serif",
            }}
          >
            GRUPO VALTERRA
          </span>
          {showDescriptor && (
            <span
              className="uppercase tracking-[0.18em] text-[#2E5E4E]"
              style={{
                fontSize: Math.max(9, size * 0.18),
                fontFamily: "var(--font-inter), Arial, sans-serif",
              }}
            >
              Soluciones Inmobiliarias del Litoral
            </span>
          )}
        </div>
      </div>
    );
  }

  // isotipo / isotipo-on-light → mismo SVG (el fondo navy ya está en el SVG)
  return (
    <Image
      src="/brand/isotipo-vt.svg"
      alt="Grupo Valterra"
      width={size}
      height={size}
      priority
      className={className}
    />
  );
}

/** Wordmark "GRUPO VALTERRA" sin isotipo (útil cuando ya hay isotipo cerca) */
export function Wordmark({
  size = 16,
  tone = "dark",
  showDescriptor = false,
  className = "",
}: {
  size?: number;
  tone?: "dark" | "light";
  showDescriptor?: boolean;
  className?: string;
}) {
  const main = tone === "dark" ? "text-[#0A2342]" : "text-white";
  const sub = "text-[#C9A86A]";
  return (
    <div className={`flex flex-col leading-tight ${className}`}>
      <span
        className={`font-semibold tracking-[0.04em] ${main}`}
        style={{
          fontSize: size,
          fontFamily: "var(--font-montserrat), Inter, sans-serif",
        }}
      >
        GRUPO VALTERRA
      </span>
      {showDescriptor && (
        <span
          className={`uppercase tracking-[0.2em] ${sub}`}
          style={{
            fontSize: Math.max(8, size * 0.5),
            fontFamily: "var(--font-inter), Arial, sans-serif",
          }}
        >
          Soluciones Inmobiliarias del Litoral
        </span>
      )}
    </div>
  );
}
