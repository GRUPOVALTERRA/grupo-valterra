"use client";

import { useState, type FormEvent } from "react";

export function NewsletterForm() {
  const [sent, setSent] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // TODO: cuando exista /api/newsletter, hacer POST acá
    setSent(true);
  };

  if (sent) {
    return (
      <div className="mt-4 rounded-lg border border-[#C9A86A]/40 bg-[#C9A86A]/10 px-3 py-2.5 text-xs text-white/90">
        ✓ ¡Gracias! Te vamos a escribir pronto.
      </div>
    );
  }

  return (
    <form className="mt-4 flex gap-2" onSubmit={onSubmit}>
      <input
        type="email"
        required
        placeholder="tu@email.com"
        className="h-11 w-full rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white placeholder:text-white/50 focus:border-[#C9A86A] focus:outline-none"
      />
      <button
        type="submit"
        className="h-11 rounded-lg bg-[#C9A86A] px-4 text-sm font-bold text-[#0A2342] transition-all hover:brightness-105"
      >
        Unirme
      </button>
    </form>
  );
}
