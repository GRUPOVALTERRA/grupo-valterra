import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { MembersSection } from "@/app/admin/leads/MembersSection";
import { OwnerInviteSection } from "@/app/admin/leads/OwnerInviteSection";
import {
  ownerInviteMemberAction,
  updateMemberRoleAction,
  removeMemberAction,
} from "@/app/admin/agencies/actions";
import { listAgencyMembers, type AgencyMemberLite } from "@/services/agencies";

/**
 * /admin/equipo — gestión del equipo de la inmobiliaria (rediseño de nav).
 *
 * Antes estos controles (miembros + invitar) vivían incrustados ARRIBA de la
 * bandeja de consultas en /admin/leads, compitiendo con ella. El brief pide
 * integrarlos al sistema sin que compitan con la navegación principal: ahora
 * son una sección propia, visible en la nav solo para OWNERS.
 *
 * SEGURIDAD: se reutilizan los MISMOS componentes y server actions que ya
 * existían (ownerInviteMemberAction, updateMemberRoleAction,
 * removeMemberAction). Esta página solo cambia DÓNDE se muestran; la
 * autorización real sigue en las actions + RLS.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Equipo - Valterra Admin",
  robots: { index: false, follow: false },
};

export default async function AdminEquipoPage() {
  const ctx = await getAdminContext();
  if (!ctx.scopedAgencyId && !ctx.isSuperAdmin) notFound();

  const isOwner = ctx.memberships.some(
    (m) => m.agencyId === ctx.scopedAgencyId && m.role === "owner",
  );
  const scopeLabel = ctx.scopedAgencyName ?? "Sin agencia";

  // Mismo criterio que tenía /admin/leads: la gestión de equipo es del owner.
  // (El super-admin gestiona inmobiliarias completas desde "Agencias".)
  if (!isOwner) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <h1
          className="text-2xl font-bold text-[#0A2342]"
          style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
        >
          Equipo
        </h1>
        <p className="mt-3 text-sm text-[#4A5568]">
          La gestión del equipo está disponible solo para la persona propietaria
          de la inmobiliaria.
          {ctx.isSuperAdmin && (
            <>
              {" "}
              Como super-admin podés administrar cada inmobiliaria desde{" "}
              <Link
                href="/admin/agencies"
                className="font-semibold text-[#0A2342] underline-offset-2 hover:underline"
              >
                Agencias
              </Link>
              .
            </>
          )}
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-flex h-9 items-center rounded-md border border-[#D8D8D8] bg-white px-3 text-xs font-semibold text-[#0A2342] hover:bg-[#F8F7F4]"
        >
          ← Volver al Panel
        </Link>
      </main>
    );
  }

  let members: AgencyMemberLite[] = [];
  if (ctx.scopedAgencyId) {
    try {
      members = await listAgencyMembers(ctx.scopedAgencyId);
    } catch {
      // non-blocking: la sección de miembros muestra vacío
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <header>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
          {scopeLabel}
        </span>
        <h1
          className="mt-1 text-2xl font-bold text-[#0A2342]"
          style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}
        >
          Equipo
        </h1>
        <p className="mt-1 text-sm text-[#4A5568]">
          Las personas que pueden entrar a este panel, y con qué permisos.
        </p>
      </header>

      <div className="mt-6 space-y-6">
        <MembersSection
          members={members}
          currentUserId={ctx.userId}
          updateAction={updateMemberRoleAction}
          removeAction={removeMemberAction}
        />

        <OwnerInviteSection action={ownerInviteMemberAction} agencyName={scopeLabel} />
      </div>
    </main>
  );
}
