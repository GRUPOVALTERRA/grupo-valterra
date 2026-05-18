# Deployment Vercel · Grupo Valterra

Guía operativa de producción. Cubre deploy, rotación de secrets, troubleshooting y recovery.

---

## 1. Pre-requisitos

| Check | Estado |
|---|---|
| Repo en GitHub | ✓ |
| Vercel account con GitHub integration | requerido |
| Proyecto Supabase con tabla `leads` | ver `supabase-setup.md` |
| `SUPABASE_SERVICE_ROLE_KEY` generada | Project Settings → API → service_role |
| `ADMIN_PASSWORD` definido | strong, ≥12 chars |
| `ADMIN_TOKEN` generado | `openssl rand -hex 32` |

## 2. Deploy inicial

1. Vercel → **New Project** → Import Git Repository → seleccionar repo
2. **Root Directory** = `frontend` (importante: el Next.js está dentro del monorepo)
3. Framework: Next.js (auto-detect)
4. Build Command: `npm run build` (default)
5. Output: `.next` (default)
6. Install Command: `npm install` (default)
7. Antes de **Deploy** → agregar las env vars (siguiente sección)
8. Deploy

## 3. Variables de entorno

Vercel → **Settings → Environment Variables**

| Variable | Valor | Entornos | Sensitive |
|---|---|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Production · Preview · Development | No |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Production · Preview | **Yes** |
| `ADMIN_PASSWORD` | password fuerte | Production · Preview | **Yes** |
| `ADMIN_TOKEN` | hex 32 bytes | Production · Preview | **Yes** |

⚠ **Crítico**:
- Nunca prefijo `NEXT_PUBLIC_` para `SUPABASE_SERVICE_ROLE_KEY` ni `ADMIN_*`
- Marcar como Sensitive → no aparecen en logs ni UI después de guardar
- Después de cambiar env vars hay que **redeploy** (no es hot-reload)

## 4. Verificación post-deploy (checklist obligatorio)

```bash
# 1. Health endpoint
curl -s https://<your-domain>/api/health | jq
# → status: "ok", db: "connected", uptime: <segundos>, version: "0.1.0"

# 2. Homepage carga
curl -sI https://<your-domain>/ | head -1
# → HTTP/2 200

# 3. /admin/leads redirige a login (sin cookie)
curl -sI https://<your-domain>/admin/leads | head -3
# → HTTP/2 307 + Location: /admin/login?next=/admin/leads

# 4. Login funciona
# → abrir browser, /admin/login, password, ver /admin/leads

# 5. Captura de lead persiste
# → enviar form en /, recibir leadId, refrescar /admin/leads, lead aparece
```

Si falla **cualquiera** → ver §7 troubleshooting.

## 5. Dominios

Vercel → Settings → Domains:
1. Add `valterra.com.ar`
2. Add `www.valterra.com.ar` (redirect a apex)
3. Configurar DNS en tu registrador:
   - `valterra.com.ar`  →  A record  →  `76.76.21.21`
   - `www.valterra.com.ar`  →  CNAME  →  `cname.vercel-dns.com`
4. Vercel emite cert TLS automático (~1 min)

## 6. Rotación de secrets

### Rotar `SUPABASE_SERVICE_ROLE_KEY`

```
Supabase → Settings → API → Reset service_role key
↓ copiar nueva key
Vercel → Settings → Env Vars → editar SUPABASE_SERVICE_ROLE_KEY
↓ Redeploy (Deployments → ... → Redeploy)
```

⚠ **Ventana de downtime**: ~30s entre rotación y redeploy. Hacerlo fuera de horario pico.

### Rotar `ADMIN_TOKEN`

Equivale a invalidar **todas las sesiones admin activas**.

```bash
# Generar nuevo token
NEW=$(openssl rand -hex 32)
echo $NEW
# Pegar en Vercel env vars → Redeploy
# Todos los admins deben volver a loguear
```

### Rotar `ADMIN_PASSWORD`

Mismo flow. No invalida sesiones existentes (sólo afecta nuevos logins).

## 7. Troubleshooting

### Síntoma: `/api/health` devuelve `db: "error"`

| Causa | Verificación | Fix |
|---|---|---|
| Supabase project pausado | Supabase Dashboard → ver estado | Restart project |
| Key expirada/rotada | `curl https://<supabase>/rest/v1/` con la key | Re-generar key, actualizar Vercel env |
| Network outage Supabase | https://status.supabase.com | Esperar; service cae a memoria |
| Timeout query | `latencyMs > 4000` en health | Revisar índices de la tabla |

### Síntoma: `/api/health` devuelve `db: "fallback"`

