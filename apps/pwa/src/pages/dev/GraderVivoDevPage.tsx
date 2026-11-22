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
import { EspejoGraderCard } from '@/components/grader/EspejoGraderCard'
import { FichaEstadoLector } from '@/pages/admin/EstadoLectorEspejo'
import { LecturaEnVivoFila } from '@/components/grader/LecturaEnVivo'
import type { EstadoVivo } from '@/services/grader/espejo/lecturaVivo'

/** E1.4: la tarjeta del espejo con la lectura en vivo a pedido en sus cuatro estados (sin Firestore). */
const MODOS_VIVO: Array<{ estado: EstadoVivo; version: string }> = [
  { estado: { modo: 'normal', hastaMs: null }, version: 'e1.4' },
  { estado: { modo: 'pedido', hastaMs: Date.now() + 15 * 60_000 }, version: 'e1.4' },
  { estado: { modo: 'vivo', hastaMs: Date.now() + 12 * 60_000 }, version: 'e1.4' },
  { estado: { modo: 'sin-soporte', hastaMs: Date.now() + 15 * 60_000 }, version: 'e1.3' },
]

/** e1.6: estados de la recarga de historia con el rango de Matrix puesto a mano en días viejos. */
const RANGO_VIEJO = ['2026-11-17 00:00:00', '2026-11-19 00:00:00']
const RECARGAS = [
  { recarga: 'leyendo 12000/34145 11980', error: '', parcial: true },
  { recarga: 'con-limite', error: 'recarga-con-limite', parcial: true },
  { recarga: 'terminada 34145 2026-11-17 00:00:01 a 2026-11-18 23:59:58', error: '', parcial: false },
  { recarga: 'cancelada 4000', error: '', parcial: false },
]

const T0 = Date.parse(real.t0)
const PROGRAMADA = /COLACION|REUNION|EJERCICIO|Limpieza/i

/** `?hueco=1`: el espejo no leyó de 09:00 a 09:40 (como el 18-11 23:39 → 00:28), para ver «sin lectura». */
const HUECO: [number, number] | null = typeof location !== 'undefined' && new URLSearchParams(location.search).has('hueco') ? [105, 145] : null
/** `?publico=1`: la vista de quien no es admin. */
const PUBLICO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('publico')

function cubetas(hasta: number): CubetaMinuto[] {
  const totCal = Object.values(real.calibreTurno).reduce((a, b) => a + b, 0)
  const totCal2 = Object.values(real.calidadTurno).reduce((a, b) => a + b, 0)
  const out: CubetaMinuto[] = []
  for (let m = 0; m < hasta; m++) {
    const pz = real.grader[m] ?? 0
    if (pz <= 0 || (HUECO && m >= HUECO[0] && m < HUECO[1])) continue
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
    const h = HUECO ? [new Date(T0 + HUECO[0] * 60_000).toISOString(), new Date(T0 + HUECO[1] * 60_000).toISOString()] : null
    return todas.filter((p) => p.ts < lim && !(h && p.ts >= h[0]! && p.ts < h[1]!))
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
          publico={PUBLICO}
        />
        {/* 22-11: la tarjeta del espejo con el turno del encabezado, en público y admin, en curso y cerrado. */}
        <div className="grid gap-3 lg:grid-cols-2" data-testid="dev-espejo-turno">
          {[
            { publico: true, enCurso: true },
            { publico: true, enCurso: false },
            { publico: false, enCurso: true },
            { publico: false, enCurso: false },
          ].map((v) => (
            <EspejoGraderCard
              key={`${v.publico}-${v.enCurso}`}
              estado={{ equipo: 'CH-MANT-P07', linea: 'chonchi', ultimoLatidoMs: Date.now() - 60_000, leidoEn: '2026-11-21T14:51:12-03:00', informe: 'pieza', estado: { version: 'e1.7', error: 'pantalla-bloqueada', parcial: true, pendientes: 1200 } }}
              vivo
              minutos={1}
              resumen={{ piezas: [], total: 17876, gate0: 412, p0: 2.3, primera: '07:21:04', ultima: '14:52:10', turno: null, coincidencia: { letra: 'B', pct: 99 } }}
              publico={v.publico}
              turnoEnCurso={v.enCurso}
              turnoMonitor={{ nombre: 'Turno 2', desde: '07:15', hasta: '14:50', piezas: 17836, g0: 410, baader: 16188 }}
              accion={<LecturaEnVivoFila estado={{ modo: 'normal', hastaMs: null }} pedidoNombre="Orel" version="e1.7" ocupado={false} error={null} onPedir={() => {}} onTerminar={() => {}} />}
            />
          ))}
        </div>
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
        {/* e1.6: la ficha de Diagnóstico Matrix durante y después de una recarga de historia (sin Firestore). */}
        <div className="grid gap-3 lg:grid-cols-2" data-testid="dev-recarga">
          {RECARGAS.map((r) => (
            <FichaEstadoLector
              key={r.recarga}
              ahora={Date.now()}
              e={{ equipo: 'CH-MANT-P07', linea: 'chonchi', ultimoLatidoMs: Date.now() - 60_000, leidoEn: '2026-11-21T14:05:00-03:00', informe: 'pieza', estado: { version: 'e1.6', ajuste: 'fechas-fijas', error: r.error, parcial: r.parcial, filasTabla: 34145, piezas: 9120, primera: '2026-11-21 07:20:05', ultima: '2026-11-21 14:01:10', rango: RANGO_VIEJO, limite: r.error !== '', recarga: r.recarga } }}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
