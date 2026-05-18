# Supabase setup · Grupo Valterra

Migración de leads de memoria → Postgres real.

## 1. Crear proyecto Supabase

1. https://supabase.com → New project
2. Region: South America (São Paulo)
3. Guardar la `Project URL` y la `service_role key` (Settings → API)

## 2. Aplicar la migración SQL

**Opción A — Supabase Studio (más rápido):**
- Abrir SQL Editor → New query
- Pegar contenido de `supabase/migrations/0001_create_leads.sql` → Run
- (Opcional) Pegar `supabase/seed.sql` para tener leads de demo

**Opción B — Supabase CLI:**
```bash
npm i -g supabase
supabase link --project-ref <ref>
supabase db push
psql "$(supabase db url)" -f supabase/seed.sql   # opcional
```

## 3. Variables de entorno

```bash
cd frontend
cp .env.example .env.local
# editar .env.local con valores reales:
#   SUPABASE_URL=https://xxxxx.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

⚠ `SUPABASE_SERVICE_ROLE_KEY` es secreta. Nunca commitearla, nunca exponerla al cliente.

## 4. QA del sprint

```bash
npm install
npm run build       # debe pasar
npm run dev

# 1) http://localhost:3000  →  enviar consulta desde ContactSection
# 2) http://localhost:3000/admin/leads  →  el lead aparece arriba
# 3) Ctrl+C el dev server, npm run dev de nuevo
# 4) http://localhost:3000/admin/leads  →  el lead sigue estando ✓ persistencia
```

Si `.env.local` no está, el service cae automático al store en memoria (warning en consola). Útil para CI o devs sin Supabase.

## 5. Estructura de la tabla `leads`

| Columna           | Tipo         | Nota                                      |
|-------------------|--------------|-------------------------------------------|
| id                | text PK      | `LEAD-YYYYMMDD-XXXXXX`                    |
| created_at        | timestamptz  | default now()                             |
| updated_at        | timestamptz  | trigger auto-update                       |
| name              | text         | 2-100 chars                               |
| phone             | text         | 8-20 chars                                |
| email             | text         | nullable                                  |
| message           | text         | 10-1000 chars                             |
| property_slug     | text         | nullable                                  |
| property_title    | text         | nullable                                  |
| agent_name        | text         | nullable (denormalizado para UI)          |
| source            | text         | check: 7 valores                          |
| status            | text         | check: 7 valores                          |
| inmobiliaria_id   | uuid         | nullable, FK futura                       |
| agent_id          | uuid         | nullable, FK futura                       |

Índices: `created_at desc`, `status`, `source`, `inmobiliaria_id`.
RLS habilitado, sin policies permisivas → sólo `SERVICE_ROLE_KEY` puede leer/escribir.

## 6. Multi-inmobiliaria (próximo)

Cuando se agregue auth:
```sql
create table public.inmobiliarias (id uuid primary key, name text);
create table public.agents       (id uuid primary key, inmobiliaria_id uuid references public.inmobiliarias);

alter table public.leads
  add constraint leads_inmob_fk foreign key (inmobiliaria_id) references public.inmobiliarias,
  add constraint leads_agent_fk foreign key (agent_id)        references public.agents;

create policy "agentes ven sus leads"
  on public.leads for select to authenticated
  using (agent_id = auth.uid() or inmobiliaria_id in (
    select inmobiliaria_id from public.agents where id = auth.uid()
  ));
```
