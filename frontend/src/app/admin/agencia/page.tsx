import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { canManageAgencyLogo } from "@/lib/agency-logo";
import { getAgencyBySlug } from "@/services/agencies";
import { getAgencyLogoProfile } from "@/services/agency-badges";
import { AgencyLogoUploader } from "@/components/admin/agencies/AgencyLogoUploader";
import { AgencySettingsForm } from "@/app/admin/agencies/[slug]/AgencySettingsForm";

/**
 * S26-MAP-02 — "Mi agencia" (owner / admin).
 *
 * Primera pantalla del panel donde una inmobiliaria edita lo PROPIO de
 * la agencia: datos de contacto y logo miniatura. Decision del titular
 * (13/09/2026): los owners editan su configuracion completa.
 *
 * No hay logica nueva de permisos: se reusan `AgencySettingsForm` y
 * `updateAgencyAction` (super-admin, o owner/admin de ESA agencia,
 * verificado server-side) tal como existen para el super-admin.
 *
 * Scope: la agencia sale de la sesion (`scopedAgencyId`), nunca de la
 * URL. La UI muestra; la server action revalida el rol.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mi agencia - Valterra",
  robots: { index: false, follow: false },
};

export default async function MiAgenciaPage() {
  const ctx = await getAdminContext();
  if (!ctx.scopedAgencyId) notFound();

  const profile = await getAgencyLogoProfile(ctx.scopedAgencyId);
  if (!profile) notFound();
  const agency = await getAgencyBySlug(profile.slug);
  if (!agency) notFound();

  const membership = ctx.memberships.find((m) => m.agencyId === ctx.scopedAgencyId);
  const canEdit = ctx.isSuperAdmin || canManageAgencyLogo(membership?.role);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <header className="border-b border-[#D8D8D8] pb-4">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
          Mi agencia
        </span>
        <h1
          className="mt-1 text-2xl font-bold text-[#0A2342]"
          style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
        >
          {agency.name}
        </h1>
        <p className="mt-0.5 text-xs text-slate-500">
          /{agency.slug}
          {!canEdit && " · solo lectura: el owner o un admin pueden editar estos datos"}
        </p>
      </header>

      <section className="mt-6 grid gap-8 md:grid-cols-[1.2fr_1fr]">
        {/* Datos de contacto */}
        <div>
          <h2 className="text-sm font-semibold text-[#0A2342]">Datos de la agencia</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            El email de contacto es el destino de los avisos de consultas. El WhatsApp es el
            que reciben los interesados desde las fichas, las cards y el mapa.
          </p>
          <div className="mt-3">
            {canEdit ? (
              <AgencySettingsForm
                slug={agency.slug}
                initial={{
                  name: agency.name ?? "",
                  contact_email: agency.contact_email ?? "",
                  contact_phone: agency.contact_phone ?? "",
                  whatsapp: agency.whatsapp ?? "",
                  address: agency.address ?? "",
                  city: agency.city ?? "",
                  province: agency.province ?? "",
                }}
              />
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-[#D8D8D8] bg-white p-4 text-sm">
                <dt className="text-xs font-semibold text-[#0A2342]">Email de contacto</dt>
                <dd className="text-slate-600">{agency.contact_email ?? "—"}</dd>
                <dt className="text-xs font-semibold text-[#0A2342]">Teléfono</dt>
                <dd className="text-slate-600">{agency.contact_phone ?? "—"}</dd>
                <dt className="text-xs font-semibold text-[#0A2342]">WhatsApp</dt>
                <dd className="text-slate-600">{agency.whatsapp ?? "—"}</dd>
                <dt className="text-xs font-semibold text-[#0A2342]">Ciudad</dt>
                <dd className="text-slate-600">
                  {[agency.city, agency.province].filter(Boolean).join(", ") || "—"}
                </dd>
              </dl>
            )}
          </div>
        </div>

        {/* Logo miniatura */}
        <div>
          <h2 className="text-sm font-semibold text-[#0A2342]">Logo miniatura</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Aparece dentro del pin de cada propiedad de tu agencia en el mapa y en la
            tarjeta resumen, para que el interesado sepa quién publica. Se muestra en un
            círculo chico: usá un isotipo o un símbolo, no el logo completo con texto.
          </p>
          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            <li>· El navegador lo lleva a un cuadrado de 256 px antes de subirlo.</li>
            <li>· Podés partir de PNG, JPG, WebP o SVG; se guarda siempre como PNG.</li>
            <li>· Fondo sólido o transparente. Evitá bordes finos: en 22 px desaparecen.</li>
          </ul>
          <div className="mt-4">
            <AgencyLogoUploader
              slug={agency.slug}
              agencyName={agency.name}
              currentLogoUrl={profile.logoUrl}
              canEdit={canEdit}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
