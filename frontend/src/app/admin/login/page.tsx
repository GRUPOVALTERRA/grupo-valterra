import { LoginForm } from "./LoginForm";
import { loginAction } from "./actions";

export const metadata = {
  title: "Admin · Login · Valterra",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[#0a2540] p-4"
      style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0a2540] font-semibold text-[#c9a86a]">
            V
          </span>
          <div className="leading-tight">
            <div className="text-base font-semibold text-[#0a2540]">VALTERRA · Admin</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#c9a86a]">
              Acceso restringido
            </div>
          </div>
        </div>

        <h1 className="mt-6 text-2xl font-semibold text-[#0a2540]">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ingresá la contraseña de administrador para acceder al panel.
        </p>

        <LoginForm
          action={loginAction}
          nextPath={sp.next ?? "/admin/leads"}
          initialError={sp.error}
        />

        <p className="mt-6 text-center text-[11px] text-slate-400">
          ¿Olvidaste la contraseña? Contactar al administrador del sistema.
        </p>
      </div>
    </div>
  );
}
