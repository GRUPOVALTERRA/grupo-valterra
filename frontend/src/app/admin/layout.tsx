import { headers } from "next/headers";
import { getAdminContext } from "@/lib/admin-context";
import { AdminHeader, type AdminNavItem } from "@/components/admin/nav/AdminHeader";

/**
 * Layout compartido de /admin — rediseño de navegación (brief UX 27/08/2026).
 *
 * Único lugar donde vive el header persistente del panel: las páginas ya no
 * duplican barras propias. El layout resuelve server-side (getAdminContext)
 * QUÉ secciones mostrar según el rol; la autorización real sigue en
 * middleware + server actions + RLS (la UI no autoriza, solo muestra).
 *
 * /admin/login se excluye del header (x-pathname viene del middleware):
 * la pantalla de login no debe ofrecer navegación interna.
 */

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";

  // Login (y cualquier estado sin sesión resoluble): sin header de panel.
  if (pathname.startsWith("/admin/login")) {
    return <>{children}</>;
  }

  const ctx = await getAdminContext();
  const hasPanelAccess = Boolean(ctx.scopedAgencyId || ctx.isSuperAdmin || ctx.userId);
  if (!hasPanelAccess) {
    // El middleware ya redirige a /admin/login; esto solo evita renderizar
    // un header vacío en estados intermedios.
    return <>{children}</>;
  }

  const isOwner = ctx.memberships.some(
    (m) => m.agencyId === ctx.scopedAgencyId && m.role === "owner",
  );

  // Nav principal — nombres en castellano de cara al usuario (el brief manda:
  // nada de Dashboard/Leads/Back visibles; las URLs internas quedan).
  const items: AdminNavItem[] = [
    { href: "/admin", label: "Panel", exact: true },
    { href: "/admin/properties", label: "Propiedades" },
    { href: "/admin/leads", label: "Consultas" },
    { href: "/admin/estadisticas", label: "Estadísticas" },
  ];
  if (isOwner) items.push({ href: "/admin/equipo", label: "Equipo" });
  if (ctx.isSuperAdmin) items.push({ href: "/admin/agencies", label: "Agencias" });

  const scopeLabel = ctx.scopedAgencyName ?? "Sin agencia";
  const userLabel = ctx.isSuperAdmin
    ? `Super-admin${ctx.userEmail ? ` · ${ctx.userEmail}` : ""}`
    : ctx.userEmail ?? "Sesión activa";

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F7F4]/40 text-[#0A2342]">
      <AdminHeader items={items} scopeLabel={scopeLabel} userLabel={userLabel} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