Significa env vars no presentes en runtime. Verificar:

```bash
# En Vercel project → Deployments → click último → Functions tab → ver env
```

Si están seteadas pero el health dice fallback → redeploy (cambios en env requieren redeploy).

### Síntoma: lead se envía pero no aparece en /admin/leads

1. ¿Aparece `lead persistido` en Vercel Logs? Si no → DB no aceptó el insert
2. Supabase Studio → Table editor → `leads` → ¿está la fila?
   - **Sí**: problema en `/admin/leads` SELECT (revisar logs)
   - **No**: problema en INSERT (check constraints, RLS, permisos service_role)
3. `getAllLeads` lee desde `force-dynamic` → no es caché, debería ser fresh

### Síntoma: redirect loop en `/admin/login`

| Causa | Fix |
|---|---|
| `ADMIN_TOKEN` no seteado en Vercel | Setear env var + redeploy |
| Cookie no se guarda (cross-domain o http) | Forzar HTTPS, verificar `secure: true` en prod |
| `next` param malicioso | El whitelist `nextPath.startsWith("/admin")` ya filtra |

### Síntoma: rate limit dispara en condiciones normales

Producción multi-región: cada Lambda tiene su propia memoria del rate limiter.
- **MVP**: aceptar, ajustar límite a 10/min en lugar de 5
- **Growth**: migrar a Upstash Redis (sliding window distribuido)

### Síntoma: Build falla en Vercel pero local OK

Revisar:
1. **Root Directory** debe ser `frontend`
2. Node version en Vercel → usar 20.x (Project Settings → General → Node.js Version)
3. `next-env.d.ts` puede tener null bytes (Windows artifact) → regenerar local + commitear

### Síntoma: Hydration mismatch en /

Suele venir de timestamps generados server vs render client. Revisar:
- `formatRelativeTime` en client components (calculado en runtime)
- Si aparece → solución: setear el valor en useEffect, no en SSR

## 8. Recovery / Restore

### Supabase free tier
- Backups automáticos diarios, retention 7 días
- Restore: Supabase → Database → Backups → seleccionar fecha → Restore
- ⚠ Restore reemplaza la DB completa, hay downtime

### Plan Pro (recomendado para producción real)
- PITR (point-in-time recovery) hasta 7 días, precisión segundo
- Read replicas
- $25/mes

### Snapshot manual antes de operación riesgosa
```bash
# Desde local con psql
pg_dump "postgresql://postgres:<password>@db.xxxx.supabase.co:5432/postgres" \
  --schema=public --data-only > backup-$(date +%Y%m%d).sql
```

### Restore manual
```bash
psql "postgresql://..." < backup-YYYYMMDD.sql
```

## 9. Monitoring

| Métrica | Dónde | Acción |
|---|---|---|
| Status app | `/api/health` polling cada 5min | UptimeRobot / Vercel monitor |
| Logs | Vercel → Project → Logs | Filtrar por `level=error` |
| DB queries | Supabase → Logs → API logs | Buscar slow queries |
| Cost | Vercel Usage tab | Alert >75% del plan |

### Setup UptimeRobot (5 min, free)
1. https://uptimerobot.com → New monitor
2. Type: HTTPS
3. URL: `https://<domain>/api/health`
4. Interval: 5 min
5. Alert: email + telegram

## 10. Reinicio / Redeploy

### Redeploy sin cambios de código
Vercel → Deployments → último deploy → `...` menu → **Redeploy**

### Forzar limpieza de caché
Vercel → Deployments → ... → Redeploy → **uncheck "Use existing Build Cache"**

### Cambios en env vars
Siempre requieren redeploy. El runtime de Vercel no hot-reloadea env.

## 11. Rollback rápido

```
Vercel → Deployments
↓ identificar último deploy estable (✓ verde)
↓ click "..." → Promote to Production
```

Tiempo: ~10 segundos. Sin downtime.

## 12. Checklist pre-demo inversor

- [ ] `/api/health` devuelve `status: "ok"` desde el dominio real
- [ ] Cookie HttpOnly + Secure en `/admin/leads`
- [ ] Login funciona con ADMIN_PASSWORD productivo (no el de dev)
- [ ] Lead enviado desde mobile (iPhone Safari) llega al admin
- [ ] Supabase tiene backup automático activo
- [ ] UptimeRobot configurado
- [ ] Dominio custom con TLS verde
- [ ] Logs sin errores en últimas 24hs

---

**Versión:** Sprint 6 (Hardening + Auth + Deploy)
**Mantenedor:** CTO
**Última revisión:** 2026-05-17
