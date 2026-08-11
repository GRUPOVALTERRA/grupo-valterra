# Variables de entorno · Vercel

Referencia operativa de cada env var que el proyecto necesita en producción.

---

## Tabla maestra

| Variable | Tipo | Requerida en | Sensitive | Generación |
|---|---|---|---|---|
| `SUPABASE_URL` | URL HTTPS | prod + preview + dev | No | Supabase Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT largo | prod + preview | **Sí** | Supabase Settings → API |
| `ADMIN_PASSWORD` | string 12+ chars | prod + preview | **Sí** | Generación manual |
| `ADMIN_TOKEN` | hex 64 chars | prod + preview | **Sí** | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | URL HTTPS | prod | No | URL pública del deploy |

---

## Detalle por variable

### 1. `SUPABASE_URL`

URL del proyecto Supabase. Pública, OK estar en logs.

**Cómo obtener**:
```
Supabase Dashboard → tu proyecto → Settings → API → Project URL
→ https://abcdefgh.supabase.co
```

**Dónde se usa**: `src/lib/supabase.ts` línea 28-29.

**Si falta**: `getAllLeads()` y `addLead()` caen al store en memoria con warning. La app sigue funcional pero leads se pierden al reiniciar.

---

### 2. `SUPABASE_SERVICE_ROLE_KEY`

JWT con permisos full (bypassa RLS). **NUNCA exponer al cliente**.

**Cómo obtener**:
```
Supabase Dashboard → Settings → API → Project API Keys → service_role
↓ click "Reveal" → copiar
```

⚠ Es el JWT con prefix `eyJ...` MÁS LARGO (no confundir con `anon`).

**Dónde se usa**: server-side only en `src/lib/supabase.ts`. Marcado como **Sensitive** en Vercel para que no aparezca en UI ni logs.

**Si filtra**: rotar inmediatamente desde Supabase → Settings → API → Reset service_role key.

---

### 3. `ADMIN_PASSWORD`

Password plaintext que se compara en `loginAction`. Mínimo 12 chars.

**Generación recomendada**:
```bash
# Linux/Mac/Git Bash
openssl rand -base64 18
# o también
node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"

# Windows PowerShell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Random)))
```

**Dónde se usa**: `src/app/admin/login/actions.ts` comparación con input.

**Si falta en Vercel**: el middleware queda en modo permisivo (cualquiera entra a `/admin`). **Bloqueante para producción.**

---

### 4. `ADMIN_TOKEN`

Valor que se guarda en la cookie del admin loggeado. Cuando el middleware ve esa cookie y matchea con la env var, deja pasar.

**Generación**:
```bash
openssl rand -hex 32
# → e.g. "8f3acb29...c901a4f7"
```

**Características**:
- 64 caracteres hex (256 bits entropy)
- Rotación invalida todas las sesiones admin activas
- HttpOnly, Secure (prod), SameSite=Strict

**Dónde se usa**: `src/middleware.ts` + `src/app/admin/login/actions.ts`.

---

### 5. `NEXT_PUBLIC_SITE_URL`

URL pública del deploy. Se inyecta al cliente (prefix `NEXT_PUBLIC_`).

**Uso**:
- `metadataBase` en `src/app/layout.tsx` para OpenGraph + canonical URL
- Twitter / Facebook generan previews con URL absolutas correctas

**Valor**:
- Producción: `https://valterra.com.ar` (cuando el dominio custom esté listo)
- Preview: dejar vacío, usa fallback `http://localhost:3000`

---

## Cómo cargarlas en Vercel

```
Vercel → tu proyecto → Settings → Environment Variables
↓ click "Add New"
↓ Key = SUPABASE_URL
↓ Value = https://...
↓ Environments = Production + Preview + Development
↓ Save

(repetir para cada variable)
```

⚠ Marcar **Sensitive = ON** para `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_TOKEN`.

---

## Cómo verificar que se aplicaron

Después de un deploy:
```bash
curl -s https://<dominio>/api/health | jq '.checks'
# →
# {
#   "supabase": { "configured": true, "latencyMs": 142 },
#   "auth_middleware": "active"
# }
```

- `supabase.configured = true` → SUPABASE_URL + SERVICE_ROLE_KEY presentes ✓
- `auth_middleware = "active"` → ADMIN_TOKEN presente ✓
- Si `supabase.configured = false` → SUPABASE_URL falta
- Si `auth_middleware = "permissive"` → ADMIN_TOKEN falta (**bloqueante prod**)

---

## Rotación de secrets

| Secret | Frecuencia | Impacto al rotar |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | cada 90 días o si filtra | downtime ~30s entre reset y redeploy |
| `ADMIN_PASSWORD` | cada 90 días | sólo afecta nuevos logins |
| `ADMIN_TOKEN` | cada 30 días o si filtra | **invalida todas las sesiones admin activas** → usuarios deben re-loguear |

Procedimiento:
1. Generar nuevo valor
2. Vercel → Settings → Env Vars → edit
3. Save → **Redeploy** (los cambios de env requieren redeploy, no es hot-reload)

---

## `EVENTS_HASH_SALT` — Analítica F2 (Sprint 20)

| Variable | ¿Requerida? | Entornos | Sensitive |
|---|---|---|---|
| `EVENTS_HASH_SALT` | No (opcional) | Production · Preview | **ON** |

**Qué hace.** Es la sal del `visit_hash` que escribe `POST /api/events` en la tabla
`site_events`. El valor se calcula como
`sha256(ip + user-agent + EVENTS_HASH_SALT + fecha-UTC)` truncado a 16 caracteres.

**Qué es `visit_hash`, con precisión.** Un **identificador pseudónimo diario**
derivado de IP y user-agent con sal secreta, **sin persistir los valores
originales**. Como la fecha UTC entra en el material del hash, rota cada día: no
permite construir un identificador cross-day. Sirve para deduplicar visitas dentro
de una misma jornada, y para nada más.

**Qué NO es.** No es anonimización. Un pseudónimo derivado de IP+UA sigue siendo un
dato personal bajo la mayoría de los marcos de privacidad, y quien tenga la sal
puede confirmar por fuerza bruta si una IP dada produjo un hash dado ese día — el
espacio de IPs es chico. La sal secreta y la rotación diaria acotan el riesgo; no
lo eliminan. Por eso la sal es obligatoria para emitir el valor.

**Si falta.** El endpoint sigue funcionando y registra los eventos, pero
`visit_hash` queda en `NULL`: se pierde la deduplicación diaria, nada más. Es
preferible a emitir un pseudónimo con sal predecible, que sí sería trivialmente
reversible. **El dashboard debe tolerar `NULL` y mostrar "Sin datos" en vez de
inventar un conteo de visitantes únicos.**

**Cómo generarla.** Un valor aleatorio largo, distinto por entorno:
```bash
openssl rand -hex 32
```

**Rotación.** Cada 90 días. Al rotar, los visitantes del día en curso se cuentan
dos veces (antes y después del cambio). Impacto nulo fuera de eso: ninguna sesión
ni login depende de esta variable.
