/**
 * Mock de leads para el panel /admin/leads.
 * Self-contained: tipos + datos. Cuando se conecte la DB real,
 * reemplazar por leadsService apuntando a Prisma/Postgres.
 */

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "scheduled"
  | "converted"
  | "lost"
  | "archived";

export type LeadSource =
  | "contact-form"
  | "whatsapp"
  | "phone"
  | "email"
  | "referral"
  | "social"
  | "portal";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  propertyTitle?: string;
  propertySlug?: string;
  agentName?: string;
  source: LeadSource;
  status: LeadStatus;
  message: string;
  createdAt: string;
}

export const MOCK_LEADS: Lead[] = [
  {
    id: "LEAD-20260516-A3F2C9",
    name: "Juan Pérez",
    phone: "+54 9 343 511-2233",
    email: "juan.perez@gmail.com",
    propertyTitle: "Casa premium frente al río Paraná",
    propertySlug: "casa-frente-al-rio-parana",
    agentName: "Lucía Bertotti",
    source: "contact-form",
    status: "new",
    message: "Me interesa la propiedad. ¿Cuándo puedo visitarla?",
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: "LEAD-20260516-B4D8E1",
    name: "María González",
    phone: "+54 9 343 622-1144",
    email: "maria.g@hotmail.com",
    propertyTitle: "Departamento moderno en pleno centro",
    propertySlug: "departamento-moderno-centro-parana",
    agentName: "Mariano Esquivel",
    source: "contact-form",
    status: "contacted",
    message: "Quiero coordinar una visita el sábado.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "LEAD-20260516-C5F0A2",
    name: "Carlos Ramírez",
    phone: "+54 9 343 711-9988",
    propertyTitle: "Casa quinta en Villa Urquiza",
    propertySlug: "casa-quinta-villa-urquiza",
    agentName: "Carolina Méndez",
    source: "whatsapp",
    status: "qualified",
    message: "Tenemos crédito aprobado. Estamos listos para ver.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: "LEAD-20260515-D1A4B7",
    name: "Ana Torres",
    phone: "+54 9 343 555-3322",
    email: "ana.torres@yahoo.com",
    propertyTitle: "Loft de diseño en Colón",
    propertySlug: "loft-alquiler-temporal-colon",
    agentName: "Lucía Bertotti",
    source: "contact-form",
    status: "scheduled",
    message: "Confirmo visita martes 17/05 a las 16hs.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: "LEAD-20260515-E7C2F4",
    name: "Federico Sosa",
    phone: "+54 9 343 488-7766",
    email: "fede.sosa@gmail.com",
    propertyTitle: "Terreno de inversión en Oro Verde",
    propertySlug: "terreno-inversion-oro-verde",
    agentName: "Mariano Esquivel",
    source: "phone",
    status: "scheduled",
    message: "Llamada agendada para revisar planos.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
  },
  {
    id: "LEAD-20260514-F9B5C3",
    name: "Valentina Ríos",
    phone: "+54 9 343 222-1199",
    email: "val.rios@outlook.com",
    propertyTitle: "Departamento 2 amb. Santa Fe",
    propertySlug: "departamento-2-amb-santa-fe-capital",
    agentName: "Carolina Méndez",
    source: "referral",
    status: "converted",
    message: "Boleto firmado. ¡Gracias!",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 52).toISOString(),
  },
  {
    id: "LEAD-20260514-G2E8D6",
    name: "Roberto Alvarez",
    phone: "+54 9 343 100-2030",
    email: "ralvarez@empresa.com.ar",
    propertyTitle: "Local comercial peatonal",
    propertySlug: "local-comercial-peatonal-parana",
    agentName: "Mariano Esquivel",
    source: "contact-form",
    status: "converted",
    message: "Listo para firmar el contrato.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 60).toISOString(),
  },
  {
    id: "LEAD-20260513-H4A1B9",
    name: "Sofía Domínguez",
    phone: "+54 9 343 770-4455",
    propertyTitle: "Casa familiar Concepción del Uruguay",
    propertySlug: "casa-familiar-concepcion-uruguay",
    agentName: "Lucía Bertotti",
    source: "social",
    status: "lost",
    message: "Encontré otra propiedad. Gracias por la atención.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 78).toISOString(),
  },
  {
    id: "LEAD-20260513-I8C7E0",
    name: "Diego Fernández",
    phone: "+54 9 343 998-1122",
    email: "diego.fer@gmail.com",
    propertyTitle: "Casa frente a laguna Gualeguaychú",
    propertySlug: "casa-frente-laguna-gualeguaychu",
    agentName: "Carolina Méndez",
    source: "portal",
    status: "lost",
    message: "Fuera de presupuesto.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
  },
  {
    id: "LEAD-20260512-J6D3F2",
    name: "Lucas Benítez",
    phone: "+54 9 343 401-5566",
    email: "lucas.b@gmail.com",
    propertyTitle: "Departamento categoría Rosario",
    propertySlug: "departamento-categoria-rosario-puerto-norte",
    agentName: "Lucía Bertotti",
    source: "contact-form",
    status: "new",
    message: "¿Tiene cochera doble?",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
  },
  {
    id: "LEAD-20260512-K3F9G8",
    name: "Camila Ortiz",
    phone: "+54 9 343 313-7788",
    propertyTitle: "PH 3 ambientes en Concordia",
    propertySlug: "ph-3-ambientes-concordia",
    agentName: "Mariano Esquivel",
    source: "email",
    status: "contacted",
    message: "Pido más fotos del patio.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 132).toISOString(),
  },
  {
    id: "LEAD-20260511-L1H2I3",
    name: "Martín Quiroga",
    phone: "+54 9 343 825-9090",
    email: "mq@empresa.com",
    propertyTitle: "Campo 50ha Victoria",
    propertySlug: "campo-50ha-victoria",
    agentName: "Carolina Méndez",
    source: "referral",
    status: "qualified",
    message: "Quiero ver el campo el próximo viernes.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 168).toISOString(),
  },
];

export interface LeadStats {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  scheduled: number;
  converted: number;
  lost: number;
  archived: number;
}

export function computeStats(leads: Lead[]): LeadStats {
  const stats: LeadStats = {
    total: leads.length,
    new: 0,
    contacted: 0,
    qualified: 0,
    scheduled: 0,
    converted: 0,
    lost: 0,
    archived: 0,
  };
  for (const l of leads) stats[l.status] += 1;
  return stats;
}
