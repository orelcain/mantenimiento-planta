# Plan técnico — Análisis Grader · FASES 25 a 27

> **Autor:** Opus 4.7 (plan) · **Ejecutor:** Sonnet 4.6 (código)
> **Fecha plan:** 2026-04-18
> **Base de partida:** v2.126.0 post-FASE 24 (9 causas P0 + tooltips ya desplegado)
> **Módulo:** `apps/pwa/src/services/grader/` + `apps/pwa/src/components/grader/` + `apps/pwa/src/pages/AnalisisGrader/`

---

## 0. Contexto y objetivos

### Qué se logró hasta FASE 24

- 4 causas OFICIALES Matrix separadas (too_close_too_long independiente)
- 5 causas DERIVADAS como sub-clasificación de "fuera de límites"
- Tooltips enriquecidos por causa
- Classifier jerárquico base: `classifyRecordToMatrix(record, activeGates, weightRanges)`

### Lo que falta (estas 3 fases)

1. **FASE 25** — El classifier actual sabe distinguir calibre y calidad, pero ignora **conservación** (FRESCO/CONGELADO) y **producto** (HG/DESTINO FILETE) que vienen en el Excel. Sin esto, las causas `fuera_de_conservacion` y `fuera_de_producto` siempre serán 0%.

2. **FASE 26** — Los turnos históricos guardados antes del schema change no se reclasifican retroactivamente. Necesitamos una herramienta que los re-procese con la lógica nueva.

3. **FASE 27** — La config de gates cambia DURANTE el turno (no solo al final). Sin un log cronológico de esos cambios, no podemos clasificar correctamente una pieza según la config vigente en SU timestamp.

### Dependencias entre fases

```
FASE 25 ─────────────────────────┐
   (independiente, arranca ya)   │
                                  ↓
FASE 27 ─────────────────────────┤  ejecutar 27 ANTES de 26 si se puede
   (nueva infra: log cronológico)│  porque 26 se beneficia del log real
                                  │  cuando existe (se mezcla con inferencia
                                  │  para turnos sin log)
                                  ↓
FASE 26 ─────────────────────────┘
   (reclasificador: usa FASE 25 + log FASE 27 si está)
```

Orden sugerido: **25 → 27 → 26** (en esta sesión una tras otra con Sonnet, ~5h total).

---

## 1. FASE 25 — Captura de conservación y producto (1h)

### Objetivo
Extender el parser y el classifier para que consideren las 4 dimensiones completas: **calibre × calidad × conservación × producto**.

### 1.1 Archivos a modificar

#### `apps/pwa/src/services/grader/types.ts`

Agregar tipos y extender interfaces:

```ts
// Nuevos tipos (arriba, junto a GraderQuality)
export type GraderConservation = 'CONGELADO' | 'FRESCO' | 'OTRO'
export type GraderProduct = 'HG' | 'DESTINO FILETE' | 'OTRO'

// Extender PieceRecord (línea ~689)
export interface PieceRecord {
  // ... campos existentes
  conservation?: GraderConservation  // NUEVO — columna "Conservacion" del Excel
  // product ya existe pero era string plano — tipar mejor:
  product?: GraderProduct | string  // compat: acepta strings legacy
}

// Idem para Gate0Record (línea ~706)
export interface Gate0Record {
  // ... campos existentes
  conservation?: GraderConservation  // NUEVO
  product?: GraderProduct | string   // NUEVO
}

// Extender GateAssignment (línea ~651) — config de gate con 4 dimensiones
export interface GateAssignment {
  gateNumber: number
  assignedCalibre: CalibreRange
  assignedQuality: GraderQuality
  assignedConservation?: GraderConservation  // NUEVO (opcional para backward compat)
  assignedProduct?: GraderProduct            // NUEVO (opcional)
  active: boolean
}
```

**Nota compat:** `assignedConservation` y `assignedProduct` son opcionales. Si un turno antiguo no los tiene, el classifier salta el chequeo de esas dimensiones (no genera `fuera_de_conservacion` ni `fuera_de_producto`).

#### `apps/pwa/src/services/grader/graderExcelParser.ts`

Extender el parser de **pieza-pieza** para leer las columnas H ("Conservacion") y J ("Producto").

Estructura confirmada del Excel pieza-pieza (ver `memory/reference_grader_excels.md`):
- Header en fila 8, datos desde fila 9
- Col A: Fecha, B: Hora, C: Peso, D: Cantidad, E: Lote, F: Gate, G: Calidad, **H: Conservacion**, I: Calibre, **J: Producto**, K: Turno

Cambios en el parser:

