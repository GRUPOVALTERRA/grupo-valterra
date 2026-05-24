import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { getAgencyBySlug, listAgencyMembers } from "@/services/agencies";
import { InviteMemberForm } from "./InviteMemberForm";
import { inviteMemberAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agency - Super-admin - Valterra",
  robots: { index: false, follow: false },
};

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const ctx = await getAdminContext();
  if (!ctx.isSuperAdmin) notFound();

  const { slug } = await params;
  const agency = await getAgencyBySlug(slug);
  if (!agency) notFound();

  const members = await listAgencyMembers(agency.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <header className="flex items-center justify-between border-b border-[#D8D8D8] pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">
            Super-admin · Agency
          </span>
          <h1 className="mt-1 text-2xl font-bold text-[#0A2342]" style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}>
            {agency.name}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            /{agency.slug} · {agency.contact_email ?? "sin email"} · {agency.city ?? "-"} · {agency.province ?? "-"}
          </p>
        </div>
        <Link href="/admin/agencies" className="text-xs font-medium text-[#4A5568] hover:text-[#0A2342]">
          ← Agencies
        </Link>
      </header>

      <section className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="text-sm font-semibold text-[#0A2342]">
            {members.length} {members.length === 1 ? "member" : "members"}
          </h2>
          <ul className="mt-3 divide-y divide-[#D8D8D8] rounded-lg border border-[#D8D8D8] bg-white">
            {members.length === 0 ? (
              <li className="px-4 py-6 text-sm text-slate-500">
                Sin members aun. Invita el primer owner desde el panel derecho.
              </li>
            ) : (
              members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <div className="font-mono text-[11px] text-slate-700">{m.user_id}</div>
                    <div className="text-[11px] text-slate-400">
                      {m.invited_at ? `invitado ${new Date(m.invited_at).toLocaleDateString("es-AR")}` : null}
                      {m.invited_at && m.joined_at ? " · " : null}
                      {m.joined_at ? `joined ${new Date(m.joined_at).toLocaleDateString("es-AR")}` : null}
                    </div>
                  </div>
                  <span className="rounded-full bg-[#0A2342] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                    {m.role}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#0A2342]">Invitar member</h2>
          <InviteMemberForm action={inviteMemberAction} agencySlug={agency.slug} />
        </div>
      </section>
    </div>
  );
}
