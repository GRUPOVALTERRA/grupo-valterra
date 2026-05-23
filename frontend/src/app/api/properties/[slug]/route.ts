import { NextResponse, type NextRequest } from "next/server";
import { getPropertyBySlug } from "@/services/properties";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/properties/[slug]
 *
 * Devuelve la propiedad publicada por slug, o 404 si no existe.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ ok: false, error: "missing-slug" }, { status: 400 });
  }

  const item = await getPropertyBySlug(slug);
  if (!item) {
    return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item });
}