```ts
// Buscar función que parse una fila de pieza-pieza (probablemente parsePieceRow)
// Agregar lectura de H y J:

function parsePieceRow(row, colIndex): PieceRecord {
  // ... lectura existente
  const conservation = normalizeConservation(row[colIndex.conservacion])
  const product = normalizeProduct(row[colIndex.producto])
  return {
    // ... campos existentes
    conservation,
    product,
  }
}

function normalizeConservation(raw: unknown): GraderConservation | undefined {
  const s = String(raw ?? '').trim().toUpperCase()
  if (s === 'CONGELADO' || s === 'FROZEN') return 'CONGELADO'
  if (s === 'FRESCO' || s === 'FRESH') return 'FRESCO'
  if (s === '' || s === '-') return undefined
  return 'OTRO'
}

function normalizeProduct(raw: unknown): GraderProduct | string | undefined {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s || s === '-') return undefined
  if (s === 'HG') return 'HG'
  if (s === 'DESTINO FILETE' || s === 'FILETE') return 'DESTINO FILETE'
  return s  // producto legacy/desconocido se preserva como string
}
```

**Importante:** el parser de **Puerta 0** (`punto 0`) NO tiene las mismas columnas — solo timestamp, peso, error. Los `Gate0Record` quedan con `conservation=undefined` y `product=undefined` a menos que se mezclen con pieceRecords por timestamp (fuera de scope aquí).

#### `apps/pwa/src/services/grader/graderAnalytics.ts`

Extender `classifyRecordToMatrix` (línea ~450-500) con los niveles 2d y 2e que ya están documentados como "preparado":

```ts
function classifyRecordToMatrix(
  record: Gate0Record | (Gate0Record & { error: string }),
  activeGates: GateAssignment[],
  weightRanges: CalibreWeightRange[],
): MatrixP0Cause {
  // (1) y (2a)-(2c) ya existen (calibre + calidad)

  // ═══ NUEVO ═══
  // (2d) Calidad OK, chequear conservación
  if (record.conservation && activeGates.length > 0) {
    const combosWithConservation = activeGates.some(g =>
      g.assignedCalibre === matchedRange.calibre &&
      g.assignedQuality === record.quality &&
      g.assignedConservation === record.conservation,
    )
    // Solo marcar si alguna gate tiene conservación configurada
    // (si TODAS las gates tienen assignedConservation undefined, skip)
    const anyGateHasConservation = activeGates.some(g => g.assignedConservation)
    if (anyGateHasConservation && !combosWithConservation) return 'fuera_de_conservacion'
  }

  // (2e) Conservación OK, chequear producto
  if (record.product && activeGates.length > 0) {
    const combosFull = activeGates.some(g =>
      g.assignedCalibre === matchedRange.calibre &&
      g.assignedQuality === record.quality &&
      (!record.conservation || g.assignedConservation === record.conservation) &&
      g.assignedProduct === record.product,
    )
    const anyGateHasProduct = activeGates.some(g => g.assignedProduct)
    if (anyGateHasProduct && !combosFull) return 'fuera_de_producto'
  }

  // (2f) Residual físico genuino
  return 'fuera_de_limites'
}
```

#### `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderGatesConfigPage.tsx`

Extender la UI de config de gates con **2 dropdowns adicionales** por gate:
- Dropdown "Conservación": CONGELADO · FRESCO · (sin filtro)
- Dropdown "Producto": HG · DESTINO FILETE · (sin filtro)

Buscar la tabla de gates (12 filas con columnas GATE · CALIBRE · RANGO (G) · CALIDAD · ACTIVO) y agregar 2 columnas nuevas antes de ACTIVO:

```tsx
// Header:
<th>CONSERVACIÓN</th>
<th>PRODUCTO</th>

// Cada fila:
<td>
  <Select
    value={gate.assignedConservation ?? '__any'}
    onValueChange={(v) => updateGate(gate.gateNumber, { assignedConservation: v === '__any' ? undefined : v })}
  >
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="__any">Cualquiera</SelectItem>
      <SelectItem value="CONGELADO">Congelado</SelectItem>
      <SelectItem value="FRESCO">Fresco</SelectItem>
    </SelectContent>
  </Select>
</td>
<td>
  <Select
    value={gate.assignedProduct ?? '__any'}
    onValueChange={(v) => updateGate(gate.gateNumber, { assignedProduct: v === '__any' ? undefined : v })}
  >
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="__any">Cualquiera</SelectItem>
      <SelectItem value="HG">HG</SelectItem>
      <SelectItem value="DESTINO FILETE">Destino filete</SelectItem>
    </SelectContent>
  </Select>
</td>
```

### 1.2 Tests a agregar

`apps/pwa/src/services/grader/__tests__/graderAnalytics.test.ts` (crear si no existe):

