/**
 * Validación pura de inputs de lead. Sin dependencias.
 * Misma fuente de verdad para el servidor (api/contact) y el cliente
 * (ContactSection — opcional, hoy delega 100% al servidor).
 */

export interface LeadInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  propertyTitle?: unknown;
  propertySlug?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  /** Datos saneados (trim) listos para persistir cuando valid===true */
  data: {
    name: string;
    phone: string;
    email?: string;
    message: string;
    propertyTitle?: string;
    propertySlug?: string;
  };
}

const PHONE_REGEX = /^[+()\-\s\d]{8,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function validateLead(input: LeadInput): ValidationResult {
  const errors: Record<string, string> = {};

  const name = asString(input.name).trim();
  if (!name) errors.name = "Ingresá tu nombre";
  else if (name.length < 2) errors.name = "El nombre es muy corto";
  else if (name.length > 100) errors.name = "El nombre es demasiado largo";

  const phone = asString(input.phone).trim();
  if (!phone) errors.phone = "Ingresá un teléfono";
  else if (!PHONE_REGEX.test(phone)) errors.phone = "Formato de teléfono inválido";

  const emailRaw = asString(input.email).trim();
  let email: string | undefined;
  if (emailRaw) {
    if (!EMAIL_REGEX.test(emailRaw) || emailRaw.length > 254) {
      errors.email = "Email inválido";
    } else {
      email = emailRaw;
    }
  }

  const message = asString(input.message).trim();
  if (!message) errors.message = "Escribí tu consulta";
  else if (message.length < 10) errors.message = "Al menos 10 caracteres";
  else if (message.length > 1000) errors.message = "Máximo 1000 caracteres";

  const propertyTitle = asString(input.propertyTitle).trim() || undefined;
  const propertySlug = asString(input.propertySlug).trim() || undefined;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { name, phone, email, message, propertyTitle, propertySlug },
  };
}
