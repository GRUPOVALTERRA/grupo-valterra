# UptimeRobot · Setup Guide · Grupo Valterra

> Monitor automático de `/api/health` en producción. 10 minutos. Free tier alcanza.

## Por qué ahora

Sprint 10 toca DB + auth + middleware (los 3 componentes más sensibles). Sin uptime monitor, si producción se degrada o cae a las 3 AM, te enterás cuando un usuario te avise por WhatsApp al día siguiente. Con UptimeRobot, recibís email automático en cuanto el endpoint deja de responder OK.

## Costo

Cuenta free: 50 monitores · check cada 5 min · alertas por email ilimitadas. **$0/mes.**

---

## Setup paso a paso

### Paso 1 · Crear cuenta

1. Andá a https://uptimerobot.com/signUp
2. Registrate con tu email (`gustavo210277@gmail.com`)
3. Verificá el email de bienvenida

### Paso 2 · Crear el primer monitor

En el dashboard click **+ New monitor**, completá:

| Campo | Valor |
|---|---|
| **Monitor Type** | `HTTP(s)` |
| **Friendly Name** | `Grupo Valterra · /api/health` |
| **URL (or IP)** | `https://grupo-valterra.vercel.app/api/health` |
| **Monitoring Interval** | `5 minutes` (free tier max frequency) |
| **Monitor Timeout** | `30 seconds` |
| **HTTP Method** | `GET` |
| **Custom HTTP Headers** | dejar vacío |
| **Custom HTTP Status Codes** | `200` (default ya lo cubre, no agregar) |

Click **Advanced Settings**:

| Campo | Valor |
|---|---|
| **Keyword Type** | `exists` |
| **Keyword Value** | `"status":"ok"` |
| **Case-Sensitive Keyword** | check ✓ |

Esto hace que UptimeRobot NO solo valide HTTP 200, sino que el JSON response contenga `"status":"ok"`. Si Supabase se cae y `/api/health` devuelve 200 con `"status":"degraded"`, igual alerta.

### Paso 3 · Configurar alertas

En la misma pantalla, abajo:

**Select alert contacts to notify:**
- Marcá tu email `gustavo210277@gmail.com` (viene por default).
- Si querés agregar otro: **Add contact** → tipo Email → completar.

**When down notification:**
- ✓ `When the monitor goes down`
- ✓ `When the monitor goes back up`
- **Notification interval:** cada `10 minutes` mientras siga abajo (no se vuelve spam)

Click **Create Monitor**.

### Paso 4 · Verificar funcionamiento inmediato

Dentro de 1-2 minutos UptimeRobot hace el primer check. Refresheá el dashboard:

- Si el status es **Up** (verde) → monitor funcionando.
- Si está **Paused** o **Pending** → esperar 3 min y refrescar.

### Paso 5 · Test de alerta (opcional pero recomendado)

Para confirmar que las alertas llegan a tu email:

1. En el monitor → **Edit** → cambiar la URL temporalmente a `https://grupo-valterra.vercel.app/api/health-NO-EXISTE`.
2. Esperar ~6 min (1 check fallido).
3. Tenés que recibir email de UptimeRobot: "Monitor is DOWN".
4. Volver a editar → restaurar URL correcta a `https://grupo-valterra.vercel.app/api/health`.
5. Esperar ~5 min más → email "Monitor is BACK UP".

Si los 2 emails llegaron → alertas verificadas.

---

## Configuración esperada (resumen)

```yaml
monitor:
  name: "Grupo Valterra · /api/health"
  type: HTTP(s) GET
  url: https://grupo-valterra.vercel.app/api/health
  interval: 5 minutes
  timeout: 30 seconds
  keyword:
    type: exists
    value: '"status":"ok"'
    case_sensitive: true

alerts:
  email: gustavo210277@gmail.com
  trigger_down: true
  trigger_up: true
  notification_interval: 10 minutes
```

---

## Condición esperada en producción

Cuando `/api/health` está saludable, el JSON luce así:

```json
{
  "status": "ok",
  "db": "connected",
  "env": "production",
  "uptime": 1234,
  "timestamp": "2026-05-23T20:00:00.000Z",
  "version": "0.1.0",
  "commit": "abc1234",
  "region": "iad1",
  "deploy_id": "dpl_xxx",
  "checks": {
    "supabase": { "configured": true, "latencyMs": 45 },
    "auth_middleware": "active",
    "sentry": "active"
  }
}
```

UptimeRobot detecta como **DOWN** si:
- HTTP status != 200
- Timeout > 30s
- Response NO contiene la string `"status":"ok"` (esto cubre `degraded` y `down`)

---

## Checklist de validación

- [ ] Cuenta UptimeRobot creada y email verificado
- [ ] Monitor creado apuntando a `https://grupo-valterra.vercel.app/api/health`
- [ ] Interval = 5 min
- [ ] Keyword check `"status":"ok"` activo
- [ ] Alert contact tu email configurado
- [ ] Notification interval = 10 min (no spam)
- [ ] Primer check exitoso (status verde Up)
- [ ] Test de alerta opcional (URL incorrecta) → email DOWN + UP recibidos
- [ ] Restaurar URL correcta post-test

---

## Mantenimiento

- **Cuando agregues dominio propio** (`valterra.com.ar`): editar el monitor para apuntar a `https://valterra.com.ar/api/health` y eliminar el monitor viejo `*.vercel.app` (o dejarlo como backup).
- **Cuando entren más endpoints críticos** (Sprint 12 `/api/properties`, Sprint 13 stripe webhooks): agregar 1 monitor adicional por endpoint. Free tier cubre 50.
- **Si recibís falsos positivos** (intermitencias por cold start Vercel): subir timeout a `45s` o `60s`.

---

## Sprint 10 OK criterion

Antes de empezar Sprint 10 MF1, este monitor tiene que estar **Up** durante al menos 30 min continuos. Si ya hay alertas DOWN durante este setup, primero investigar y resolver antes de tocar auth/multi-tenant.
