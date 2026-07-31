import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { CategoriesSection } from "@/components/home/CategoriesSection";
import { FeaturedProperties } from "@/components/home/FeaturedProperties";
import { ContactSection } from "@/components/home/ContactSection";
import { CTASection } from "@/components/home/CTASection";
import { getFeaturedProperties } from "@/services/properties";

export const metadata = {
  title: "Grupo Valterra · Soluciones Inmobiliarias del Litoral",
  description:
    "Propiedades premium en Entre Ríos, Corrientes, Chaco y Misiones. Asesoramiento personalizado para familias e inversionistas del litoral argentino.",
};

// ISR: la home se regenera cada 60s al sumar / despublicar propiedades.
// TTFB estable, contenido fresco sin force-dynamic.
export const revalidate = 60;

export default async function HomePage() {
  const featured = await getFeaturedProperties(6);

  return (
    <div
      className="bg-white text-[#0A2342]"
      style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
    >
      <Navbar />
      <HeroSection />
      <CategoriesSection />
      <FeaturedProperties properties={featured} />
      {/*
        Sprint 14-B — StatsSection y PlansSection quedan fuera del render público.
        StatsSection publicaba métricas no acreditadas (1.200+ propiedades,
        8.500+ familias, 98% satisfacción, 20+ años) y PlansSection precios cuyos
        botones no tienen efecto ni cobro detrás. Los componentes se conservan en
        el repo para reponerlos cuando existan datos comerciales confirmados.
      */}
      <ContactSection />
      <CTASection />
      <Footer />
    </div>
  );
}
