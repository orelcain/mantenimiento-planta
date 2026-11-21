/**
 * Banco de pruebas de «Grader en vivo» (pestaña Grader del monitor, E-A). SOLO DEV: la ruta no se registra en
 * producción (ver App.tsx).
 *
 * Monta `GraderVivo` con el turno REAL del 19-11 T2 de Chonchi (piezas, Gate 0 y kg por minuto del Pieza pieza
 * cargado por Excel, la serie por minuto de las 3 Baader y las paradas de Shoplogix), cortado a la hora que se elija,
 * sin Firestore ni login. El calibre y la calidad por minuto se reparten con la proporción real del turno.
 */
import { useEffect, useMemo, useState } from 'react'
import urlPiezas from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-19-turno_2.json.gz?url'
import resumenes from '@/services/grader/espejo/__fixtures__/chonchi-resumenes-16-al-18-11.json'
import type { PiezaEspejo } from '@/services/grader/espejo/espejoFilas'
import type { CalibreRange, GraderDailySummary } from '@/services/grader/types'
import '@/pages/monitor/monitorGlass.css'
import real from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-19-turno2-minutos.json'
import type { CubetaMinuto } from '@/services/grader/espejo/espejoMinutos'
import { GraderVivo } from '@/pages/monitor/GraderVivo'
import type { ParadaGrader } from '@/pages/monitor/graderVivoDatos'

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

/** Las piezas reales del 19-11 T2 (todas, con gate y peso), del .gz de los tests. */
function usePiezasReales(): PiezaEspejo[] | null {
  const [p, setP] = useState<PiezaEspejo[] | null>(null)
  useEffect(() => {
    let vivo = true
    void (async () => {
      // El servidor de Vite manda el .gz con `Content-Encoding: gzip` y el navegador ya lo abre: solo se
      // descomprime si llegan los bytes gzip (1f 8b).
      const buf = new Uint8Array(await (await fetch(urlPiezas)).arrayBuffer())
      const txt = buf[0] === 0x1f && buf[1] === 0x8b
        ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : new TextDecoder().decode(buf)
      const raw = JSON.parse(txt) as { t0: string; dic: Record<'calidad' | 'calibre' | 'conservacion' | 'producto' | 'lote', string[]>; filas: number[][] }
      const t0 = Date.parse(raw.t0)
      const out = raw.filas.map(([s, gate, g, n, q, c, co, pr, l]): PiezaEspejo => {
        const ts = new Date(t0 + s! * 1000).toISOString()
        return { cadena: `${ts}#${gate}#${g}`, ts, fecha: ts.slice(0, 10), hora: ts.slice(11, 19), pesoKg: g! / 1000, cantidad: n!, lote: raw.dic.lote[l!] ?? '', gate: gate!, calidad: raw.dic.calidad[q!] ?? '', conservacion: raw.dic.conservacion[co!] ?? '', calibre: (raw.dic.calibre[c!] ?? '') as CalibreRange, producto: raw.dic.producto[pr!] ?? '', turnoMatrix: '' }
      })
      if (vivo) setP(out)
    })()
    return () => { vivo = false }
  }, [])
  return p
}

export default function GraderVivoDevPage() {
  const [hasta, setHasta] = useState(215) // 10:50
  const c = useMemo(() => cubetas(hasta), [hasta])
  const todas = usePiezasReales()
  const piezas = useMemo(() => {
    if (!todas) return undefined
    const lim = new Date(T0 + hasta * 60_000).toISOString()
    return todas.filter((p) => p.ts < lim)
  }, [todas, hasta])
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
          piezas={piezas}
          resumenes={resumenes as unknown as GraderDailySummary[]}
          turnoActualId="2026-11-19__Turno 2"
        />
      </main>
    </div>
  )
}
