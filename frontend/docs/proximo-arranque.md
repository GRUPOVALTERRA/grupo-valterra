# Próximo arranque · Mañana

Guía paso a paso para retomar Grupo Valterra sin perder contexto.

> **Objetivo del día:** llevar `/api/health` a `status: "ok"` desde un dominio público de Vercel.
> **Tiempo estimado:** 60-75 minutos sin DNS · 90-120 min con dominio custom.

---

## ☕ Pre-arranque (5 min)

```bash
# 1. Abrir terminal Git Bash
cd /c/Users/gust/Downloads/grupo-valterra-repo

# 2. Verificar branch
git status
git log --oneline -5

# 3. Entrar al frontend
cd frontend
```

---

## Paso 1 · Sincronizar repo (2 min)

```bash
git checkout dev
git pull origin dev

# Si quedó la branch feature de ayer, retomarla; si no, crear:
git checkout feature/sprint-7-deploy 2>/dev/null || git checkout -b feature/sprint-7-deploy
```

---

## Paso 2 · Dependencias (3 min, sólo si node_modules está limpio)

```bash
# Si node_modules existe, salta
ls node_modules >/dev/null 2>&1 || npm install
```

---

## Paso 3 · Validación local (5 min)

```bash
npm run typecheck    # → 0 errores
npm run lint         # → 0 errors (3 warnings <img> OK)
```

Si algo da error → leer mensaje → fix antes de continuar.

---

## Paso 4 · Smoke test local (5 min)

```bash
npm run dev
# abrir browser: http://localhost:3000
```

Validar visualmente:
- [ ] Homepage carga con logo isotipo + descriptor "Soluciones Inmobiliarias del Litoral"
- [ ] Navbar transparente que se vuelve blanca al scrollear
- [ ] Sección contacto envía form → success
- [ ] `http://localhost:3000/api/health` → JSON con `db: "fallback"` (sin .env.local) o `db: "connected"` (con .env.local)
- [ ] `http://localhost:3000/admin/leads` → si ADMIN_TOKEN está, redirige a login

Cerrar dev con `Ctrl+C`.

---

## Paso 5 · Aplicar SQL en Supabase (5 min)

> **Saltar si ya está aplicada.** Verificación rápida: Supabase Studio → Table Editor → ¿existe tabla `leads`?

```
1. https://app.supabase.com → tu proyecto
2. SQL Editor → New query
3. Copiar contenido de supabase/migrations/0001_create_leads.sql
4. Run
5. (Opcional) Copiar supabase/seed.sql → Run para datos demo
6. Verificar Table Editor → leads → debe tener columnas + 6 filas seed
```

---

## Paso 6 · Generar las 4 secrets (3 min)

```bash
# En Git Bash
echo "SUPABASE_URL=$(echo 'https://TU-REF.supabase.co')"   # ← reemplazar TU-REF
echo "SUPABASE_SERVICE_ROLE_KEY=eyJ...   # ← copiar de Supabase Settings → API"
echo "ADMIN_PASSWORD=$(openssl rand -base64 18)"
echo "ADMIN_TOKEN=$(openssl rand -hex 32)"
```

Guardar los 4 valores en un password manager. **No commitearlos.**

---

## Paso 7 · Push branch + PR (5 min)

```bash
git add .
git commit -m "chore: cierre sprint-7 + docs próximo arranque"
git push -u origin feature/sprint-7-deploy
```

En GitHub → Compare & pull request → base: `dev` → Create PR → esperar CI verde.

---

## Paso 8 · Importar en Vercel (10 min)

```
1. https://vercel.com → Add New → Project
2. Import grupo-valterra-repo
3. Configurar antes del Deploy:
   - Framework: Next.js (auto)
   - Root Directory: frontend  ← CRÍTICO
   - Build Command: npm run build
   - Install Command: npm install
   - Node version: 20.x
4. Environment Variables → agregar las 4 (Sensitive ON para las 3 secretas)
5. Click Deploy
6. Esperar 60-120s → Ready verde
```

---

## Paso 9 · Validar /api/health en producción (2 min)

```bash
# Reemplazar <dominio> por el de Vercel
curl -s https://<dominio>/api/health | python3 -m json.tool
```

Esperado:
```json
{
  "status": "ok",
  "db": "connected",
  "env": "production",
  "uptime": 12,
  "timestamp": "...",
  "version": "0.1.0",
  "checks": {
    "supabase": { "configured": true, "latencyMs": 142 },
    "auth_middleware": "active"
  }
}
```

Si `db != "connected"` o `auth_middleware != "active"` → revisar env vars en Vercel y redeploy.

---

## Paso 10 · Smoke test mobile (10 min)

Desde tu celular (Safari iPhone preferido):

- [ ] Abrir `https://<dominio>/`
- [ ] Verificar navbar fixed + hamburguesa abre drawer
- [ ] Tap en propiedad → WhatsApp directo a +54 9 379 515-9096
- [ ] Tap en ContactSection → completar form → recibir success
- [ ] Volver a desktop → abrir `https://<dominio>/admin/leads`
- [ ] Login con ADMIN_PASSWORD → ver el lead recién creado del mobile

---

## Paso 11 · UptimeRobot (5 min)

```
1. https://uptimerobot.com → New Monitor
2. Type: HTTPS
3. URL: https://<dominio>/api/health
4. Interval: 5 minutes
5. Alert Contacts: email + (opcional) Telegram
6. Save
```

Verificar que el primer ping da OK.

---

## Paso 12 · (Opcional) Dominio custom (15 min + DNS)

```
Vercel → Settings → Domains → Add → valterra.com.ar
Vercel → Settings → Domains → Add → www.valterra.com.ar (redirect)

DNS en tu registrador:
- valterra.com.ar → A record → 76.76.21.21
- www.valterra.com.ar → CNAME → cname.vercel-dns.com

Esperar propagación (5min - 24h). TLS automático.
```

---

## ✅ Done criteria del día

Cuando todas estas casillas estén marcadas, el Sprint 7 está cerrado:

- [ ] CI verde en PR
- [ ] PR mergeado a `dev`
- [ ] Vercel Deploy = Ready
- [ ] `https://<dominio>/api/health` → `db: connected` + `auth_middleware: active`
- [ ] Smoke test mobile OK (lead enviado y visible en admin)
- [ ] UptimeRobot configurado y reportando OK

Después de eso: descanso, retroinspección y arrancamos Sprint 8 (NextAuth + multi-tenant) con base sólida.

---

## ⚠️ Si algo falla

Buscar en este orden:
1. `docs/deploy-vercel-final.md` § Troubleshooting
2. `docs/env-vars-vercel.md` § Verificar que se aplicaron
3. Vercel → Deployments → último → Logs (filtrar por `error`)
4. Supabase → Logs → API logs

---

## Lo que **NO** vas a hacer mañana

- ❌ Agregar NextAuth (Sprint 8)
- ❌ Crear tabla inmobiliarias/agents (Sprint 8)
- ❌ Diseñar nuevas secciones de homepage
- ❌ Tocar el brand kit
- ❌ Reescribir componentes que ya funcionan

**Foco único: deploy público estable.**
