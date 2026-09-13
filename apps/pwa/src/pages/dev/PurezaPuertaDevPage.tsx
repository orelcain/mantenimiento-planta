/**
 * Banco de pruebas de la tarjeta "Pureza por puerta". SOLO DEV — la ruta no se
 * registra en producción (ver App.tsx).
 *
 * Monta `PurezaPorPuertaCard` con un `gateMix` de ejemplo (la forma real que
 * guarda computeShiftSummary desde el PR #906) sin Firestore ni login, para
 * mirarla en ambos temas y a 375 px mientras se construye.
 */
import { useMemo, useState } from 'react'
import { PurezaPorPuertaCard } from '@/components/grader/PurezaPorPuertaCard'
import { computeGateObservations, deriveGateMix, configTimelineFromSnapshots, classifyGateCauses, derivePesoPorPuerta } from '@/services/grader/graderGateObservations'
import { CALIBRE_WEIGHT_RANGES } from '@/services/grader/graderAnalyticsThroughput'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { GateAssignment, PieceRecord } from '@/services/grader/types'

const GATES: GateAssignment[] = [
  { gateNumber: 1, assignedCalibre: '2-4 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 2, assignedCalibre: '4-6 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 3, assignedCalibre: '4-6 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 4, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 5, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 6, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 7, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 8, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 9, assignedCalibre: '10-12 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 10, assignedCalibre: '4-6 lb', assignedQuality: 'Grado', active: true },
  { gateNumber: 11, assignedCalibre: '6-8 lb', assignedQuality: 'Grado', active: true },
  { gateNumber: 12, assignedCalibre: 'Other', assignedQuality: 'Industrial', active: true },
]

/** Peso típico (g) por calibre: el centro del rango, con ±150 g de dispersión determinista. */
const PESO_TIPICO: Record<string, number> = { '2-4 lb': 1375, '4-6 lb': 2290, '6-8 lb': 3200, '8-10 lb': 4120, '10-12 lb': 5200 }

/** Piezas repartidas parejo entre `from` y `to` (wall-clock marcado como Z). `grams` fuerza el peso. */
function lote(gate: number, n: number, calibre: string, quality: PieceRecord['quality'], from: string, to: string, grams?: number): PieceRecord[] {
  const a = Date.parse(`${from}Z`)
  const b = Date.parse(`${to}Z`)
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(a + ((b - a) * i) / Math.max(1, n - 1)).toISOString(),
    gate, pieces: 1, calibre, quality,
    weightPerPieceGrams: grams ?? (PESO_TIPICO[calibre] ?? 3000) + ((i * 37) % 300) - 150,
  }))
}

function fixture(): PieceRecord[] {
  const D = '2026-09-07T'
  const ini = `${D}07:15:00`
  const fin = `${D}12:41:00`
  const recs: PieceRecord[] = [
    ...lote(1, 590, '2-4 lb', 'Premium', ini, fin), ...lote(1, 21, '4-6 lb', 'Premium', ini, fin),
    ...lote(2, 1160, '4-6 lb', 'Premium', ini, fin), ...lote(2, 44, '6-8 lb', 'Premium', ini, fin),
    // G3: la máquina manda 6-8 Premium (seteo dice 4-6): seteo ≠ máquina, no mezcla
    ...lote(3, 1120, '6-8 lb', 'Premium', ini, fin), ...lote(3, 20, '2-4 lb', 'Premium', ini, fin),
    ...lote(4, 1012, '6-8 lb', 'Premium', ini, fin), ...lote(4, 20, '8-10 lb', 'Premium', ini, fin),
    ...lote(5, 970, '6-8 lb', 'Premium', ini, fin), ...lote(5, 40, '4-6 lb', 'Premium', ini, fin),
    // G6: pura hasta las 10:30, después cae mezclada por calibre y calidad
    ...lote(6, 560, '6-8 lb', 'Premium', ini, `${D}10:29:00`),
    ...lote(6, 22, '4-6 lb', 'Premium', ini, `${D}10:29:00`),
    ...lote(6, 210, '6-8 lb', 'Premium', `${D}10:30:00`, fin),
    ...lote(6, 155, '4-6 lb', 'Premium', `${D}10:30:00`, fin),
    ...lote(6, 108, '6-8 lb', 'Grado', `${D}10:30:00`, fin),
    ...lote(6, 30, '8-10 lb', 'Premium', `${D}10:30:00`, fin),
    ...lote(6, 12, '2-4 lb', 'Premium', `${D}11:00:00`, `${D}11:40:00`),   // lejano: G1 no la tomó
    ...lote(6, 6, '4-6 lb', 'Premium', `${D}13:00:00`, `${D}13:20:00`).map((r) => ({ ...r, conservation: 'CONGELADO' as const })),
    ...lote(7, 705, '8-10 lb', 'Premium', ini, fin), ...lote(7, 37, '6-8 lb', 'Premium', ini, fin),
    ...lote(8, 620, '8-10 lb', 'Premium', ini, fin), ...lote(8, 63, '8-10 lb', 'Grado', ini, fin), ...lote(8, 22, '10-12 lb', 'Premium', ini, fin),
    // G8: la máquina etiqueta 8-10 pero pesan 4,6–4,9 kg (medido hoy: 10 %)
    ...lote(8, 70, '8-10 lb', 'Premium', `${D}09:00:00`, fin, 4700),
    ...lote(9, 308, '10-12 lb', 'Premium', ini, fin), ...lote(9, 10, '8-10 lb', 'Premium', ini, fin),
    ...lote(10, 407, '4-6 lb', 'Grado', ini, fin), ...lote(10, 31, '6-8 lb', 'Grado', ini, fin), ...lote(10, 9, '4-6 lb', 'Premium', ini, fin),
    ...lote(11, 382, '6-8 lb', 'Grado', ini, fin), ...lote(11, 20, '4-6 lb', 'Grado', ini, fin),
    ...lote(12, 268, '4-6 lb', 'Industrial', ini, fin), ...lote(12, 3, '6-8 lb', 'Grado', ini, fin),
  ]
  return recs
}

