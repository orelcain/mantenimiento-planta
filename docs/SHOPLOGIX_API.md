# Shoplogix API — Mapeo de endpoints (Planta Chonchi)

**Fecha del mapeo:** 2026-04-24
**Fuente:** DevTools (Edge Network) sobre sesión activa en `saas139.shoplogix.com`
**Cuenta:** CN_PuertoMontt (AquaChile S.A.)
**Licencia:** 35 máquinas hasta 2026-12-31

---

## 1. Base URL y autenticación

- **Base URL:** `https://saas139.shoplogix.com/web/`
- **Endpoint raíz de queries:** `query.axd` (ASP.NET HTTP handler)
- **Auth:** Cookie de sesión `_SLX_cDOG345DYUYMav6Mj52gcA=...` — obtenida después de login interactivo. No hay API key ni token; es sesión-based.
- **Content-Type:** `application/json`
- **Method:** `GET` para todos los `query.axd`

> ⚠️ **Implicancia:** para consumir esto desde nuestro backend necesitamos replicar el flujo de login (o pedir a Shoplogix un token API oficial, que sí tienen pero requiere gestión con el account manager).

---

## 2. Jerarquía organizacional — `?type=tree`

**Endpoint:** `GET /web/query.axd?type=tree&format=json`

**Respuesta (resumen):**

```
root
└── customer (AquaChile S.A., areaid: 3531)
    └── plant (Plantas AquaChile S.A., areaid: 3532)
        ├── area (Planta Cardonal, areaid: 3575)
        ├── area (Planta Calbuco, areaid: 3581)
        ├── area (Planta Quellon, areaid: 3630)
        ├── area (Planta Chonchi, areaid: 3640)          ← NOSOTROS
        │   ├── area (Filetes, areaid: 8181)
        │   │   └── machine Linea 1
        │   ├── area (Eviscerados, areaid: 3650)
        │   │   └── 3 machines (Evisceradora 1, 2, 3)    ← UPSTREAM GRADER
        │   └── area (Eviscerados YAL, areaid: 3651)
        │       └── 3 machines (YAL Evisceradora 1, 2, 3)
        └── area (Planta Magallanes, areaid: 3680)
```

### UUIDs de máquinas (Planta Chonchi)

| Máquina | machineid |
|---|---|
| Filetes → Linea 1 | `3c0581da-9f19-49f0-aa15-b1596ae94dbd` |
| **Evisceradora 1** (Baader 142) | `3cbc4c21-dff2-4136-94d5-42f3dff15a4e` |
| **Evisceradora 2** (Baader 142) | `ce16a125-6b05-4ab8-acb7-56a123931cff` |
| **Evisceradora 3** (Baader 142) | `6f76be97-6d45-47ad-8e9a-7450bc2af68c` |
| YAL Evisceradora 1 | `fbf9e673-7fdf-47d4-a1cb-af3777fa8eb4` |
| YAL Evisceradora 2 | `f7d8838a-0aff-4d80-a676-a4e35b3a4c00` |
| YAL Evisceradora 3 | `54eea655-3c62-4d3d-8e3b-11b3962e988b` |

### Campos de `machine`

```ts
interface ShoplogixMachine {
  machineid: string            // UUID
  name: string                 // "Evisceradora 1"
  accountName: string          // "CN_PuertoMontt"
  licensed: boolean
  machineType: 'Opc' | string  // OPC UA típicamente
}
```

### Campos de `area`

```ts
interface ShoplogixArea {
  areaid: number
  name: string
  areaType: 'root' | 'customer' | 'plant' | 'area'
  plant: boolean
  oeeWaterfallEnabled: boolean
  opportunityParetoEnabled: boolean
  parentPlantId?: number
  areas?: ShoplogixArea[]      // recursivo
  machines?: ShoplogixMachine[]
}
```

---

## 3. Producción por intervalo — `?type=whiteboardproduction`

**Endpoint:**
```
GET /web/query.axd?type=whiteboardproduction
  &format=json
  &machines={machineid}
  &start={YYYYMMDDTHHMMSS.fff}
  &end={YYYYMMDDTHHMMSS.fff}
  &minutes=5
```

**Respuesta:**

```ts
interface WhiteboardProductionResponse {
  version: 1
  machines: Array<{
    machineId: string
    machineName: string
    comments: string[]
    currentShiftStart: string    // "20260228T110000.000"
    currentShiftEnd: string      // "20260228T181500.000"
    finishedGoodUnits: string
    inventoryUnits: string
    lineUnits: string
    machineProduction: Array<{
      cycles: number             // piezas reales en el intervalo
      expectedCycles: number     // piezas esperadas (según tasa estándar)
      total: number              // acumulado real
      expectedTotal: number      // acumulado esperado
      totalDuration: number      // ms del intervalo (300000 = 5 min)
    }>
    productionUnits: string      // "Eviscerado"
    threshold: number            // 15 = tolerancia % para coloreo
    time: string                 // timestamp respuesta
  }>
}
```

