# Shoplogix — Guía de despliegue

Esta guía describe cómo desplegar el integrador Shoplogix (Cloud Functions
`shoplogixSyncHttp` + `shoplogixSyncWakeup`) a producción.

**Pre-requisitos:**
- Acceso a Firebase CLI (`firebase login`)
- Proyecto `mantenimiento-planta-771a3` seleccionado (`firebase use`)
- Cookie de sesión válida de Shoplogix (ver §3)

---

## 1. Configurar el secret SHOPLOGIX_COOKIE

El cliente Shoplogix autentica mediante una cookie de sesión almacenada
en Google Secret Manager.

### Primera vez

```bash
firebase functions:secrets:set SHOPLOGIX_COOKIE
# Pegue el valor completo del header Cookie (las 3 cookies unidas por "; ")
# Ejemplo:
#   _SLX_xxx=...; _SLX_yyy=...; SLXPNE=k=eyJ...
```

La cookie dura ~8 horas. Después hay que refrescarla:

### Refrescar

```bash
# 1. Loguearse en saas139.shoplogix.com
# 2. DevTools → Red → cualquier query.axd → Headers → copiar "Cookie:"
# 3. Actualizar secret:
firebase functions:secrets:set SHOPLOGIX_COOKIE

# 4. Re-desplegar para que las functions tomen la versión nueva:
firebase deploy --only functions:shoplogixSyncHttp,functions:shoplogixSyncWakeup
```

### Ver versiones del secret

```bash
firebase functions:secrets:access SHOPLOGIX_COOKIE
```

---

## 2. Deploy

```bash
# Solo las functions de Shoplogix (rápido):
firebase deploy --only functions:shoplogixSyncHttp,functions:shoplogixSyncWakeup

# O todo el proyecto:
firebase deploy
```

---

## 3. Probar el sync manualmente

```bash
# Backfill de un turno específico:
curl -X POST \
  "https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/shoplogixSyncHttp?dateKey=2026-02-26&shiftId=Turno%20d%C3%ADa"

# Sync del turno actual (si estamos en ventana operativa):
curl -X POST \
  "https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/shoplogixSyncHttp"
```

**Respuesta esperada (200 OK):**
```json
{
  "dateKey": "2026-02-26",
  "shiftId": "Turno día",
  "syncedAt": "2026-04-24T20:15:00.000Z",
  "results": [
    { "machineid": "3cbc4c21-...", "name": "Evisceradora 1", "status": "ok", "intervals": 156, "states": 81, "totalCycles": 5553 },
    { "machineid": "ce16a125-...", "name": "Evisceradora 2", "status": "ok", "intervals": 156, "states": 87, "totalCycles": 6120 },
    { "machineid": "6f76be97-...", "name": "Evisceradora 3", "status": "ok", "intervals": 156, "states": 74, "totalCycles": 6890 }
  ]
}
```

**Si devuelve 401:**
```json
{ "error": "AUTH_EXPIRED", "message": "..." }
```
→ Refrescar `SHOPLOGIX_COOKIE` (ver §1).

---

## 4. Verificar en Firestore

Después del sync, los datos aparecen en:

```
shoplogix/
└── chonchi/
    └── shifts/
        └── 2026-02-26_Turno día/
            ├── (doc padre con lastSyncAt + resumen)
            └── machines/
                ├── 3cbc4c21-dff2-4136-94d5-42f3dff15a4e  (Evisceradora 1)
                ├── ce16a125-6b05-4ab8-acb7-56a123931cff  (Evisceradora 2)
                └── 6f76be97-6d45-47ad-8e9a-7450bc2af68c  (Evisceradora 3)
```

En la PWA, cualquier usuario navegando a `analisis-grader/turno/...`
automáticamente verá los datos de Shoplogix en el panel "Línea upstream".

---

## 5. Scheduler automático (Cloud Scheduler)

El `shoplogixSyncWakeup` corre **cada 60 minutos** (declarado con `onSchedule`).
Internamente chequea si estamos en horas de turno (07-19 día, 19-07 noche) y
hace skip si no corresponde.

**Costo estimado:** ~24 ejecuciones/día × ~8 máquinas × ~10 KB respuesta ≈
2 MB/día de tráfico + ~30 seg/ejecución × 24 = 12 min CPU/día. Prácticamente
gratis dentro del free tier de Cloud Functions v2.

