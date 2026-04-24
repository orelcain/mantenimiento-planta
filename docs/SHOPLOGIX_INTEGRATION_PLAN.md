# Plan de integración Shoplogix → PWA

**Objetivo:** traer datos de las 3 Evisceradoras Baader 142 (upstream del Grader) al módulo Análisis Grader para correlacionar paros/ritmo del Grader con la producción aguas arriba.

**Referencia API:** [SHOPLOGIX_API.md](./SHOPLOGIX_API.md)

---

## 1. Por qué vale la pena

Las Evisceradoras 1/2/3 son **upstream** del Grader. Su ritmo y paros impactan directamente al Grader:

- Si las Evisceradoras paran → el Grader se queda sin material (se ve como pausa en nuestro módulo, pero **la causa real es upstream**).
- Si las Evisceradoras producen lento (1140 partes/h vs objetivo) → el Grader también baja throughput.
- Correlación `P0% del Grader` vs `ritmo Evisceradoras` podría revelar que P0 sube cuando upstream acelera de golpe (jurel mal eviscerado que llega al Grader).

**Valor para el usuario:** en el dashboard del Grader, ver paros del Grader **junto con** estado de las Evisceradoras en el mismo timeline → diagnóstico de causa raíz mucho más rápido.

---

## 2. Arquitectura propuesta

```
┌────────────────┐   lee    ┌──────────────────────────────┐
│  PWA (web)     │ ───────> │  Firestore:                  │
│  AnalisisGrader│          │  shoplogix/chonchi/machines/ │
└────────────────┘          │    {machineid}/intervals/    │
                            │  shoplogix/chonchi/shifts/   │
                            │    {dateKey}_{shiftId}/      │
                            └──────────────▲───────────────┘
                                           │ escribe
                                  ┌────────┴──────────┐
                                  │  Cloud Function   │
                                  │  shoplogix-sync   │
                                  │  (Cloud Scheduler │
                                  │   cada 5 min)     │
                                  └────────┬──────────┘
                                           │ GET query.axd
                                           │ (cookie sesión)
                                  ┌────────▼──────────┐
                                  │  saas139.         │
                                  │  shoplogix.com    │
                                  └───────────────────┘
```

**Flujo:**

1. **Secret Manager** guarda credenciales Shoplogix (user/password).
2. **Cloud Scheduler** dispara `shoplogix-sync` cada 5 min (o al inicio/fin de turno).
3. **shoplogix-sync** (Cloud Function Node 20):
   - Login → obtiene cookie de sesión (cachea en memoria del container; revalida si expira).
   - Para cada machineid de las 3 Evisceradoras de Chonchi:
     - `GET query.axd?type=whiteboardproduction` con rango del turno actual.
     - `GET query.axd?type=whiteboardsummary` con mismo rango.
   - Normaliza (timestamps Shoplogix → ISO estándar).
   - Escribe a Firestore con merge.
4. **PWA** lee las colecciones `shoplogix/...` en `AnalisisGraderTurnoPage` y superpone al timeline existente.

---

## 3. Schema Firestore propuesto

### Colección `shoplogix/chonchi/machines/{machineid}`

```ts
{
  machineid: '3cbc4c21-dff2-4136-94d5-42f3dff15a4e',
  name: 'Evisceradora 1',
  type: 'baader_142',
  areaid: 3650,           // Eviscerados
  parentArea: 'Eviscerados',
  plantId: 3640,          // Chonchi
  lastSyncAt: Timestamp,
  upstreamOf: ['grader']  // para correlación
}
```

### Colección `shoplogix/chonchi/shifts/{dateKey}_{shiftId}/machines/{machineid}`

Documento por máquina por turno:

```ts
{
  machineid: string
  dateKey: '2026-04-24'
  shiftId: 'Turno día' | 'Turno noche'
  shiftStart: Timestamp
  shiftEnd: Timestamp

  // Agregados del turno
  totalCycles: number          // piezas reales
  expectedTotalCycles: number  // piezas esperadas
  totalPieces: number
  expectedTotalPieces: number
  greenPct: number             // % piezas en verde
  yellowPct: number            // % en amarillo
  redPct: number               // % en rojo
  actualCycleSec: number       // 3.9s
  targetCycleSec: number       // 2.9s

  // Intervalos (5 min)
  intervals: Array<{
    startAt: Timestamp
    endAt: Timestamp
    cycles: number
    expectedCycles: number
    total: number
    expectedTotal: number
    ratio: number              // cycles / expectedCycles
    color: 'green' | 'yellow' | 'red'
  }>

  // Paros (del Machine-Chrono)
  downtimes: Array<{
    startAt: Timestamp
    endAt: Timestamp
    durationSec: number
    category: 'COLACION' | 'Paro Programado' | 'Limpieza de Ducto' | string
    planned: boolean
  }>

  source: 'shoplogix'
  sourceVersion: 1
  syncedAt: Timestamp
}
```

