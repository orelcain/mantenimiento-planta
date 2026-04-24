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

**Validado con datos reales** (Feb 26 2026, Evisceradora 1, 29 kB).

**Schema:**

```ts
interface WhiteboardSummaryResponse {
  version: 1
  machines: Array<{
    machineId: string
    machineName: string
    time: string                      // timestamp respuesta
    threshold: number                 // 15 = % tolerancia coloreo

    // Unidades
    finishedGoodUnits: string
    inventoryUnits: string
    lineUnits: string
    productionUnits: string           // "Eviscerado"
    productionMachine: boolean

    // Turno
    currentShiftStart: string         // "20260228T080000.000"
    currentShiftEnd: string           // "20260228T151500.000"

    // OEE métricas
    runtimeVariance: number           // -0.0083 (negativo = bajo expected)
    expectedRuntime: number           // 0.1035 (fracción del día)
    actualRuntime: number             // 0.1118

    // 🔥 Estados/paros del turno — los 81 segmentos del Gantt
    machineStates: Array<MachineState>

    comments: string[]                // anotaciones del operador
    cameras: unknown[]                // configuración de cámaras
    autoEnforceStatusReasons: boolean
  }>
}

interface MachineState {
  name: 'Produciendo' | 'Detencion' | 'Micro Detencion' | string
  reason: string                      // "REUNION INICIO TURNO" | "" | "COLACION"
  reasonRootCause: boolean
  reasonRootCauseName: string
  statusColor: string                 // "ff0000" (rojo) | "008000" (verde) | "73d8ff" (celeste)
  reasonColor: string
  acceptsReason: boolean              // si puede recibir justificación del operador
  reasonExceeded: boolean             // si se pasó del tiempo permitido para la razón
  setupExceeded: boolean
  type: 'Uptime' | 'Downtime' | 'Break' | string
  current: boolean                    // si es el estado en curso
  start: string                       // "20260226T090000.000"
  end: string
  startMilli: number                  // 1772096400000 (Unix ms)
  endMilli: number
  durationMilli: number
}
```

**Categorías de paros observadas (Feb 26, Evisceradora 1):**
- `Produciendo` (type: Uptime) — verde
- `Detencion` con `reason: "REUNION INICIO TURNO"` (type: Break)
- `Detencion` con `reason: "COLACION"` (type: Break)
- `Detencion` con `reason: "Paro Programado"` (type: Break)
- `Detencion` con `reason: "Limpieza de Ducto"`
- `Micro Detencion` (type: Downtime) — celeste, <5 min
- `Detencion` con `reason: ""` (sin categorizar — el operador aún no justificó)

**Insight clave:** este es el dato más valioso de toda la API. Reemplaza nuestro detector de pausas casero del módulo Grader cuando se aplica a las Evisceradoras (upstream).

---

## 5. Cronología de paros — `Machine - Chrono`

**Conclusión tras inspección:** el Machine-Chrono en sí solo trae configuración de la vista (`splat`, `viewName`, `machineId`). **Los datos reales de paros están en `whiteboardsummary.machines[0].machineStates`** (sección 4). No se necesita un endpoint aparte — el summary ya los incluye.

**Diferencia:**
- **whiteboardproduction:** intervalos regulares de N min (para barras de producción)
- **whiteboardsummary.machineStates:** segmentos de duración variable por estado (para Gantt)

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

1. ~~Capturar respuesta de `whiteboardsummary` con datos reales.~~ ✅ Fixture `scripts/fixtures/feb26-summary-Evisceradora_1.json` (29 kB, 81 machineStates)
2. ~~Identificar el endpoint real de Machine-Chrono con datos.~~ ✅ No existe endpoint separado — los datos están en `summary.machineStates`
3. **Pendiente:** decidir estrategia de auth — replicar login o pedir API oficial a Shoplogix.
4. Ver plan de integración: [SHOPLOGIX_INTEGRATION_PLAN.md](./SHOPLOGIX_INTEGRATION_PLAN.md)

## 11. Observaciones operacionales (2026-04-24)

- Al correr el POC en Abr 24, la API devolvió **0 intervalos para hoy y ayer**. Los últimos datos productivos están en **Feb 28** (`currentShift` en todos los responses apunta a esa fecha).
- La planta parece estar en **temporada baja** (sin turnos productivos actuales).
- Para pruebas y desarrollo usar rango histórico Feb 25-28. Para producción futura, validar que la API siga respondiendo cuando reinicien operaciones.
- La cuenta de sesión observada: `javier.toro@aquachile.com`, `customer: AquaChile SA Plantas`, account: `AquaChile SA Planta Chonchi`, accesos: `analytics_designer`, `analytics_viewer`.
