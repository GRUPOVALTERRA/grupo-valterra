import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { CategoriesSection } from "@/components/home/CategoriesSection";
import { FeaturedProperties } from "@/components/home/FeaturedProperties";
import { StatsSection } from "@/components/home/StatsSection";
import { PlansSection } from "@/components/home/PlansSection";
import { ContactSection } from "@/components/home/ContactSection";
import { CTASection } from "@/components/home/CTASection";

export const metadata = {
  title: "Grupo Valterra · Servicios Inmobiliarios del Litoral",
  description:
    "Propiedades premium en Entre Ríos, Corrientes, Chaco y Misiones. Más de 20 años asesorando familias e inversionistas en el litoral argentino.",
};

export default function HomePage() {
  return (
    <div
      className="bg-white text-[#0a2540]"
      style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
    >
      <Navbar />
      <HeroSection />
      <CategoriesSection />
      <FeaturedProperties />
      <StatsSection />
      <PlansSection />
      <ContactSection />
      <CTASection />
      <Footer />
    </div>
  );
}
