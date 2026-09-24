/**
 * S28 PR-A — intake manual de consultas por WhatsApp.
 *
 * Módulo PURO (sin DOM, sin Supabase, sin Next): todo lo que decide cómo se
 * normaliza una consulta cargada a mano vive acá, para que las guardas lo
 * prueben sin levantar nada.
 *
 * Principio UX del brief: "registrar primero, enriquecer después". Nada de
 * acá bloquea el alta salvo lo que la base rechazaría igual (CHECKs de
 * `leads`: name 2..100, phone 8..20, message 10..1000).
 *
 * Campaign ref: NO hay columna en `leads` todavía. Se guarda como última
 * línea del `message` con la forma `Ref: GV-…` y se extrae con
 * `extractCampaignRef`. Cuando exista la columna (migración propuesta 0021),
 * el mismo parser sirve para el backfill y para el auto-detect futuro.
 */

import type { LeadSource, LeadStatus } from "@/services/mock-leads";

// ============================================================
// Campaign ref — estándar DEC-01 (LOOP/ESTANDAR_CAMPAIGN_REF.md)
// ============================================================

/** `GV-<PERIODO>-<CREATIVO>[-<FINALIDAD>]`, mayúsculas, A-Z 0-9 y guiones. */
export const CAMPAIGN_REF_RE = /^GV-[A-Z0-9]{2,6}-[A-Z0-9]{2,12}(?:-[A-Z0-9]{2,12})?$/;
const CAMPAIGN_REF_MAX = 32;
/** Prefijo que el operador puede pegar tal cual desde WhatsApp. */
const REF_PREFIX_RE = /^(?:ref(?:erencia)?\s*[:=\-]?\s*)/i;
/** Última línea `Ref: <código>` dentro del mensaje guardado. */
const REF_LINE_RE = /(?:^|\n)Ref:\s*(GV-[A-Z0-9-]+)\s*$/;

/**
 * Acepta `GV-W36-COLO-XL`, `ref: gv-w36-colo-xl`, `Ref GV-W36-COLO-XL `.
 * Devuelve el código canónico o null si no tiene forma válida. Nunca inventa.
 */
export function normalizeCampaignRef(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().replace(REF_PREFIX_RE, "").trim();
  if (!value) return null;
  value = value.replace(/[_\s]+/g, "-").replace(/-+/g, "-").toUpperCase();
  if (value.length > CAMPAIGN_REF_MAX) return null;
  return CAMPAIGN_REF_RE.test(value) ? value : null;
}

/** Lee la ref guardada como última línea del mensaje (o null). */
export function extractCampaignRef(message: string | null | undefined): string | null {
  if (!message) return null;
  const m = REF_LINE_RE.exec(message);
  return m ? normalizeCampaignRef(m[1]) : null;
}

// ============================================================
// Teléfono argentino — normalización best-effort, nunca inventa
// ============================================================

export interface NormalizedPhone {
  /** Lo que se guarda en `leads.phone`. */
  stored: string;
  /** Dígitos aptos para wa.me (549 + área + número) o null si no se pudo. */
  waDigits: string | null;
  /** true si `stored` es la forma canónica `+549…`. */
  canonical: boolean;
}

const PHONE_STORED_MIN = 8;
const PHONE_STORED_MAX = 20;

/**
 * Casos que resuelve (todos → `+5493794123456`):
 *  `+54 9 379 412-3456` · `549379412 3456` · `54 379 4123456` (sin 9) ·
 *  `0379 15 412 3456` (área con 0 + 15 celular) · `379 412 3456` · `3794123456`.
 * Si no está seguro, guarda el texto tal cual (recortado a 20) y `waDigits`
 * = null. No modifica números existentes: esto solo corre en el alta.
 */
export function normalizeArPhone(raw: unknown): NormalizedPhone | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let d = trimmed.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9") && d.length >= 11) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  // Formato local "área + 15 + número": 379 15 4123456 → 379 4123456
  if (d.length === 12 && /^\d{2,4}15\d{6,8}$/.test(d)) {
    for (const areaLen of [2, 3, 4]) {
      if (d.slice(areaLen, areaLen + 2) === "15" && d.length - areaLen - 2 >= 6) {
        d = d.slice(0, areaLen) + d.slice(areaLen + 2);
        break;
      }
    }
  }
  // Un celular argentino sin prefijo: área (2-4) + número (6-8) = 10 dígitos.
  if (d.length === 10) {
    return { stored: `+549${d}`, waDigits: `549${d}`, canonical: true };
  }
  const fallback = trimmed.slice(0, PHONE_STORED_MAX);
  if (fallback.length < PHONE_STORED_MIN) return null;
  return { stored: fallback, waDigits: null, canonical: false };
}