```ts
describe('classifyRecordToMatrix (FASE 25)', () => {
  it('clasifica fuera_de_conservacion cuando calibre y calidad calzan pero FRESCO/CONGELADO no', () => {
    const record = { pieces: 1, weightKg: 3, quality: 'Premium', conservation: 'FRESCO', error: 'Fuera de límites' }
    const gates = [
      { gateNumber: 1, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', assignedConservation: 'CONGELADO', active: true },
    ]
    expect(classifyRecordToMatrix(record, gates, CALIBRE_WEIGHT_RANGES)).toBe('fuera_de_conservacion')
  })

  it('clasifica fuera_de_producto cuando 3 dimensiones calzan pero producto no', () => { /* ... */ })

  it('respeta backward compat: gates sin conservación configurada NO marcan fuera_de_conservacion', () => { /* ... */ })
})
```

### 1.3 DoD FASE 25

- [ ] `types.ts`: `GraderConservation`, `GraderProduct`, `PieceRecord.conservation`, `Gate0Record.conservation/product`, `GateAssignment.assignedConservation/Product`
- [ ] `graderExcelParser.ts`: lee columnas H y J de pieza-pieza, normaliza strings
- [ ] `graderAnalytics.ts`: classifier extendido con niveles 2d y 2e
- [ ] `AnalisisGraderGatesConfigPage.tsx`: 2 dropdowns nuevos por gate (tab "12 Gates")
- [ ] Tests unitarios nuevos en `graderAnalytics.test.ts` (4+ casos)
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npx eslint . --max-warnings 10` exit 0
- [ ] `npx vitest run` todos los tests passing
- [ ] Bump versión a **2.127.0**
- [ ] Commit: `feat(grader): FASE 25 - captura conservación y producto del Excel`
- [ ] CI verde confirmado

### 1.4 Qué NO tocar en FASE 25

- Datos históricos (FASE 26)
- Log de config por turno (FASE 27)
- Benchmark JSON (no hay cambios estructurales, los % pueden quedar igual por ahora)

---

## 2. FASE 27 — Log cronológico de config de gates (1.5h)

> **Nota:** ejecutar FASE 27 ANTES de FASE 26 porque la 26 se apoya en el log cuando existe.

### Objetivo
Cada cambio de config de gates durante un turno se persiste con timestamp. Al clasificar una pieza, se usa la config vigente en SU timestamp, no la config final del turno.

### 2.1 Esquema Firestore

Nueva sub-colección:

```
graderShifts/{dateKey}__{shiftId}/
  └─ configHistory/{snapshotId}         (sub-colección NUEVA)
      fields:
        id: string (uuid)
        at: string (ISO timestamp del cambio)
        changedBy: { uid, name }
        reason: string | null (comentario opcional)
        gates: GateAssignment[]         (estado COMPLETO de las 12 gates)
        changes: ConfigDiff[]           (diff vs snapshot anterior)
```

Regla Firestore (agregar a `firestore.rules`):

```
match /graderShifts/{shiftId}/configHistory/{snapshotId} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated();
  allow update, delete: if isAdmin();  // snapshots son inmutables una vez creados
}
```

### 2.2 Archivos a crear

#### `apps/pwa/src/services/grader/graderConfigSnapshot.service.ts`

```ts
import { doc, collection, getDocs, setDoc, query, orderBy, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { GateAssignment } from './types'

export interface ConfigDiff {
  gateNumber: number
  field: 'assignedCalibre' | 'assignedQuality' | 'assignedConservation' | 'assignedProduct' | 'active'
  before: unknown
  after: unknown
}

export interface GateConfigSnapshot {
  id: string
  shiftDocId: string   // `${dateKey}__${shiftId}`
  at: string           // ISO timestamp
  changedBy: { uid: string; name: string }
  reason?: string
  gates: GateAssignment[]
  changes: ConfigDiff[]
}

const SUBCOLLECTION = 'configHistory'

/** Calcula el diff entre dos estados de gates */
export function computeGatesDiff(before: GateAssignment[], after: GateAssignment[]): ConfigDiff[] {
  const diffs: ConfigDiff[] = []
  const byNumber = new Map(before.map(g => [g.gateNumber, g]))
  for (const next of after) {
    const prev = byNumber.get(next.gateNumber)
    if (!prev) continue
    const fields: Array<keyof GateAssignment> = ['assignedCalibre', 'assignedQuality', 'assignedConservation', 'assignedProduct', 'active']
    for (const f of fields) {
      if (prev[f] !== next[f]) {
        diffs.push({ gateNumber: next.gateNumber, field: f as ConfigDiff['field'], before: prev[f], after: next[f] })
      }
    }
  }
  return diffs
}

/** Guarda un snapshot nuevo (solo si hay cambios) */
export async function saveConfigSnapshot(
  shiftDocId: string,
  newGates: GateAssignment[],
  user: { uid: string; name: string },
  reason?: string,
): Promise<GateConfigSnapshot | null> {
  const previous = await getLatestSnapshot(shiftDocId)
  const changes = previous ? computeGatesDiff(previous.gates, newGates) : []
  // Si no es el primer snapshot y no hay cambios reales, no guardar
  if (previous && changes.length === 0) return null
  const snapshot: GateConfigSnapshot = {
    id: crypto.randomUUID(),
    shiftDocId,
    at: new Date().toISOString(),
    changedBy: user,
    reason,
    gates: [...newGates],
    changes,
  }
  const ref = doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, snapshot.id)
  await setDoc(ref, snapshot)
  return snapshot
}

