import Link from "next/link";
import { confirmMagicLink } from "./actions";
import { isAllowedOtpType, sanitizeNext } from "@/lib/auth-confirm";

/**
 * /auth/confirm — página intermedia del flujo token_hash (Sprint 13 · C1).
 *
 * VARIANTE B (anti-prefetch): el GET NO verifica el token. Solo muestra un botón
 * "Ingresar" que dispara un POST (server action confirmMagicLink). Los escáneres
 * de email hacen GET, no POST → no consumen el token de un solo uso.
 *
 * A diferencia de PKCE, este flujo NO depende de la cookie code_verifier del
 * navegador de origen → el link funciona en cualquier navegador/dispositivo.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Confirmar ingreso - Grupo Valterra",
  robots: { index: false, follow: false },
};

const NAVY = "#0A2342";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const tokenHash = sp.token_hash ?? "";
  const type = sp.type ?? "";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://grupo-valterra.vercel.app";
  const origin = siteUrl.replace(/\/$/, "");
  const safeNext = sanitizeNext(sp.next, origin);

  const paramsValid = Boolean(tokenHash) && isAllowedOtpType(type);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A2342] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-sm font-extrabold"
            style={{ background: "#C9A86A", color: NAVY }}
          >
            VT
          </span>
          <div className="leading-tight">
            <div className="text-base font-extrabold tracking-[0.04em] text-[#0A2342]">
              GRUPO VALTERRA - ADMIN
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#C9A86A]">
              Acceso restringido
            </div>
          </div>
        </div>

        {paramsValid ? (
          <>
            <h1 className="mt-6 text-2xl font-bold text-[#0A2342]">Confirmá tu ingreso</h1>
            <p className="mt-1 text-sm text-[#4A5568]">
              Por seguridad, tu sesión se inicia recién cuando tocás el botón. El link es de un
              solo uso.
            </p>

            {/* POST-only: el GET (prefetch/escáner) no verifica ni consume el token. */}
            <form action={confirmMagicLink} className="mt-6 space-y-4">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={safeNext} />
              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0A2342] text-sm font-bold text-white transition-all hover:bg-[#071A32]"
              >
                Ingresar
              </button>
            </form>

            <p className="mt-4 text-[11px] text-slate-500">
              Podés abrir este link en cualquier dispositivo. No necesitás contraseña.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-bold text-[#0A2342]">Link inválido o incompleto</h1>
            <p className="mt-1 text-sm text-[#4A5568]">
              El link de acceso no es válido o le faltan datos. Solicitá uno nuevo desde el login.
            </p>
            <Link
              href="/admin/login"
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0A2342] text-sm font-bold text-white transition-all hover:bg-[#071A32]"
            >
              Ir al login
            </Link>
          </>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Grupo Valterra · Acceso seguro
        </p>
      </div>
    </div>
  );
}