// ============================================================
// Origen y pipeline — SOLO valores que la base ya acepta (0001)
// ============================================================

/** Orígenes que tienen sentido para un alta manual. Mismo CHECK de `leads.source`. */
export const INTAKE_SOURCES = ["whatsapp", "phone", "email", "social", "referral", "portal"] as const satisfies readonly LeadSource[];
export const INTAKE_SOURCE_LABEL: Record<(typeof INTAKE_SOURCES)[number], string> = {
  whatsapp: "WhatsApp",
  phone: "Llamada",
  email: "Email",
  social: "Redes (IG/FB/TikTok)",
  referral: "Referido",
  portal: "Otro portal",
};
export const DEFAULT_INTAKE_SOURCE: LeadSource = "whatsapp";

/**
 * Pipeline sobre los 7 estados EXISTENTES en `leads_status_check`.
 * El orden es el del embudo; `archived` queda fuera del embudo (limpieza).
 */
export const LEAD_PIPELINE: readonly LeadStatus[] = [
  "new", "contacted", "qualified", "scheduled", "converted", "lost", "archived",
] as const;
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nueva",
  contacted: "Contactada",
  qualified: "Calificada",
  scheduled: "Visita",
  converted: "Ganada",
  lost: "Descartada",
  archived: "Archivada",
};
export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_PIPELINE as readonly string[]).includes(v);
}
function isIntakeSource(v: unknown): v is (typeof INTAKE_SOURCES)[number] {
  return typeof v === "string" && (INTAKE_SOURCES as readonly string[]).includes(v);
}

// ============================================================
// Validación del alta
// ============================================================

export const NAME_FALLBACK = "Sin nombre";
export const NOTE_FALLBACK = "Consulta recibida por WhatsApp.";
const NAME_MAX = 100;
const NOTE_MAX = 900; // deja margen para la línea Ref dentro de los 1000 del CHECK
const SLUG_RE = /^[a-zA-Z0-9_-]{1,120}$/;

export interface IntakeInput {
  name?: unknown;
  phone?: unknown;
  propertySlug?: unknown;
  source?: unknown;
  campaignRef?: unknown;
  note?: unknown;
}

export interface IntakeData {
  name: string;
  phone: NormalizedPhone;
  propertySlug: string | null;
  source: LeadSource;
  campaignRef: string | null;
  /** Mensaje final a guardar (nota + línea Ref). */
  message: string;
}

export type IntakeError = "telefono-faltante" | "ref-invalida" | "source-invalida" | "propiedad-invalida";
export type IntakeValidation = { ok: true; data: IntakeData } | { ok: false; error: IntakeError };

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max) : "";
}

export function buildIntakeMessage(note: string, campaignRef: string | null): string {
  const base = note.length >= 10 ? note : `${note ? note + " — " : ""}${NOTE_FALLBACK}`;
  return campaignRef ? `${base}\nRef: ${campaignRef}` : base;
}

export function validateIntake(input: IntakeInput): IntakeValidation {
  const phone = normalizeArPhone(input.phone);
  if (!phone) return { ok: false, error: "telefono-faltante" };

  const rawRef = typeof input.campaignRef === "string" ? input.campaignRef.trim() : "";
  const campaignRef = rawRef ? normalizeCampaignRef(rawRef) : null;
  if (rawRef && !campaignRef) return { ok: false, error: "ref-invalida" };

  const source = input.source === undefined || input.source === null || input.source === ""
    ? DEFAULT_INTAKE_SOURCE
    : input.source;
  if (!isIntakeSource(source)) return { ok: false, error: "source-invalida" };

  const slugRaw = text(input.propertySlug, 120);
  if (slugRaw && !SLUG_RE.test(slugRaw)) return { ok: false, error: "propiedad-invalida" };

  const nameRaw = text(input.name, NAME_MAX);
  const name = nameRaw.length >= 2 ? nameRaw : NAME_FALLBACK;

  const note = text(input.note, NOTE_MAX);
  return {
    ok: true,
    data: {
      name,
      phone,
      propertySlug: slugRaw || null,
      source,
      campaignRef,
      message: buildIntakeMessage(note, campaignRef),
    },
  };
}

export const INTAKE_ERROR_MESSAGES: Record<IntakeError, string> = {
  "telefono-faltante": "Falta el teléfono (mínimo 8 caracteres).",
  "ref-invalida": "La referencia no tiene forma GV-XXX-XXX. Podés dejarla vacía y agregarla después.",
  "source-invalida": "Origen no válido.",
  "propiedad-invalida": "La propiedad elegida no es válida.",
};