/** Lista snapshots de un turno ordenados cronológicamente */
export async function listSnapshots(shiftDocId: string): Promise<GateConfigSnapshot[]> {
  const ref = collection(db, 'graderShifts', shiftDocId, SUBCOLLECTION)
  const q = query(ref, orderBy('at', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as GateConfigSnapshot)
}

/** Devuelve el snapshot vigente en un timestamp dado (el más reciente ≤ ts) */
export async function getConfigAtTimestamp(shiftDocId: string, ts: string): Promise<GateConfigSnapshot | null> {
  const all = await listSnapshots(shiftDocId)
  // Binary search o filter+last
  const eligible = all.filter(s => s.at <= ts)
  return eligible[eligible.length - 1] ?? null
}

export async function getLatestSnapshot(shiftDocId: string): Promise<GateConfigSnapshot | null> {
  const all = await listSnapshots(shiftDocId)
  return all[all.length - 1] ?? null
}
```

### 2.3 Archivos a modificar

#### `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderGatesConfigPage.tsx`

Al guardar cambios de gates (handler `handleApplyGates`), disparar `saveConfigSnapshot` automáticamente si estamos en contexto de turno vivo:

```ts
const handleApplyGates = async (newGates: GateAssignment[]) => {
  // ... lógica existente
  // NUEVO: si hay shiftDocId activo, snapshot
  if (shiftDocId && user) {
    await saveConfigSnapshot(shiftDocId, newGates, { uid: user.uid, name: user.displayName ?? 'Anónimo' })
      .catch(err => console.warn('[FASE 27] snapshot falló, seguimos', err))
  }
}
```

El `shiftDocId` viene del contexto del turno actual. Si `GatesConfigPage` se usa dentro del `WizardPage`/home sin turno activo, `shiftDocId` queda null y no se snapshotea (la config queda en el storage de module, no en historial de turno).

#### `apps/pwa/src/services/grader/graderAnalytics.ts`

Extender `computePointZeroClassification` para aceptar un callback asíncrono que resuelve la config vigente por timestamp:

```ts
interface ComputePointZeroOptions {
  activeGates?: GateAssignment[]  // compat: config "final" del turno
  weightRanges?: CalibreWeightRange[]
  hasRealP0Data?: boolean
  // NUEVO: si está presente, se usa para cada record por timestamp
  getGatesAtTs?: (ts: string) => GateAssignment[]
}

// En el loop de classifyRecordToMatrix:
const gatesAtPieceTs = options.getGatesAtTs
  ? options.getGatesAtTs(record.ts)
  : (options.activeGates || [])
const matrixCause = classifyRecordToMatrix(record, gatesAtPieceTs, weightRanges)
```

`TurnoPage` al cargar un turno:
1. Lee todos los snapshots: `const history = await listSnapshots(shiftDocId)`
2. Pre-computa un mapa `tsToGates`: para cada snapshot, el rango de vigencia
3. Pasa `getGatesAtTs` al analytics

#### `apps/pwa/src/components/grader/ShiftTimelineView.tsx`

Agregar markers verticales en el timeline ECharts por cada cambio de config:

```ts
const configChangeLines = snapshots.slice(1).map(s => ({
  name: `Config cambió\n${formatTime(s.at)}`,
  xAxis: formatTime(s.at),
  lineStyle: { color: '#06b6d4', type: 'dashed', width: 1.5 },  // cyan
  label: { show: true, formatter: '⚙', color: '#06b6d4', fontSize: 10 },
}))
// Agregar a markLine.data junto con uploadLines y actionLines existentes
```

### 2.4 DoD FASE 27

- [ ] `graderConfigSnapshot.service.ts` creado con: `computeGatesDiff`, `saveConfigSnapshot`, `listSnapshots`, `getConfigAtTimestamp`, `getLatestSnapshot`
- [ ] `firestore.rules` actualizado con match para `graderShifts/{id}/configHistory/{id}`
- [ ] `AnalisisGraderGatesConfigPage` dispara snapshot al aplicar gates si hay shiftDocId activo
- [ ] `graderAnalytics.ts` acepta `getGatesAtTs` en opciones
- [ ] `TurnoPage` pre-carga snapshots del turno y los pasa al analytics
- [ ] `ShiftTimelineView` muestra markers verticales por cada cambio de config
- [ ] Panel "Resumen" del turno muestra "Cambios de config en el turno: N"
- [ ] Tests unitarios: `graderConfigSnapshot.test.ts` con `computeGatesDiff` y `getConfigAtTimestamp`
- [ ] Bump versión a **2.128.0**
- [ ] Commit: `feat(grader): FASE 27 - log cronológico de config de gates por turno`
- [ ] Deploy Firestore rules (`firebase deploy --only firestore:rules`)

### 2.5 Consideraciones

- **Performance:** si un turno tuvo 50 cambios de config, cargar todos los snapshots es rápido (<1s en Firestore). El `getConfigAtTimestamp` hace un filter+last sobre un array en memoria — O(n) aceptable hasta 100 snapshots.
- **Backward compat:** turnos sin snapshots usan `activeGates` del summary como antes. No rompe nada.
- **Primera carga de turno sin snapshots:** al abrir TurnoPage por primera vez tras desplegar FASE 27, un turno viejo no tiene `configHistory` — se comporta como hasta ahora (usa config "final").

---

## 3. FASE 26 — Reclasificador histórico (2.5h)

### Objetivo
Botón en PeriodoPage: **"Reclasificar turnos anteriores a FASE 21"**. Para cada turno histórico, usar los `pieceRecords` (subcolección existente) para inferir la config de gates por ventanas temporales y re-clasificar los `g0Records` con la lógica nueva.

### 3.1 Archivos a crear

#### `apps/pwa/src/services/grader/graderReclassifier.ts`

```ts
import { getDailySummary, listDailySummaries, updateDailySummary } from './graderDailySummary.service'
import { listSnapshots, saveConfigSnapshot } from './graderConfigSnapshot.service'
import { classifyRecordToMatrix } from './graderAnalytics'
import type { GateAssignment, GraderDailySummary, PieceRecord, Gate0Record } from './types'

export interface ReclassifyOptions {
  windowMinutes?: number      // tamaño ventana para inferencia (default 30)
  dominanceThreshold?: number // umbral de dominancia para considerar config confiable (default 0.75)
  minPiecesPerWindow?: number // min piezas por ventana para inferir (default 10)
  /** Si true, también escribe los snapshots inferidos al configHistory */
  writeSyntheticSnapshots?: boolean
}

export interface ReclassifyResult {
  shiftDocId: string
  schemaVersionBefore: number
  schemaVersionAfter: number
  byMatrixCauseBefore: Record<string, number>
  byMatrixCauseAfter: Record<string, number>
  inferredSnapshotsCount: number
  confidence: 'high' | 'medium' | 'low'
  error?: string
}

/** Infiere config de gates agrupando pieceRecords por ventanas temporales */
export function inferGatesHistory(
  pieceRecords: PieceRecord[],
  options: Pick<Required<ReclassifyOptions>, 'windowMinutes' | 'dominanceThreshold' | 'minPiecesPerWindow'>,
): Array<{ startTs: string; endTs: string; gates: GateAssignment[]; confidence: 'high' | 'medium' | 'low' }> {
  if (pieceRecords.length === 0) return []
  const sorted = [...pieceRecords].sort((a, b) => a.ts.localeCompare(b.ts))
  const windowMs = options.windowMinutes * 60_000

  // Split en ventanas
  const windows: PieceRecord[][] = []
  let current: PieceRecord[] = [sorted[0]]
  let windowStart = new Date(sorted[0].ts).getTime()
  for (let i = 1; i < sorted.length; i++) {
    const t = new Date(sorted[i].ts).getTime()
    if (t - windowStart > windowMs) {
      windows.push(current)
      current = []
      windowStart = t
    }
    current.push(sorted[i])
  }
  if (current.length > 0) windows.push(current)

  // Por cada ventana, inferir config de gates
  const result = []
  for (const w of windows) {
    if (w.length < options.minPiecesPerWindow) continue
    const gates: GateAssignment[] = []
    let overallConfidence: 'high' | 'medium' | 'low' = 'high'

    for (let gateNum = 1; gateNum <= 12; gateNum++) {
      const pzGate = w.filter(p => p.gate === gateNum)
      if (pzGate.length < options.minPiecesPerWindow) continue  // gate no vista esa ventana
      // Agrupar por combo (calibre, calidad, conservation, product)
      const combos = new Map<string, number>()
      for (const p of pzGate) {
        const key = `${p.calibre}|${p.quality}|${p.conservation ?? ''}|${p.product ?? ''}`
        combos.set(key, (combos.get(key) ?? 0) + 1)
      }
      // Top combo
      const entries = Array.from(combos.entries()).sort((a, b) => b[1] - a[1])
      const [topKey, topCount] = entries[0]
      const dominance = topCount / pzGate.length
      const [calibre, quality, conservation, product] = topKey.split('|')
      gates.push({
        gateNumber: gateNum,
        assignedCalibre: calibre as any,
        assignedQuality: quality as any,
        assignedConservation: conservation || undefined,
        assignedProduct: product || undefined,
        active: true,
      } as GateAssignment)
      if (dominance < options.dominanceThreshold) overallConfidence = 'low'
      else if (dominance < 0.9 && overallConfidence !== 'low') overallConfidence = 'medium'
    }

    result.push({
      startTs: w[0].ts,
      endTs: w[w.length - 1].ts,
      gates,
      confidence: overallConfidence,
    })
  }

  // Merge ventanas contiguas con mismo config (reducción de ruido)
  return mergeContiguousWindows(result)
}

function mergeContiguousWindows(
  windows: Array<{ startTs: string; endTs: string; gates: GateAssignment[]; confidence: 'high' | 'medium' | 'low' }>,
): typeof windows {
  if (windows.length <= 1) return windows
  const merged = [windows[0]]
  for (let i = 1; i < windows.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = windows[i]
    if (gatesEqual(prev.gates, curr.gates)) {
      // extender el anterior
      prev.endTs = curr.endTs
      if (curr.confidence === 'low') prev.confidence = 'low'
      else if (curr.confidence === 'medium' && prev.confidence !== 'low') prev.confidence = 'medium'
    } else {
      merged.push(curr)
    }
  }
  return merged
}

function gatesEqual(a: GateAssignment[], b: GateAssignment[]): boolean {
  if (a.length !== b.length) return false
  const byNum = new Map(a.map(g => [g.gateNumber, g]))
  for (const g of b) {
    const other = byNum.get(g.gateNumber)
    if (!other) return false
    if (
      other.assignedCalibre !== g.assignedCalibre ||
      other.assignedQuality !== g.assignedQuality ||
      other.assignedConservation !== g.assignedConservation ||
      other.assignedProduct !== g.assignedProduct
    ) return false
  }
  return true
}

/** Reclasifica un turno completo */
export async function reclassifyShift(
  shiftDocId: string,
  options: ReclassifyOptions = {},
): Promise<ReclassifyResult> {
  const opts = {
    windowMinutes: options.windowMinutes ?? 30,
    dominanceThreshold: options.dominanceThreshold ?? 0.75,
    minPiecesPerWindow: options.minPiecesPerWindow ?? 10,
    writeSyntheticSnapshots: options.writeSyntheticSnapshots ?? false,
  }

  // 1) Cargar summary + pieceRecords + gate0Records
  const [dateKey, shiftId] = shiftDocId.split('__')
  const summary = await getDailySummary(dateKey, decodeURIComponent(shiftId))
  if (!summary) throw new Error(`Summary no encontrado: ${shiftDocId}`)
  const { pieceRecords, gate0Records } = await loadShiftRawRecords(shiftDocId)

  // 2) Preferir snapshots reales (FASE 27) si existen
  let snapshots = await listSnapshots(shiftDocId)

  // 3) Si no hay snapshots reales, inferir
  let inferredCount = 0
  if (snapshots.length === 0) {
    const inferred = inferGatesHistory(pieceRecords, opts)
    if (opts.writeSyntheticSnapshots) {
      for (const w of inferred) {
        await saveConfigSnapshot(shiftDocId, w.gates, { uid: 'system', name: 'Reclasificador inferido' }, `Inferencia FASE 26 (confidence=${w.confidence})`)
        inferredCount++
      }
      snapshots = await listSnapshots(shiftDocId)
    } else {
      // Mapa en memoria
      snapshots = inferred.map(w => ({
        id: `inferred-${w.startTs}`,
        shiftDocId,
        at: w.startTs,
        changedBy: { uid: 'system', name: 'Reclasificador inferido' },
        gates: w.gates,
        changes: [],
      }))
      inferredCount = inferred.length
    }
  }

  // 4) Helper: config vigente por timestamp
  const getGatesAtTs = (ts: string): GateAssignment[] => {
    const eligible = snapshots.filter(s => s.at <= ts)
    return eligible[eligible.length - 1]?.gates ?? []
  }

  // 5) Reclasificar cada g0Record
  const newByMatrixCause: Record<string, number> = {}
  for (const r of gate0Records) {
    const cause = classifyRecordToMatrix(r, getGatesAtTs(r.ts), CALIBRE_WEIGHT_RANGES)
    newByMatrixCause[cause] = (newByMatrixCause[cause] ?? 0) + r.pieces
  }

  // 6) Actualizar summary con nueva clasificación + schemaVersion
  const before = summary.byMatrixCause ?? {}
  await updateDailySummary(shiftDocId, {
    byMatrixCause: Object.fromEntries(
      Object.entries(newByMatrixCause).map(([k, v]) => [k, { pieces: v, pct: (v / summary.pointZeroPieces) * 100, subCauses: [] }]),
    ),
    schemaVersion: 2,
    reclassifiedAt: new Date().toISOString(),
  })

  // Determinar confidence agregado
  const confidence = snapshots.every(s => (s as any).confidence === 'high' || s.changes?.length > 0)
    ? 'high'
    : 'medium'

  return {
    shiftDocId,
    schemaVersionBefore: summary.schemaVersion ?? 1,
    schemaVersionAfter: 2,
    byMatrixCauseBefore: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, (v as any).pieces])),
    byMatrixCauseAfter: newByMatrixCause,
    inferredSnapshotsCount: inferredCount,
    confidence,
  }
}

