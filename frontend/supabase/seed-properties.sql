-- ==========================================================
-- Seed inicial: 6 propiedades de muestra (mismas que mock-properties.ts)
-- Idempotente: on conflict (slug) do nothing
-- ==========================================================

insert into public.properties (
  id, slug, title, description,
  price, currency, per_month, operation_type, property_type,
  city, neighborhood, province, country,
  bedrooms, bathrooms, parking, covered_area_m2, total_area_m2,
  badges, cover_image,
  agent_name, agent_phone,
  published, featured, featured_order
)
values
  (
    'prop-001', 'casa-frente-rio-parana',
    'Casa premium frente al río Paraná',
    'Residencia de lujo con vista directa al río Paraná. Diseño contemporáneo, amplios espacios y entorno único en el litoral argentino.',
    485000, 'USD', false, 'venta', 'casa',
    'Paraná', 'Costa del Paraná', 'Entre Ríos', 'AR',
    4, 3, 2, 320, 850,
    array['Destacado','Frente al río'],
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80&auto=format&fit=crop',
    'Equipo Valterra', '+54 9 379 515-9096',
    true, true, 1
  ),
  (
    'prop-002', 'depto-moderno-centro-parana',
    'Departamento moderno con balcón',
    'Departamento a estrenar en el corazón de Paraná. Diseño funcional, terminaciones premium y excelente ubicación.',
    165000, 'USD', false, 'venta', 'departamento',
    'Paraná', 'Centro', 'Entre Ríos', 'AR',
    2, 2, 1, 78, null,
    array['Nuevo'],
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80&auto=format&fit=crop',
    'Equipo Valterra', '+54 9 379 515-9096',
    true, true, 2
  ),
  (
    'prop-003', 'casa-quinta-villa-urquiza',
    'Casa quinta con pileta',
    'Casa quinta familiar en Villa Urquiza. Amplio parque, pileta, parrilla y comodidades para disfrutar todo el año.',
    298000, 'USD', false, 'venta', 'casa',
    'Villa Urquiza', null, 'Entre Ríos', 'AR',
    3, 2, 3, 210, 1200,
    array['Pileta','Parrilla'],
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80&auto=format&fit=crop',
    'Equipo Valterra', '+54 9 379 515-9096',
    true, true, 3
  ),
  (
    'prop-004', 'country-corrientes',
    'Casa en country La Esperanza',
    'Residencia en barrio cerrado La Esperanza. Seguridad 24hs, amenities exclusivos y construcción de alta categoría.',
    380000, 'USD', false, 'venta', 'country',
    'Corrientes', 'La Esperanza', 'Corrientes', 'AR',
    4, 4, 2, 280, 1000,
    array['Barrio cerrado','Seguridad 24hs'],
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80&auto=format&fit=crop',
    'Equipo Valterra', '+54 9 379 515-9096',
    true, true, 4
  ),
  (
    'prop-005', 'depto-resistencia',
    'Departamento de categoría',
    'Departamento a estrenar en el centro de Resistencia. Vista panorámica y terminaciones de primera línea.',
    195000, 'USD', false, 'venta', 'departamento',
    'Resistencia', 'Centro', 'Chaco', 'AR',
    3, 2, 1, 110, null,
    array['A estrenar'],
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80&auto=format&fit=crop',
    'Equipo Valterra', '+54 9 379 515-9096',
    true, true, 5
  ),
  (
    'prop-006', 'casa-posadas-frente-rio',
    'Residencia frente al río Paraná',
    'Residencia premium en la costanera de Posadas. Diseño exclusivo, vista al río y máxima calidad constructiva.',
    520000, 'USD', false, 'venta', 'casa',
    'Posadas', 'Costanera', 'Misiones', 'AR',
    5, 4, 3, 380, 1500,
    array['Premium','Frente al río'],
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&auto=format&fit=crop',
    'Equipo Valterra', '+54 9 379 515-9096',
    true, true, 6
  )
on conflict (slug) do nothing;
