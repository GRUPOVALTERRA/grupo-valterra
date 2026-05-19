import type { Metadata } from "next";
import { Inter, Montserrat, Playfair_Display } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const SITE = {
  name: "Grupo Valterra",
  fullName: "Grupo Valterra · Soluciones Inmobiliarias del Litoral",
  description:
    "Soluciones Inmobiliarias del Litoral. Compra, venta, alquiler e inversión de propiedades premium en Entre Ríos, Corrientes, Chaco y Misiones. Patrimonio, confianza y futuro.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "es_AR",
  ogImage: "/brand/logo-principal.svg",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.fullName,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [
    "inmobiliaria",
    "litoral argentino",
    "propiedades premium",
    "Corrientes",
    "Paraná",
    "Posadas",
    "Resistencia",
    "Entre Ríos",
    "Chaco",
    "Misiones",
    "venta",
    "alquiler",
    "inversión inmobiliaria",
    "Valterra",
  ],
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  publisher: SITE.name,
  applicationName: SITE.name,
  category: "real estate",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.fullName,
    description: SITE.description,
    images: [
      {
        url: SITE.ogImage,
        width: 1200,
        height: 320,
        alt: SITE.fullName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.fullName,
    description: SITE.description,
    images: [SITE.ogImage],
  },
  icons: {
    icon: [{ url: "/brand/isotipo-vt.svg", type: "image/svg+xml" }],
    apple: "/brand/isotipo-vt.svg",
    shortcut: "/brand/isotipo-vt.svg",
  },
  alternates: {
    canonical: SITE.url,
  },
  other: {
    "theme-color": "#0A2342",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await headers(); // mantiene x-pathname para middleware
  return (
    <html
      lang="es-AR"
      className={`${inter.variable} ${montserrat.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
