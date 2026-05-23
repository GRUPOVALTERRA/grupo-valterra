import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function PropertyNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#0A2342]">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-4 pt-24">
        <div className="max-w-md text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C9A86A]">404</span>
          <h1 className="mt-3 text-3xl font-bold">Propiedad no disponible</h1>
          <p className="mt-3 text-sm text-slate-600">
            La propiedad que buscás ya no está publicada o el enlace cambió. Mirá nuestra selección actual.
          </p>
          <Link
            href="/#propiedades"
            className="mt-6 inline-flex h-11 items-center rounded-lg bg-[#0A2342] px-6 text-sm font-bold text-white hover:bg-[#071A32]"
          >
            Ver propiedades destacadas
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