export default function PurezaPuertaDevPage() {
  const [ancho, setAncho] = useState<375 | 768 | 1024>(375)
  // v2: observación + derivación con un cambio de gate a las 10:18 (hora de
  // pared; el snapshot guarda hora real UTC, Chile en septiembre = UTC-3).
  const { gateMix, snapshots, causesFor, pesoPorPuerta } = useMemo(() => {
    const obs = computeGateObservations(fixture())!
    const g1 = GATES.map((g) => (g.gateNumber === 6 ? { ...g, assignedCalibre: '4-6 lb' } : g))
    const snapshots: GateConfigSnapshot[] = [
      { id: 'a', shiftDocId: 'dev', at: '2026-09-07T10:15:00.000Z', changedBy: { uid: 'dev', name: 'dev' }, gates: GATES, changes: [] },
      { id: 'b', shiftDocId: 'dev', at: '2026-09-07T13:18:00.000Z', changedBy: { uid: 'dev', name: 'dev' }, gates: g1, changes: [{ gateNumber: 6, field: 'assignedCalibre', before: '6-8 lb', after: '4-6 lb' }] as never, reason: 'Llegó lote chico' },
    ]
    const timeline = configTimelineFromSnapshots(snapshots, GATES)
    return {
      gateMix: deriveGateMix(obs, timeline), snapshots,
      causesFor: (g: number) => classifyGateCauses(obs, g, timeline),
      pesoPorPuerta: derivePesoPorPuerta(obs, timeline, CALIBRE_WEIGHT_RANGES),
    }
  }, [])

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-footnote">
        <span className="text-muted-foreground">Ancho:</span>
        {([375, 768, 1024] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setAncho(w)}
            className={w === ancho ? 'font-semibold text-primary underline underline-offset-4' : 'text-muted-foreground'}
          >
            {w}px
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const el = document.documentElement
            el.dataset.skin = el.dataset.skin === 'apple' ? '' : 'apple'
          }}
          className="ml-auto text-primary"
        >
          Piel Apple
        </button>
        <button
          type="button"
          onClick={() => document.documentElement.classList.toggle('dark')}
          className="text-primary"
        >
          Claro / oscuro
        </button>
      </div>
      <div style={{ maxWidth: ancho }} className="mx-auto">
        <PurezaPorPuertaCard
          gateMix={gateMix}
          gates={snapshots[snapshots.length - 1]!.gates}
          changeBuckets={gateMix.changeBuckets}
          causesFor={causesFor}
          seteoDistinto={gateMix.seteoDistinto}
          onAdoptarSeteo={(g, s) => window.alert(`Adoptar G${g}: ${s.calibre} · ${s.quality}`)}
          pesoPorPuerta={pesoPorPuerta}
          turnoLabel="07/09 · Turno 1"
        />
      </div>
    </div>
  )
}