async function loadShiftRawRecords(shiftDocId: string): Promise<{ pieceRecords: PieceRecord[]; gate0Records: Gate0Record[] }> {
  // Implementación: lee sub-colecciones graderDailySummaries/{shiftDocId}/pieceRecords y gate0Records
  // (ya existen helpers en graderDailySummary.service.ts — reusar)
  // Retorno: { pieceRecords, gate0Records }
  throw new Error('TODO: usar helpers existentes de graderDailySummary.service')
}
```

**Nota para Sonnet:** `loadShiftRawRecords` requiere usar helpers existentes de `graderDailySummary.service.ts` — revisar si ya hay funciones tipo `listPieceRecordsByShift` y `listGate0RecordsByShift`. Si no, crearlas (queries Firestore simples a sub-colecciones `pieceRecords` y `gate0Records` del summary).

### 3.2 UI — botón en PeriodoPage

#### `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderPeriodoPage.tsx`

Agregar sección admin (solo visible con permiso `isAdmin`):

```tsx
{isAdmin && (
  <Card className="border-amber-500/40">
    <CardHeader>
      <CardTitle className="text-sm flex items-center gap-2">
        <RefreshCcw className="w-4 h-4" />
        Reclasificación histórica
      </CardTitle>
      <CardDescription className="text-xs">
        Re-procesa turnos con schemaVersion &lt; 2 usando la lógica nueva (FASE 24+).
        Infiere config de gates por ventanas temporales cuando no hay log cronológico.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Button onClick={handleReclassify} disabled={reclassifying} className="gap-2">
        {reclassifying
          ? <><Loader2 className="w-4 h-4 animate-spin" />Reclasificando {progress.current}/{progress.total}…</>
          : <><RefreshCcw className="w-4 h-4" />Reclasificar {summariesToReclassify.length} turnos</>}
      </Button>
      {reclassifyReport && (
        <div className="mt-3 text-xs space-y-1">
          <p>✅ {reclassifyReport.ok} ok · ⚠️ {reclassifyReport.warnings} low confidence · ❌ {reclassifyReport.errors} errores</p>
          <details>
            <summary className="cursor-pointer">Ver detalle</summary>
            <pre className="text-[10px] bg-muted/40 p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(reclassifyReport, null, 2)}</pre>
          </details>
        </div>
      )}
    </CardContent>
  </Card>
)}
```

Handler:

```ts
const handleReclassify = async () => {
  setReclassifying(true)
  const results = []
  const toProcess = summariesToReclassify  // summaries con schemaVersion < 2
  for (let i = 0; i < toProcess.length; i++) {
    setProgress({ current: i + 1, total: toProcess.length })
    try {
      const result = await reclassifyShift(toProcess[i].id, { writeSyntheticSnapshots: true })
      results.push(result)
    } catch (err) {
      results.push({ shiftDocId: toProcess[i].id, error: (err as Error).message })
    }
  }
  setReclassifyReport({
    ok: results.filter(r => !r.error && r.confidence !== 'low').length,
    warnings: results.filter(r => !r.error && r.confidence === 'low').length,
    errors: results.filter(r => r.error).length,
    details: results,
  })
  setReclassifying(false)
  // Recargar aggregate para ver nuevos números
  setRange({ ...range })
}
```

### 3.3 DoD FASE 26

- [ ] `graderReclassifier.ts` creado: `inferGatesHistory`, `reclassifyShift`, `mergeContiguousWindows`
- [ ] Sección admin en PeriodoPage (solo visible con isAdmin) con botón + progress
- [ ] Reclasificador escribe snapshots sintéticos en configHistory al re-procesar
- [ ] Summaries reclasificados quedan con `schemaVersion: 2` y `reclassifiedAt`
- [ ] Tests unitarios: `graderReclassifier.test.ts` con datos sintéticos (turno con 500 piezas, 2 cambios de config forzados, validar que detecta las 2 ventanas)
- [ ] Manual test: reclasificar 1 turno real → verificar que los números suman bien
- [ ] Rate limiting: procesar secuencialmente (1 a la vez) para no saturar Firestore
- [ ] Bump versión a **2.129.0**
- [ ] Commit: `feat(grader): FASE 26 - reclasificador histórico + inferencia de ventanas temporales`

---

## 4. Orden de ejecución recomendado (Sonnet)

### Sesión 1 — FASE 25 (1h)
1. Editar types.ts → agregar tipos y extender interfaces
2. Extender graderExcelParser.ts
3. Extender classifyRecordToMatrix en graderAnalytics.ts
4. Agregar UI en AnalisisGraderGatesConfigPage.tsx
5. Tests unitarios
6. tsc + eslint + vitest
7. Bump 2.127.0 + commit + push
8. Verificar CI verde

### Sesión 2 — FASE 27 (1.5h)
1. Crear graderConfigSnapshot.service.ts
2. Actualizar firestore.rules + `firebase deploy --only firestore:rules`
3. Integrar en AnalisisGraderGatesConfigPage (snapshot on apply)
4. Extender graderAnalytics con getGatesAtTs
5. Extender TurnoPage para pre-cargar snapshots
6. Markers en ShiftTimelineView
7. Tests
8. Bump 2.128.0 + commit + push

### Sesión 3 — FASE 26 (2.5h)
1. Crear graderReclassifier.ts con inferGatesHistory + reclassifyShift
2. UI admin en PeriodoPage
3. Tests sintéticos
4. Manual test con 1 turno real
5. Bump 2.129.0 + commit + push

### Cierre (Haiku, 5 min)
- `gh run list --limit 3` confirmar CI verde
- Actualizar CLAUDE.md con changelog de FASES 25-27

---

## 5. Anexos

### Anexo A — Esquema Firestore completo post-FASES 25-27

```
graderDailySummaries/{dateKey}__{shiftId}
  fields:
    // existentes
    byMatrixCause: Record<MatrixP0Cause, {pieces, pct, subCauses}>  // 9 causas
    // nuevos FASE 26
    schemaVersion?: 2
    reclassifiedAt?: ISO
  subcolecciones:
    pieceRecords/{id}       (existente)
    gate0Records/{id}       (existente, agregar conservation + product)
    meta/timeline           (existente)

