import Image from "next/image";
import { LoginForm } from "./LoginForm";
import { loginAction, requestMagicLink } from "./actions";

export const metadata = {
  title: "Admin - Login - Valterra",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A2342] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/isotipo-vt.svg"
            alt="Grupo Valterra"
            width={44}
            height={44}
            priority
            className="rounded-lg"
          />
          <div className="leading-tight">
            <div className="text-base font-extrabold tracking-[0.04em] text-[#0A2342]" style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}>
              GRUPO VALTERRA - ADMIN
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#C9A86A]">
              Acceso restringido
            </div>
          </div>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-[#0A2342]" style={{ fontFamily: "var(--font-montserrat), Inter, sans-serif" }}>
          Iniciar sesion
        </h1>
        <p className="mt-1 text-sm text-[#4A5568]">
          Elegi tu metodo de acceso.
        </p>

        <LoginForm
          legacyAction={loginAction}
          magicAction={requestMagicLink}
          nextPath={sp.next ?? "/admin/leads"}
          initialError={sp.error}
        />

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Sprint 10 MF3 - magic link + legacy super-admin coexisten.
        </p>
      </div>
    </div>
  );
}