**Ruta:** `shoplogix/chonchi/shifts/2026-04-24_Turno día/machines/3cbc4c21-...`

---

## 4. Cloud Function — `shoplogix-sync`

### Estructura

```
functions/src/shoplogix/
├── shoplogixSync.ts        # HTTP trigger (Cloud Scheduler)
├── shoplogixClient.ts      # Login + GET con cookie
├── shoplogixNormalizer.ts  # Transforma API → schema Firestore
├── shoplogixMachines.ts    # Lista hardcoded de 3 Evisceradoras + helpers
└── __tests__/              # Mocks de fixtures
```

### shoplogixClient.ts (pseudocódigo)

```ts
const BASE = 'https://saas139.shoplogix.com'

let sessionCookie: string | null = null
let sessionExpiresAt = 0

async function login(): Promise<string> {
  const { user, pass } = await getSecrets()
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    body: formEncoded({ user, pass }),
  })
  const cookie = res.headers.get('set-cookie')?.match(/_SLX_[^;]+/)?.[0]
  if (!cookie) throw new Error('No session cookie from Shoplogix login')
  sessionCookie = cookie
  sessionExpiresAt = Date.now() + 25 * 60 * 1000  // 25 min
  return cookie
}

async function getCookie(): Promise<string> {
  if (!sessionCookie || Date.now() > sessionExpiresAt) {
    return login()
  }
  return sessionCookie
}

export async function queryShoplogix<T>(type: string, params: Record<string, string>): Promise<T> {
  const cookie = await getCookie()
  const url = new URL(`${BASE}/web/query.axd`)
  url.searchParams.set('type', type)
  url.searchParams.set('format', 'json')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers: { Cookie: cookie } })
  if (res.status === 401) {
    sessionCookie = null  // forzar re-login
    return queryShoplogix<T>(type, params)
  }
  return res.json()
}
```

### shoplogixSync.ts (pseudocódigo)

```ts
export const shoplogixSync = onRequest(async (req, res) => {
  const { dateKey, shiftId } = getCurrentShift()   // helper existente
  const { startAt, endAt } = getShiftWindow(dateKey, shiftId)

  const machines = [
    { id: '3cbc4c21-dff2-4136-94d5-42f3dff15a4e', name: 'Evisceradora 1' },
    { id: 'ce16a125-6b05-4ab8-acb7-56a123931cff', name: 'Evisceradora 2' },
    { id: '6f76be97-6d45-47ad-8e9a-7450bc2af68c', name: 'Evisceradora 3' },
  ]

  for (const m of machines) {
    const production = await queryShoplogix<WhiteboardProductionResponse>('whiteboardproduction', {
      machines: m.id,
      start: toShoplogixTime(startAt),
      end: toShoplogixTime(endAt),
      minutes: '5',
    })
    const summary = await queryShoplogix('whiteboardsummary', {
      machines: m.id,
      start: toShoplogixTime(startAt),
      end: toShoplogixTime(endAt),
    })

    const doc = normalizeShoplogixShift(production, summary, m)
    await db.doc(`shoplogix/chonchi/shifts/${dateKey}_${shiftId}/machines/${m.id}`).set(doc, { merge: true })
  }

  res.json({ ok: true, machines: machines.length })
})
```

### Scheduler

```yaml
# firebase.json o deploy inline
{
  "scheduler": {
    "shoplogix-sync": {
      "schedule": "*/5 * * * *",   # cada 5 min
      "timeZone": "America/Santiago",
      "uri": "https://.../shoplogixSync"
    }
  }
}
```

---

## 5. Integración en la PWA

### `apps/pwa/src/services/shoplogix/shoplogixShift.service.ts`

