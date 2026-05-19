# Deploy Vercel · Grupo Valterra · Sprint 7 final

Guía operativa de 10 pasos para llevar el proyecto a producción pública.

> **Versión**: Sprint 7 post brand-kit integration · typecheck 0 errores · lint 0 errores

---

## Pre-flight check (1 min)

```bash
cd /c/Users/gust/Downloads/grupo-valterra-repo/frontend
npm run typecheck   # debe pasar (0 errores)
npm run lint        # debe pasar (0 errors, 3 warnings <img> aceptados)
npm run build       # debe completar sin error
```

Si alguno falla → resolver antes de continuar.

---

## Paso 1 · Importar proyecto en Vercel

1. https://vercel.com → **Add New** → **Project**
2. **Import Git Repository** → seleccionar `grupo-valterra-repo`
3. Vercel detecta el repo. **Antes de Deploy**, configurar:

| Campo | Valor |
|---|---|
| **Framework Preset** | Next.js (auto) |
| **Root Directory** | `frontend` ← CRÍTICO |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `.next` (default) |
| **Install Command** | `npm install` (default) |
| **Development Command** | `npm run dev` (no se usa en prod) |
| **Node.js Version** | 20.x |

⚠ **Si no configurás Root Directory = `frontend`**, Vercel intenta buildear desde la raíz del monorepo y falla.

---

## Paso 2 · Configurar variables de entorno

Antes de hacer el primer Deploy, pestaña **Environment Variables** → agregar las 4 vars de `docs/env-vars-vercel.md`.

| Variable | Sensitive | Entornos |
|---|---|---|
| `SUPABASE_URL` | No | Production · Preview · Development |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Production · Preview |
| `ADMIN_PASSWORD` | **Yes** | Production · Preview |
| `ADMIN_TOKEN` | **Yes** | Production · Preview |

---

## Paso 3 · Primer deploy

Click **Deploy**. Tiempo esperado: 60-120s.

Output esperado en logs:
```
✓ Installing dependencies
✓ Detected Next.js version: 16.2.6
✓ Running "npm run build"
✓ Generating static pages (4/4)
✓ Finalizing page optimization
✓ Build Completed
✓ Deployment Ready
```

---

## Paso 4 · Verificación post-deploy

Una vez Deploy = Ready, Vercel te da una URL `https://valterra-xxxx.vercel.app`.

### Smoke test obligatorio

```bash
# 1. Homepage carga
curl -sI https://<dominio>/ | head -1
# → HTTP/2 200

# 2. Healthcheck OK + Supabase connected
curl -s https://<dominio>/api/health | jq
# → {
#     "status": "ok",
#     "db": "connected",          ← clave: NO debe decir "fallback"
#     "env": "production",
#     "uptime": 12,
#     "timestamp": "2026-05-18T...",
#     "version": "0.1.0",
#     "checks": {
#       "supabase": { "configured": true, "latencyMs": 142 },
#       "auth_middleware": "active"
#     }
#   }

# 3. /admin/leads redirige a login
curl -sI https://<dominio>/admin/leads | head -3
# → HTTP/2 307 + Location: /admin/login

# 4. Form de contacto persiste lead (browser test):
#    a) Abrir https://<dominio>/
#    b) Scrollear a ContactSection
#    c) Completar form → enviar
#    d) Login con ADMIN_PASSWORD en /admin/login
#    e) Ver el lead recién creado en /admin/leads
```

Si **cualquiera** falla → ver troubleshooting en §10.

---

## Paso 5 · Dominio custom

Vercel → Settings → Domains → **Add**:
1. `valterra.com.ar` (apex)
2. `www.valterra.com.ar` (redirect to apex)

DNS en tu registrador:
- `valterra.com.ar` → A record → `76.76.21.21`
- `www.valterra.com.ar` → CNAME → `cname.vercel-dns.com`

TLS automático en ~1 min.

---

## Paso 6 · UptimeRobot

1. https://uptimerobot.com → New Monitor
2. Type: **HTTPS**
3. URL: `https://<dominio>/api/health`
4. Interval: 5 min
5. Alert: email + telegram

Si `/api/health` devuelve != 200 → alerta inmediata.

---

## Paso 7 · CI verde

Push a `dev` → GitHub Actions corre automáticamente:
- typecheck
- lint (max 10 warnings)
- build

Si verde → merge a `main` → Vercel auto-deploy en producción.

---

## Paso 8 · Branch strategy

```
main   ← producción (auto-deploy Vercel)
  ↑
dev    ← integración (preview-deploy automático en cada push)
  ↑
feature/sprint-7-deploy
```

PR feature → dev → main.

---

## Paso 9 · Rollback < 30s

Vercel → Deployments → último deploy estable verde → ⋯ → **Promote to Production**.
Sin downtime.

---

## Paso 10 · Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| Build falla en Vercel pero pasa local | Root Directory mal configurado | Setear a `frontend` |
| `/api/health` → `db: "fallback"` | Env vars no aplicadas | Redeploy después de setear vars |
| `/admin/leads` no redirige | `ADMIN_TOKEN` faltante | Setear var + redeploy |
| Form falla con 500 | Supabase service-role inválida o expirada | Rotar key, actualizar Vercel env |
| Hydration mismatch | Cache `.next` stale | Redeploy sin build cache |

---

## Resultado esperado

Después de paso 4 ✓, tenés:
- ✅ URL pública con HTTPS
- ✅ Homepage premium con brand Valterra
- ✅ Captura de leads operativa
- ✅ Admin panel protegido
- ✅ Healthcheck monitoreable
- ✅ Rollback < 30s
- ✅ CI verde en cada PR