**Pausar el scheduler** (sin eliminar la function):
```bash
gcloud scheduler jobs pause firebase-schedule-shoplogixSyncWakeup-us-central1 \
  --project mantenimiento-planta-771a3 \
  --location us-central1
```

**Reanudar:**
```bash
gcloud scheduler jobs resume firebase-schedule-shoplogixSyncWakeup-us-central1 \
  --project mantenimiento-planta-771a3 \
  --location us-central1
```

---

## 6. Monitoreo

Ver logs del sync:
```bash
firebase functions:log --only shoplogixSyncHttp
firebase functions:log --only shoplogixSyncWakeup
```

Alertas importantes en los logs:
- `[shoplogix-sync] AUTH_EXPIRED` → refrescar cookie urgente
- `[shoplogix-sync] HTTP 5xx` → Shoplogix está caído (no crítico, reintenta solo)
- `[shoplogix-sync] empty` → la máquina no tiene datos en ese rango (turno cerrado sin actividad)

---

## 7. Rollback

Si el scheduler o HTTP trigger causa problemas:

```bash
# Pausar el scheduler inmediatamente:
gcloud scheduler jobs pause firebase-schedule-shoplogixSyncWakeup-us-central1 \
  --project mantenimiento-planta-771a3 --location us-central1

# Eliminar completamente las functions:
firebase functions:delete shoplogixSyncHttp shoplogixSyncWakeup

# La PWA sigue funcionando sin la integración — el hook retorna null y
# el panel muestra "próximamente" sin romper el resto de la página.
```

---

## 8. Fase 2b.1 — Login automatizado (IMPLEMENTADO)

Usa ROPC (Resource Owner Password Credentials) de OAuth 2.0, soportado por
`identity.shoplogix.com/connect/token` (confirmado vía OIDC Discovery).

### Activar auto-login

```bash
# Configurar credenciales (solo una vez):
firebase functions:secrets:set SHOPLOGIX_USER
# (ingresá el email de login)
firebase functions:secrets:set SHOPLOGIX_PASS
# (ingresá la contraseña)

# Desplegar las 3 functions de Shoplogix:
firebase deploy --only functions:shoplogixSyncHttp,functions:shoplogixSyncWakeup,functions:shoplogixTokenRefresh
```

Con `SHOPLOGIX_USER` + `SHOPLOGIX_PASS` configurados:
- El sistema hace auto-login ROPC en el primer sync
- El access_token se renueva cada ~50 min (función `shoplogixTokenRefresh`)
- Si el refresh falla → re-login completo automático con user/pass
- SHOPLOGIX_COOKIE sigue como fallback si no hay user/pass

### Modo Bearer vs Cookie

| Situación | Modo activo |
|---|---|
| `SHOPLOGIX_USER` + `SHOPLOGIX_PASS` configurados | **Bearer (auto)** — Fase 2b.1 |
| Solo `SHOPLOGIX_COOKIE` configurado | **Cookie (legado)** — Fase 2b.0 |
| Ninguno | Error `NO_AUTH` |

El modo activo se loguea en cada sync: `modo auth: bearer` o `modo auth: cookie`.

### Tokens almacenados en Firestore

Los tokens OAuth se guardan en `system/shoplogixToken`:
- `access_token` — vigente ~1h
- `refresh_token` — vigente varios días
- `expires_at` — cuándo vence el access_token

No hay que hacer nada con ellos — el sistema los renueva automáticamente.

### Si Bearer no funciona en query.axd

Si Shoplogix no acepta `Authorization: Bearer` en `query.axd` (responde 401),
los logs mostrarán `AUTH_EXPIRED (Bearer)`. En ese caso:

1. Conservar `SHOPLOGIX_COOKIE` como mecanismo
2. Implementar Fase 2b.1b: usar el access_token para obtener session cookie
   vía el endpoint `/identity` (OAuth callback)

## 9. Roadmap

**Fase 2b.0 — Cookie manual (LEGADO):**
- Sigue funcionando como fallback si no hay SHOPLOGIX_USER/PASS

**Fase 2b.1 — Login automatizado (IMPLEMENTADO):**
- ROPC con `identity.shoplogix.com/connect/token`
- Bearer token en `query.axd` (o fallback a cookie via callback)

**Fase 2b.2 — API oficial (ideal):**
- Gestionar con el account manager de AquaChile acceso API oficial
- Secrets: `SHOPLOGIX_API_TOKEN`
- Sin session-scraping ni riesgo de bloqueo
- ETA: depende de Shoplogix
