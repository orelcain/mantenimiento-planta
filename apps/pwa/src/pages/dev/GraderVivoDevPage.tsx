/**
 * Banco de pruebas de «Grader en vivo» (pestaña Grader del monitor, E-A). SOLO DEV: la ruta no se registra en
 * producción (ver App.tsx).
 *
 * Monta `GraderVivo` con el turno REAL del 18-11 Turno 1 de Chonchi (el del mockup v4): todas las piezas del Excel
 * Pieza pieza, la serie por minuto de las 3 Baader, las paradas de Shoplogix (Evisceradora 1) y la Puerta 0 del
 * cierre, cortado a la hora que se elija, sin Firestore ni login. Por defecto trae el hueco REAL del espejo
 * (23:39:26 → 00:28:51: sin piezas leídas mientras las Baader seguían).
 *
 * `?sinHueco=1`: el turno completo. `?b5=1`: las Baader del respaldo de 5 min (sin serie por minuto). `?p0=0`: sin Puerta 0 (el motivo queda «estimado»). `?publico=1`: la vista de
 * quien no es admin.
 */
import { useEffect, useMemo, useState } from 'react'
import urlPiezas from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-18-turno_1.json.gz?url'
import extra from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-18-turno_1-extra.json'
import type { PiezaEspejo } from '@/services/grader/espejo/espejoFilas'
import { serieDesdeCada5, type SerieMinutoBaader } from '@/services/grader/espejo/graderVivo'
import type { CalibreRange } from '@/services/grader/types'
import type { StoredGate0Record } from '@/services/grader/graderGate0Store'
import '@/pages/monitor/monitorGlass.css'
import { cubetasDe } from '@/services/grader/espejo/espejoMinutos'
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

const T0 = Date.parse(extra.t0)
/** Fin de la vista: la última pieza del turno cae a las 05:29:45. */
const FIN = Date.parse('2026-11-19T05:30:00.000Z')
const MINUTOS = (FIN - T0) / 60_000
const PROGRAMADA = /COLACION|REUNION|EJERCICIO|Limpieza/i
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
/** El hueco real del espejo del 18-11 (ver `huecosEspejo.reales.test.ts`). */
const HUECO: [string, string] | null = Q.has('sinHueco') ? null : ['2026-11-18T23:39:26', '2026-11-19T00:28:51']
const CON_P0 = Q.get('p0') !== '0'
const PUBLICO = Q.has('publico')
const B5 = Q.has('b5')

/** Las cubetas de 5 min de las 3 Baader sumadas (`extra.b5`, intervals de Shoplogix). */
const CUBETAS_B5: Array<{ t: string; pieces: number }> = (() => {
  const m = new Map<string, number>()
  for (const maq of extra.b5) for (const iv of maq.intervals) m.set(iv.s, (m.get(iv.s) ?? 0) + iv.c)
  return [...m.entries()].map(([t, pieces]) => ({ t, pieces }))
})()

const PARADAS: ParadaGrader[] = extra.paradas.map((p) => ({
  desdeMs: Date.parse(p.desde),
  hastaMs: Date.parse(p.hasta),
  dueno: PROGRAMADA.test(p.causa) ? 'programado' : 'externo',
}))

/** La Puerta 0 del cierre (192 piezas: 102 fuera de límites, 78 fotocélula, 12 puerta no preparada). */
const PUERTA0: StoredGate0Record[] = extra.puerta0.map(([s, e, g, n]) => ({
  ts: new Date(T0 + s! * 1000).toISOString(),
  pieces: n!,
  error: extra.errores[e!] ?? '',
  weightKg: g! / 1000,
}))

interface CrudoTurno {
  t0: string
  baader: SerieMinutoBaader
  dic: Record<'calidad' | 'calibre' | 'conservacion' | 'producto' | 'lote', string[]>
  filas: number[][]
}
interface TurnoDev { piezas: PiezaEspejo[]; baader: SerieMinutoBaader }

/** Las piezas reales del 18-11 T1 (todas, con gate y peso) y la serie de las Baader, del .gz de los tests. */
function useTurnoReal(): TurnoDev | null {
  const [p, setP] = useState<TurnoDev | null>(null)
  useEffect(() => {
    let vivo = true
    void (async () => {
      // El servidor de Vite manda el .gz con `Content-Encoding: gzip` y el navegador ya lo abre: solo se
      // descomprime si llegan los bytes gzip (1f 8b).
      const buf = new Uint8Array(await (await fetch(urlPiezas)).arrayBuffer())
      const txt = buf[0] === 0x1f && buf[1] === 0x8b
        ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : new TextDecoder().decode(buf)
      const raw = JSON.parse(txt) as CrudoTurno
      const t0 = Date.parse(raw.t0)
      const piezas = raw.filas.map(([s, gate, g, n, q, c, co, pr, l]): PiezaEspejo => {
        const ts = new Date(t0 + s! * 1000).toISOString()
        return { cadena: `${ts}#${gate}#${g}`, ts, fecha: ts.slice(0, 10), hora: ts.slice(11, 19), pesoKg: g! > 0 ? g! / 1000 : null, cantidad: n!, lote: raw.dic.lote[l!] ?? '', gate: gate!, calidad: raw.dic.calidad[q!] ?? '', conservacion: raw.dic.conservacion[co!] ?? '', calibre: (raw.dic.calibre[c!] ?? '') as CalibreRange, producto: raw.dic.producto[pr!] ?? '', turnoMatrix: '' }
      })
      if (vivo) setP({ piezas, baader: raw.baader })
    })()
    return () => { vivo = false }
  }, [])
  return p
}

export default function GraderVivoDevPage() {
  const [hasta, setHasta] = useState(435) // 04:30, la hora del mockup
  const turno = useTurnoReal()
  const lim = new Date(T0 + hasta * 60_000).toISOString()
  const piezas = useMemo(
    () => turno?.piezas.filter((p) => p.ts < lim && !(HUECO && p.ts >= HUECO[0] && p.ts < HUECO[1])),
    [turno, lim],
  )
  const c = useMemo(() => cubetasDe(piezas ?? []), [piezas])
  // Shoplogix publica los minutos con unos 3 min de atraso.
  const baader = useMemo(() => {
    if (!turno) return null
    // `?b5=1`: el respaldo de 5 min de Shoplogix (cubetas cerradas de las 3 Baader), como si faltara la serie por minuto.
    if (B5) return serieDesdeCada5(CUBETAS_B5, T0 + (hasta - 3) * 60_000)
    const n = Math.max(0, Math.floor((T0 + hasta * 60_000 - Date.parse(turno.baader.desde)) / 60_000) - 3)
    return { desde: turno.baader.desde, maquinas: turno.baader.maquinas.map((m) => ({ cycles: m.cycles.slice(0, n) })) }
  }, [turno, hasta])
  const gate0 = useMemo(() => (CON_P0 ? PUERTA0.filter((r) => r.ts < lim) : null), [lim])
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
            max={MINUTOS}
            value={hasta}
            onChange={(e) => setHasta(Number(e.target.value))}
            className="flex-1"
          />
          <span className="tabular-nums">{new Date(T0 + hasta * 60_000).toISOString().slice(11, 16)}</span>
        </label>
        <GraderVivo
          cubetas={c}
          inicioMs={T0}
          finMs={FIN}
          baader={baader}
          baaderCada5={B5}
          paradas={PARADAS}
          minutosSinLatido={1}
          turnoEnCurso
          piezas={piezas}
          gate0Exacto={gate0}
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
