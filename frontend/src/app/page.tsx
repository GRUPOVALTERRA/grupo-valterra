import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { CategoriesSection } from "@/components/home/CategoriesSection";
import { FeaturedProperties } from "@/components/home/FeaturedProperties";
import { StatsSection } from "@/components/home/StatsSection";
import { PlansSection } from "@/components/home/PlansSection";
import { ContactSection } from "@/components/home/ContactSection";
import { CTASection } from "@/components/home/CTASection";
import { getFeaturedProperties } from "@/services/properties";

export const metadata = {
  title: "Grupo Valterra · Soluciones Inmobiliarias del Litoral",
  description:
    "Propiedades premium en Entre Ríos, Corrientes, Chaco y Misiones. Más de 20 años asesorando familias e inversionistas en el litoral argentino.",
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
      <StatsSection />
      <PlansSection />
      <ContactSection />
      <CTASection />
      <Footer />
    </div>
  );
}
