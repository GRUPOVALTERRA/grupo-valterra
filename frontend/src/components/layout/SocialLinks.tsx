import type { ReactElement } from "react";
import { SOCIAL_LINKS, type SocialName } from "@/lib/social";

const ICONS: Record<SocialName, ReactElement> = {
  Facebook: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.5-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0022 12z" />
    </svg>
  ),
  Instagram: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  ),
  TikTok: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1.04-.1z" />
    </svg>
  ),
  X: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.4z" />
    </svg>
  ),
};

interface SocialLinksProps {
  /** "dark": fondo navy (footer) · "light": fondo blanco (sección contacto) */
  variant?: "dark" | "light";
}

export function SocialLinks({ variant = "dark" }: SocialLinksProps) {
  const styles =
    variant === "dark"
      ? "text-white/70 hover:bg-white/10 hover:text-[#C9A86A]"
      : "border border-[#0A2342]/15 text-[#0A2342] hover:border-[#C9A86A] hover:text-[#C9A86A]";
  return (
    <div className="flex items-center gap-2">
      {SOCIAL_LINKS.map((s) => (
        <a
          key={s.name}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${s.name} de Grupo Valterra`}
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${styles}`}
        >
          {ICONS[s.name]}
        </a>
      ))}
    </div>
  );
}