```ts
export async function loadShoplogixShift(
  dateKey: string,
  shiftId: string,
): Promise<Record<string, ShoplogixShiftDoc>> {
  const col = collection(db, `shoplogix/chonchi/shifts/${dateKey}_${shiftId}/machines`)
  const snap = await getDocs(col)
  const result: Record<string, ShoplogixShiftDoc> = {}
  snap.forEach(d => { result[d.id] = d.data() as ShoplogixShiftDoc })
  return result
}
```

### Nuevo componente: `UpstreamMachinesPanel`

En `AnalisisGraderTurnoPage`, agregar un panel plegable "🔗 Evisceradoras (upstream)" con:

- 3 mini-timelines (una por Evisceradora) alineados con el timeline del Grader.
- Mini-KPIs por máquina: ritmo actual vs objetivo, paros en curso.
- Enlace "Abrir en Shoplogix" que linkea al period detail.

### En el timeline del Grader

Las barras del Grader existentes se mantienen, pero se **agregan marcadores** cuando una Evisceradora paró:

- Ícono pequeño sobre el timeline del Grader en el minuto de inicio del paro upstream.
- Tooltip: "Evisceradora 2 paró: Limpieza de Ducto, 15 min (hace 3 min)".

Esto permite ver inmediatamente si un P0 del Grader tiene correlación con un evento upstream.

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cookie de sesión expira | Re-login automático en `queryShoplogix` al 401 |
| Shoplogix cambia esquema API | Tests con fixtures + validación `zod` en el normalizer |
| Rate limiting | Polling cada 5 min está bajo cualquier umbral razonable |
| Credenciales en Secret Manager | Uso de service account con acceso restringido solo a ese secret |
| Shoplogix bloquea scraping | Plan B: pedir API oficial. Documentar esta integración como interna |
| Caída del servicio Shoplogix | Datos siguen en Firestore; UI muestra "desactualizado hace X min" si `syncedAt` > 15 min |

---

## 7. Fases de implementación

### Fase 1 — Prueba de concepto (1-2 días)
- [ ] Script Node standalone que hace login y trae datos de Evisceradora 1.
- [ ] Confirmar schema real de `whiteboardsummary`.
- [ ] Confirmar endpoint real de Machine-Chrono.
- [ ] Validar que el login replicable funciona.

### Fase 2 — Cloud Function (2-3 días)
- [ ] `shoplogixClient.ts` con login + query + re-auth.
- [ ] `shoplogixNormalizer.ts` con tests unitarios (fixtures capturadas).
- [ ] `shoplogixSync.ts` con trigger HTTP.
- [ ] Deploy + Scheduler cada 5 min.
- [ ] Backfill inicial de los últimos 30 días.

### Fase 3 — PWA (2-3 días)
- [ ] `shoplogixShift.service.ts` + tests.
- [ ] `UpstreamMachinesPanel` component.
- [ ] Marcadores de paro upstream en timeline del Grader.
- [ ] Toggle show/hide en config de usuario.

### Fase 4 — Análisis y valor (ongoing)
- [ ] Correlación P0 Grader vs ritmo Evisceradoras (gráfico scatter).
- [ ] Alertas cuando una Evisceradora para > 10 min (notif al supervisor Grader).
- [ ] Extensión a YAL y Magallanes si el usuario lo pide.

---

## 8. Alternativas descartadas

### A. Scraping con Puppeteer
- Más frágil, carga todo el JS de Shoplogix, lento, más caro en Cloud Run.
- **Descartado** a favor de llamadas directas a `query.axd`.

### B. Integración directa desde la PWA (sin backend)
- Requeriría exponer credenciales Shoplogix al cliente (o manejar cookie de sesión de Shoplogix en el navegador del usuario — complicado por CORS).
- **Descartado** a favor del Cloud Function proxy.

### C. Esperar a obtener API oficial con token
- Shoplogix ofrece API oficial pero requiere gestión con el account manager de AquaChile.
- **Paralelo:** mientras se gestiona, usamos la sesión-based. Cuando llegue el token, migramos el `shoplogixClient.ts` sin tocar el resto.

---

## 9. Decisión pendiente

**¿Procedemos con la Fase 1 ahora?** Sugerencia:

1. Empezar con un script Node local que haga login → captura cookie → llama `query.axd?type=tree` para validar.
2. Si funciona, escalar a Fase 2 (Cloud Function).
3. Si el login es demasiado complejo (captcha, MFA, anti-bot), pivotamos a pedir API oficial a Shoplogix.

**Tiempo total estimado:** 5-8 días para las 3 primeras fases funcionando end-to-end.