**Notas:**
- Cada elemento de `machineProduction` = 1 intervalo de `minutes` min.
- Para un turno de 9h 50min con `minutes=5` → 118 elementos.
- Colores del whiteboard:
  - Verde: `cycles >= expectedCycles * (1 - threshold/100)` (o similar)
  - Amarillo: intermedio
  - Rojo: muy bajo

---

## 4. Resumen del turno — `?type=whiteboardsummary`

**Endpoint:** `GET /web/query.axd?type=whiteboardsummary&format=json&machines={uuid}&start=...&end=...`

**Retorna:** KPIs agregados del período:
- Piezas reales / potencial (ej: `5,424 / 8,170 (66%)`)
- Piezas en verde (ej: `4,228 (78%)`)
- Piezas en amarillo (ej: `1,087 (20%)`)
- Piezas en rojo (ej: `109 (2%)`)
- Ciclo real vs objetivo (ej: `3.9s / 2.9s`)

> **Pendiente:** capturar una respuesta concreta para documentar el schema exacto (aún no tengo una muestra con datos no-null).

---

## 5. Cronología de paros — `Machine - Chrono`

**Endpoint:** configurable vía UI "MÁQUINA CHRONO"; nombre técnico por confirmar.

**Lo que muestra la UI:**
- Inicio, fin, duración del período
- Leyenda de paros con categorías:
  - Produciendo
  - COLACION
  - Paro Programado
  - Limpieza de Ducto
  - REUNION INICIO TURNO
  - Micro Detencion
  - EJERCICIO COMPENSATORIO
  - DETENCION PROGRAMADA
- Cada barra stacked representa el % de cada categoría en el intervalo

**La primera respuesta capturada** solo trae config base (`splat`, `viewName`, `machineId`). El endpoint real con los datos probablemente se dispara después y tiene otro nombre. **Pendiente:** inspeccionar con filtro `name*=chrono` o `downtime`.

---

## 6. Real-time updates — `longpolling`

**Endpoint:** `GET /web/longpolling?get&nocache={rand}&tm={ISO8601}`

**Uso:** la UI mantiene conexiones HTTP en "pending" que se resuelven cuando hay un cambio. Cada resolución trae un delta.

**Implicancia para nosotros:** si queremos datos casi-live, podemos replicar este patrón o hacer polling cada 5-10 min del endpoint de producción (más simple).

---

## 7. Otros endpoints vistos (no críticos)

| Endpoint | Propósito |
|---|---|
| `evaluatedConditions?accountGuid={guid}` | Reglas de alarma evaluadas |
| `abn.statInfo?tm={ISO}` | Stats de anormalidades |
| `userpinstatus?userId={uuid}` | Estado del PIN del usuario |
| `licensing` | Verificación de licencia |
| `postEvent` | Envío de eventos del cliente (analítica) |
| `log` | Logging del cliente |
| `tell` | ¿? — por confirmar |
| `walkme` | Tercero (onboarding/tours) — ignorar |

---

## 8. Formato de timestamps

Shoplogix usa un formato ISO-like compacto: `YYYYMMDDTHHMMSS.fff`

Ejemplos:
- `20260226T090000.000` → 2026-02-26 09:00:00.000
- `20260228T181500.000` → 2026-02-28 18:15:00.000

**Conversión JS:**
```ts
function parseShoplogixTime(s: string): Date {
  // "20260226T090000.000" → "2026-02-26T09:00:00.000Z"
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}.${s.slice(16,19)}Z`
  return new Date(iso)
}

function toShoplogixTime(d: Date): string {
  const pad = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
}
```

---

## 9. Versión de la plataforma

- **Shoplogix Whiteboard:** v2026.0.0.3247 (visible en esquina inferior derecha)
- **Tenant:** `saas139.shoplogix.com` (instancia SaaS dedicada)
- **Server:** ASP.NET (dado `.axd` handler)

---

## 10. Próximos pasos

1. Capturar respuesta de `whiteboardsummary` con datos reales.
2. Identificar el endpoint real de Machine-Chrono con datos.
3. Decidir estrategia de auth: replicar login o pedir API oficial a Shoplogix.
4. Ver plan de integración: [SHOPLOGIX_INTEGRATION_PLAN.md](./SHOPLOGIX_INTEGRATION_PLAN.md)