graderShifts/{dateKey}__{shiftId}
  fields existentes: uploads, actions, status
  subcolección NUEVA FASE 27:
    configHistory/{snapshotId}
      fields: id, at, changedBy, reason, gates, changes
```

### Anexo B — Criterios de confidence del reclasificador

| Confidence | Criterio |
|---|---|
| **high** | Todas las gates tienen >90% dominancia en todas las ventanas |
| **medium** | Algunas gates con dominancia 75-90%, ninguna <75% |
| **low** | Al menos 1 gate-ventana con dominancia <75% (probable reasignación mid-ventana) |

Summaries reclasificados con confidence=low aparecen con badge amber en PeriodoPage para revisión manual.

### Anexo C — Cross-referencias con código existente

- `graderConfigChangeLog.service.ts` — ya existe, revisar si tiene overlap con FASE 27. Si sí, extender en vez de crear archivo nuevo.
- `graderDailySummary.service.ts` — tiene helpers de pieceRecords que el reclasificador debe reusar.
- `graderAnalytics.ts` — `classifyRecordToMatrix` ya existe (FASE 24), extender en FASE 25.
- `CALIBRE_WEIGHT_RANGES` — constante exportada en `graderAnalytics.ts`.

### Anexo D — Rollback plan

Si FASE 26 rompe datos (ej: reclasifica mal):
1. Filtrar summaries con `schemaVersion: 2` y `reclassifiedAt > X` en Firestore console
2. Eliminar esos campos (revierten a v1 automáticamente — el UI tiene fallback)
3. Los snapshots sintéticos en configHistory son idempotentes — se pueden borrar sin impacto

Si FASE 27 rompe (snapshots corruptos):
1. Deshabilitar la feature en `AnalisisGraderGatesConfigPage` (comment el call a `saveConfigSnapshot`)
2. No se pierde data — los summaries siguen funcionando con `activeGates` del summary original

---

## 6. Checklist final consolidado

### FASE 25 — Conservación + Producto (1h)
- [ ] types.ts: 3 interfaces extendidas
- [ ] Parser lee columnas H y J
- [ ] Classifier extendido con 2d y 2e
- [ ] UI: 2 dropdowns por gate
- [ ] Tests nuevos
- [ ] v2.127.0 deployed + CI verde

### FASE 27 — Log cronológico (1.5h)
- [ ] graderConfigSnapshot.service.ts
- [ ] firestore.rules actualizadas y deployed
- [ ] Hook en GatesConfigPage al apply
- [ ] getGatesAtTs en analytics
- [ ] TurnoPage pre-carga snapshots
- [ ] Markers en timeline
- [ ] Tests
- [ ] v2.128.0 deployed + CI verde

### FASE 26 — Reclasificador histórico (2.5h)
- [ ] graderReclassifier.ts
- [ ] UI admin en PeriodoPage
- [ ] Tests sintéticos + manual real
- [ ] v2.129.0 deployed + CI verde

### Cierre
- [ ] CLAUDE.md changelog actualizado
- [ ] Memoria con sesiones documentadas
