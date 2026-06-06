"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MOCK_PROPERTIES } from "@/services/mock-properties";

type Status = "idle" | "submitting" | "success" | "error";

interface ContactResponse {
  ok: boolean;
  leadId?: string;
  error?: "validation" | "spam" | "server";
  details?: Record<string, string>;
}

interface ContactSectionProps {
  /** Slug de la propiedad consultada. Si se provee, bypasea el hash/mock lookup. */
  propertySlug?: string;
  /** Título de la propiedad. Usado directamente en el payload si se provee. */
  propertyTitle?: string;
}

export function ContactSection({ propertySlug: propSlug, propertyTitle: propTitle }: ContactSectionProps = {}) {
  const [status, setStatus] = useState<Status>("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [propertySlug, setPropertySlug] = useState(propSlug ?? "");

  useEffect(() => {
    // Si el slug viene por prop (página de detalle), no leer el hash.
    if (propSlug) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash.startsWith("contacto-")) {
      const slug = hash.replace(/^contacto-/, "");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hash read on mount
      if (MOCK_PROPERTIES.some((p) => p.slug === slug)) setPropertySlug(slug);
    }
  }, [propSlug]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === "submitting") return;

    const form = e.currentTarget;
    const fd = new FormData(form);

    setStatus("submitting");
    setFieldErrors({});
    setGeneralError(null);

    const slug = String(fd.get("propertySlug") ?? "");
    const propertyTitle = propTitle ?? MOCK_PROPERTIES.find((p) => p.slug === slug)?.title;

    const payload = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      message: String(fd.get("message") ?? ""),
      propertySlug: slug || undefined,
      propertyTitle,
      website: String(fd.get("website") ?? ""),
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ContactResponse;

      if (data.ok) {
        setStatus("success");
        setLeadId(data.leadId ?? null);
        form.reset();
        setPropertySlug("");
        return;
      }
      if (data.error === "validation") {
        setFieldErrors(data.details ?? {});
        setGeneralError("Revisá los campos marcados.");
      } else if (data.error === "spam") {
        setGeneralError("Tu consulta fue marcada como spam.");
      } else {
        setGeneralError("No pudimos enviar tu consulta. Reintentá en unos segundos.");
      }
      setStatus("error");
    } catch {
      setStatus("error");
      setGeneralError("Error de conexión. Revisá tu internet y reintentá.");
    }
  };

  const isSubmitting = status === "submitting";

  return (
    <section id="contacto" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="lg:sticky lg:top-24">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
              ✦ Captación directa
            </span>
            <h2 className="mt-3 text-3xl font-bold text-[#0A2342] md:text-5xl">
              Enviá tu consulta.
              <br />
              <span className="text-[#C9A86A]">Te respondemos en 24hs.</span>
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600">
              Completá el formulario y un asesor experto va a contactarte para asesorarte sobre
              la propiedad que te interesa o las opciones disponibles según tus criterios.
            </p>
            <ul className="mt-8 space-y-3">
              {[
                { i: "⚡", t: "Respuesta en menos de 24hs hábiles" },
                { i: "🔒", t: "Tus datos están protegidos, cero compromiso" },
                { i: "💬", t: "Asesoramiento personalizado y honesto" },
              ].map((b) => (
                <li key={b.t} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="text-lg">{b.i}</span>
                  {b.t}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#D8D8D8] bg-white p-6 shadow-[0_20px_60px_-20px_rgba(10,35,66,0.18)] md:p-8">
            {status === "success" ? (
              <SuccessPanel leadId={leadId} onReset={() => setStatus("idle")} />
            ) : (
              <form onSubmit={onSubmit} noValidate className="relative space-y-4">
                {generalError && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <span aria-hidden>⚠</span>
                    <span>{generalError}</span>
                  </div>
                )}

                <Field name="name" label="Nombre completo" placeholder="Tu nombre" required autoComplete="name" disabled={isSubmitting} error={fieldErrors.name} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="email" type="email" label="Email (opcional)" placeholder="tu@email.com" autoComplete="email" disabled={isSubmitting} error={fieldErrors.email} />
                  <Field name="phone" type="tel" label="Teléfono" placeholder="+54 9 343 ..." required autoComplete="tel" disabled={isSubmitting} error={fieldErrors.phone} />
                </div>

                {propSlug ? (
                  /* Página de detalle: slug viene por prop — no mostrar select */
                  <input type="hidden" name="propertySlug" value={propSlug} />
                ) : (
                  /* Home / consulta general: select con opciones mock */
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Propiedad consultada (opcional)
                    </label>
                    <div className="relative mt-1">
                      <select
                        name="propertySlug"
                        value={propertySlug}
                        onChange={(e) => setPropertySlug(e.target.value)}
                        disabled={isSubmitting}
                        className="h-11 w-full appearance-none rounded-lg border border-[#D8D8D8] bg-white px-3 pr-9 text-sm text-[#0A2342] focus:border-[#0A2342] focus:outline-none disabled:opacity-60"
                      >
                        <option value="">Consulta general</option>
                        {MOCK_PROPERTIES.map((p) => (
                          <option key={p.slug} value={p.slug}>
                            {p.title} · {p.city}
                          </option>
                        ))}
                      </select>
                      <svg aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="contact-message" className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Mensaje
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    rows={4}
                    required
                    disabled={isSubmitting}
                    placeholder="Contanos qué estás buscando..."
                    aria-invalid={Boolean(fieldErrors.message)}
                    aria-describedby={fieldErrors.message ? "message-error" : undefined}
                    className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-[#0A2342] placeholder:text-slate-400 focus:outline-none disabled:opacity-60 ${
                      fieldErrors.message ? "border-red-400 focus:border-red-500" : "border-[#D8D8D8] focus:border-[#0A2342]"
                    }`}
                  />
                  {fieldErrors.message && (
                    <p id="message-error" className="mt-1 text-xs text-red-600">
                      {fieldErrors.message}
                    </p>
                  )}
                </div>

                <div aria-hidden className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    No completar
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0A2342] px-6 text-sm font-bold text-white transition-all hover:bg-[#071A32] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                        <path d="M21 12a9 9 0 00-9-9" strokeLinecap="round" />
                      </svg>
                      Enviando...
                    </>
                  ) : (
                    <>
                      Enviar consulta
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] text-slate-500">
                  Al enviar aceptás ser contactado por un asesor de Grupo Valterra.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

interface FieldProps {
  name: string;
  label: string;
  type?: "text" | "email" | "tel";
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  error?: string;
}

function Field({ name, label, type = "text", placeholder, required, disabled, autoComplete, error }: FieldProps) {
  const id = `contact-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm text-[#0A2342] placeholder:text-slate-400 focus:outline-none disabled:opacity-60 ${
          error ? "border-red-400 focus:border-red-500" : "border-[#D8D8D8] focus:border-[#0A2342]"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function SuccessPanel({ leadId, onReset }: { leadId: string | null; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#C9A86A]/15 text-3xl">
        ✓
      </span>
      <h3 className="mt-5 text-2xl font-semibold text-[#0A2342]">¡Consulta enviada!</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-600">
        Un asesor de Grupo Valterra te va a contactar en menos de 24 horas hábiles.
      </p>
      {leadId && <p className="mt-3 font-mono text-[11px] text-slate-400">Ref: {leadId}</p>}
      <button type="button" onClick={onReset} className="mt-6 text-sm font-medium text-[#0A2342] underline-offset-4 hover:underline">
        Enviar otra consulta
      </button>
    </div>
  );
}
