-- Seeds opcionales para tener data inicial en el panel.
-- Idempotente: usa on conflict do nothing por id.

insert into public.leads (id, created_at, name, phone, email, message, property_title, property_slug, agent_name, source, status)
values
  ('LEAD-SEED-A3F2C9', now() - interval '18 minutes',
   'Juan Pérez', '+54 9 343 511-2233', 'juan.perez@gmail.com',
   'Me interesa la propiedad. ¿Cuándo puedo visitarla?',
   'Casa premium frente al río Paraná', 'casa-frente-al-rio-parana',
   'Lucía Bertotti', 'contact-form', 'new'),
  ('LEAD-SEED-B4D8E1', now() - interval '3 hours',
   'María González', '+54 9 343 622-1144', 'maria.g@hotmail.com',
   'Quiero coordinar una visita el sábado.',
   'Departamento moderno en pleno centro', 'departamento-moderno-centro-parana',
   'Mariano Esquivel', 'contact-form', 'contacted'),
  ('LEAD-SEED-C5F0A2', now() - interval '8 hours',
   'Carlos Ramírez', '+54 9 343 711-9988', null,
   'Tenemos crédito aprobado. Estamos listos para ver.',
   'Casa quinta en Villa Urquiza', 'casa-quinta-villa-urquiza',
   'Carolina Méndez', 'whatsapp', 'qualified'),
  ('LEAD-SEED-D1A4B7', now() - interval '26 hours',
   'Ana Torres', '+54 9 343 555-3322', 'ana.torres@yahoo.com',
   'Confirmo visita martes 17/05 a las 16hs.',
   'Loft de diseño en Colón', 'loft-alquiler-temporal-colon',
   'Lucía Bertotti', 'contact-form', 'scheduled'),
  ('LEAD-SEED-F9B5C3', now() - interval '52 hours',
   'Valentina Ríos', '+54 9 343 222-1199', 'val.rios@outlook.com',
   'Boleto firmado. ¡Gracias!',
   'Departamento 2 amb. Santa Fe', 'departamento-2-amb-santa-fe-capital',
   'Carolina Méndez', 'referral', 'converted'),
  ('LEAD-SEED-H4A1B9', now() - interval '78 hours',
   'Sofía Domínguez', '+54 9 343 770-4455', null,
   'Encontré otra propiedad. Gracias por la atención.',
   'Casa familiar Concepción del Uruguay', 'casa-familiar-concepcion-uruguay',
   'Lucía Bertotti', 'social', 'lost')
on conflict (id) do nothing;
