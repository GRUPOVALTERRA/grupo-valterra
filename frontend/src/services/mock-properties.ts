export type PropertyOperation = "venta" | "alquiler" | "alquiler-temporal";
export type PropertyType =
  | "casa"
  | "departamento"
  | "ph"
  | "terreno"
  | "local"
  | "oficina"
  | "campo"
  | "country";

export interface Property {
  id: string;
  slug: string;
  title: string;
  city: string;
  neighborhood?: string;
  province: string;
  price: number;
  currency: "USD" | "ARS";
  perMonth?: boolean;
  operation: PropertyOperation;
  type: PropertyType;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  coveredArea?: number;
  totalArea?: number;
  badges?: string[];
  image: string;
  featured?: boolean;
  /** Asignacion - opcional - usado en pagina de detalle */
  agentName?: string;
  agentPhone?: string;
  /** Multi-tenant ownership - usado en admin scoping desde Sprint 10 MF5 */
  agencyId?: string;
  /** Geo - opcional - activado en Sprint 11 (mapa Mapbox) */
  lat?: number;
  lng?: number;
}

export const MOCK_PROPERTIES: Property[] = [
  {
    id: "prop-001",
    slug: "casa-frente-rio-parana",
    title: "Casa premium frente al rio Parana",
    city: "Parana",
    neighborhood: "Costa del Parana",
    province: "Entre Rios",
    price: 485000,
    currency: "USD",
    operation: "venta",
    type: "casa",
    bedrooms: 4,
    bathrooms: 3,
    parking: 2,
    coveredArea: 320,
    totalArea: 850,
    badges: ["Destacado", "Frente al rio"],
    image:
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80&auto=format&fit=crop",
    featured: true,
  },
  {
    id: "prop-002",
    slug: "depto-moderno-centro-parana",
    title: "Departamento moderno con balcon",
    city: "Parana",
    neighborhood: "Centro",
    province: "Entre Rios",
    price: 165000,
    currency: "USD",
    operation: "venta",
    type: "departamento",
    bedrooms: 2,
    bathrooms: 2,
    parking: 1,
    coveredArea: 78,
    badges: ["Nuevo"],
    image:
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80&auto=format&fit=crop",
    featured: true,
  },
  {
    id: "prop-003",
    slug: "casa-quinta-villa-urquiza",
    title: "Casa quinta con pileta",
    city: "Villa Urquiza",
    province: "Entre Rios",
    price: 298000,
    currency: "USD",
    operation: "venta",
    type: "casa",
    bedrooms: 3,
    bathrooms: 2,
    parking: 3,
    coveredArea: 210,
    totalArea: 1200,
    badges: ["Pileta", "Parrilla"],
    image:
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80&auto=format&fit=crop",
    featured: true,
  },
  {
    id: "prop-004",
    slug: "country-corrientes",
    title: "Casa en country La Esperanza",
    city: "Corrientes",
    neighborhood: "La Esperanza",
    province: "Corrientes",
    price: 380000,
    currency: "USD",
    operation: "venta",
    type: "country",
    bedrooms: 4,
    bathrooms: 4,
    parking: 2,
    coveredArea: 280,
    totalArea: 1000,
    badges: ["Barrio cerrado", "Seguridad 24hs"],
    image:
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80&auto=format&fit=crop",
    featured: true,
  },
  {
    id: "prop-005",
    slug: "depto-resistencia",
    title: "Departamento de categoria",
    city: "Resistencia",
    neighborhood: "Centro",
    province: "Chaco",
    price: 195000,
    currency: "USD",
    operation: "venta",
    type: "departamento",
    bedrooms: 3,
    bathrooms: 2,
    parking: 1,
    coveredArea: 110,
    badges: ["A estrenar"],
    image:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80&auto=format&fit=crop",
    featured: true,
  },
  {
    id: "prop-006",
    slug: "casa-posadas-frente-rio",
    title: "Residencia frente al rio Parana",
    city: "Posadas",
    neighborhood: "Costanera",
    province: "Misiones",
    price: 520000,
    currency: "USD",
    operation: "venta",
    type: "casa",
    bedrooms: 5,
    bathrooms: 4,
    parking: 3,
    coveredArea: 380,
    totalArea: 1500,
    badges: ["Premium", "Frente al rio"],
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&auto=format&fit=crop",
    featured: true,
  },
];

export function getFeaturedProperties(limit = 6): Property[] {
  return MOCK_PROPERTIES.filter((p) => p.featured).slice(0, limit);
}

export function formatPrice(amount: number, currency: "USD" | "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
