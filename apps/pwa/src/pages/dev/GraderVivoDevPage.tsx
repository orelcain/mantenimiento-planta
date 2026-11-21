/**
 * Banco de pruebas de «Grader en vivo» (pestaña Grader del monitor, E-A). SOLO DEV: la ruta no se registra en
 * producción (ver App.tsx).
 *
 * Monta `GraderVivo` con el turno REAL del 19-11 T2 de Chonchi (piezas, Gate 0 y kg por minuto del Pieza pieza
 * cargado por Excel, la serie por minuto de las 3 Baader y las paradas de Shoplogix), cortado a la hora que se elija,
 * sin Firestore ni login. El calibre y la calidad por minuto se reparten con la proporción real del turno.
 */
import { useMemo, useState } from 'react'
import '@/pages/monitor/monitorGlass.css'
import real from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-19-turno2-minutos.json'
import type { CubetaMinuto } from '@/services/grader/espejo/espejoMinutos'
import { GraderVivo } from '@/pages/monitor/GraderVivo'
import type { ParadaGrader } from '@/pages/monitor/graderVivoDatos'
import { EspejoGraderCard } from '@/components/grader/EspejoGraderCard'
import { LecturaEnVivoFila } from '@/components/grader/LecturaEnVivo'
import type { EstadoVivo } from '@/services/grader/espejo/lecturaVivo'

/** E1.4: la tarjeta del espejo con la lectura en vivo a pedido en sus cuatro estados (sin Firestore). */
const MODOS_VIVO: Array<{ estado: EstadoVivo; version: string }> = [
  { estado: { modo: 'normal', hastaMs: null }, version: 'e1.4' },
  { estado: { modo: 'pedido', hastaMs: Date.now() + 15 * 60_000 }, version: 'e1.4' },
  { estado: { modo: 'vivo', hastaMs: Date.now() + 12 * 60_000 }, version: 'e1.4' },
  { estado: { modo: 'sin-soporte', hastaMs: Date.now() + 15 * 60_000 }, version: 'e1.3' },
]

const T0 = Date.parse(real.t0)
const PROGRAMADA = /COLACION|REUNION|EJERCICIO|Limpieza/i

function cubetas(hasta: number): CubetaMinuto[] {
  const totCal = Object.values(real.calibreTurno).reduce((a, b) => a + b, 0)
  const totCal2 = Object.values(real.calidadTurno).reduce((a, b) => a + b, 0)
  const out: CubetaMinuto[] = []
  for (let m = 0; m < hasta; m++) {
    const pz = real.grader[m] ?? 0
    if (pz <= 0) continue
    const g0 = real.g0[m] ?? 0
    const sal = pz - g0
    const lote = m < 209 ? '720260738' : '720260739' // cambio real de lote a las 10:44
    out.push({
      ms: T0 + m * 60_000,
      pz,
      g0,
      kgSalida: real.kgSalida[m] ?? 0,
      pzPeso: sal,
      calibre: Object.fromEntries(Object.entries(real.calibreTurno).map(([k, v]) => [k, (sal * v) / totCal])),
      calidad: Object.fromEntries(Object.entries(real.calidadTurno).map(([k, v]) => [k, (sal * v) / totCal2])),
      lotes: { [lote]: pz },
      ultimoLote: lote,
      ultimaTs: new Date(T0 + m * 60_000 + 59_000).toISOString(),
    })
  }
  return out
}

const PARADAS: ParadaGrader[] = real.paradas.map((p) => ({
  desdeMs: p.desdeMs,
  hastaMs: p.hastaMs,
  dueno: PROGRAMADA.test(p.causa) ? 'programado' : 'externo',
}))

export default function GraderVivoDevPage() {
  const [hasta, setHasta] = useState(215) // 10:50
  const c = useMemo(() => cubetas(hasta), [hasta])
  const baader = useMemo(() => ({ desde: real.t0, maquinas: [{ cycles: real.baader.slice(0, Math.max(0, hasta - 2)) }] }), [hasta])
  return (
    // `data-glass="v2"` + `<main>`: el mismo material de vidrio que la pestaña tiene en el monitor público.
    <div className="min-h-screen bg-background p-4 text-foreground" data-glass="v2">
      <main className="mx-auto max-w-3xl space-y-3 lg:max-w-[1200px]">
        <label className="flex items-center gap-3 text-footnote text-muted-foreground">
          Hora de la vista
          <input
            id="hasta"
            type="range"
            min={30}
            max={real.grader.length}
            value={hasta}
            onChange={(e) => setHasta(Number(e.target.value))}
            className="flex-1"
          />
          <span className="tabular-nums">{new Date(T0 + hasta * 60_000).toISOString().slice(11, 16)}</span>
        </label>
        <GraderVivo
          cubetas={c}
          inicioMs={T0}
          finMs={Date.parse('2026-11-19T15:00:00.000Z')}
          baader={baader}
          paradas={PARADAS}
          minutosSinLatido={1}
          turnoEnCurso
        />
        <div className="grid gap-3 lg:grid-cols-2" data-testid="dev-lectura-en-vivo">
          {MODOS_VIVO.map((m) => (
            <EspejoGraderCard
              key={m.estado.modo}
              estado={{ equipo: 'CH-MANT-P07', linea: 'chonchi', ultimoLatidoMs: Date.now() - 60_000, leidoEn: '2026-11-19T10:49:12-03:00', informe: 'pieza', estado: { version: m.version } }}
              vivo
              minutos={1}
              resumen={{ piezas: [], total: 4812, gate0: 0, p0: null, primera: '07:20:05', ultima: '10:49:00', turno: null, coincidencia: null }}
              accion={<LecturaEnVivoFila estado={m.estado} pedidoNombre="Orel" version={m.version} ocupado={false} error={null} onPedir={() => {}} onTerminar={() => {}} />}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
