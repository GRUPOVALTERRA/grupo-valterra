import type { MetadataRoute } from "next";
import { getAllProperties } from "@/services/properties";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      priority: 1.0,
      changeFrequency: "weekly",
    },
    {
      url: `${SITE_URL}/propiedades`,
      priority: 0.9,
      changeFrequency: "daily",
    },
  ];

  let propertyRoutes: MetadataRoute.Sitemap = [];

  try {
    const properties = await getAllProperties();
    propertyRoutes = properties.map((p) => ({
      url: `${SITE_URL}/propiedades/${p.slug}`,
      priority: 0.8,
      changeFrequency: "weekly" as const,
    }));
  } catch {
    // getAllProperties falló — devolver solo rutas estáticas
  }

  return [...staticRoutes, ...propertyRoutes];
}
