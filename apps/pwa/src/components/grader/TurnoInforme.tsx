/**
 * TurnoInforme — el detalle de turno como informe corrido (dirección A).
 *
 * Mockup aprobado: https://claude.ai/artifact/Q8cxs5QVB7iTFP2PByrRPk
 * Une Resumen y Mantención en una sola lectura: la pestaña Mantención se abría
 * 2 de cada 22 vistas, y es la que demuestra el aporte. Lo demás (Gantt por
 * máquina, compuertas, imputar) queda a un toque, y el análisis técnico anterior
 * completo en el plegable del final.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  FilasLectura, SeccionLectura,
  LECTURA_CUERPO, LECTURA_ENLACE, LECTURA_NOTA, LECTURA_TITULO,
} from '@/components/piel/Lectura'
import { useAncho } from '@/hooks/useAncho'
import { useEsPC } from '@/hooks/useEsPC'
import { useFallasRepetidas } from '@/hooks/useFallasRepetidas'
import { shortMachineName } from '@/services/grader/graderMachineNames'
import { armarInformeTurno, horaPared, resumirTendencia, type FilaMaquina, type ResumenTendencia } from '@/services/shoplogix/informeTurno'
import { clasificaCausa, sanearStates, type KpisTurnoMantencion } from '@/services/shoplogix/kpisMantencionTurno'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import { cargarTendenciaMantencion, type PuntoTendenciaMantencion } from '@/services/shoplogix/tendenciaMantencion'
import { dec1 } from '@/utils/formatoNumeros'

const COLOR = {
  barra: 'rgb(var(--muted-foreground) / 0.72)',
  fondo: 'rgb(var(--border) / 0.55)',
  crit: 'rgb(var(--ink-crit))',
  proceso: 'rgb(var(--ink-warn) / 0.72)',
  planificado: 'rgb(var(--muted-foreground) / 0.34)',
  texto: 'rgb(var(--foreground))',
  nota: 'rgb(var(--muted-foreground))',
}

const cm = (d: Date) => d.getTime()

function GraficoTurno({ kpis, anotacion }: {
  kpis: KpisTurnoMantencion
  anotacion: { maquina: string; texto: string } | null
}) {
  const { ref, ancho } = useAncho(343)
  const compacto = ancho < 640
  const altoFila = compacto ? 46 : 62, franja = 9, separa = compacto ? 34 : 38
  const t0 = cm(kpis.ventana.start), durMs = kpis.ventanaMin * 60_000
  const x = (ms: number) => ((ms - t0) / durMs) * ancho
  const max = Math.max(1, ...kpis.porMaquina.flatMap((p) => (p.maquina.intervals ?? []).map((i) => i.cycles || 0)))
  const anchoBarra = Math.max(1.2, (300_000 / durMs) * ancho - 0.8)

  const marcas = useMemo(() => {
    const ini = new Date(t0), fin = new Date(t0 + durMs)
    const res: Array<{ ms: number; t: string; a: 'start' | 'middle' | 'end' }> = [{ ms: t0, t: horaPared(ini), a: 'start' }]
    if (compacto) {
      res.push({ ms: t0 + durMs / 2, t: horaPared(new Date(t0 + durMs / 2)), a: 'middle' })
    } else {
      const primera = Math.ceil((t0 + 3_600_000) / 3_600_000) * 3_600_000
      for (let ms = primera; ms < t0 + durMs - 1_800_000; ms += 2 * 3_600_000) {
        if (ms - t0 >= 1_800_000) res.push({ ms, t: horaPared(new Date(ms)), a: 'middle' })
      }
    }
    res.push({ ms: t0 + durMs, t: horaPared(fin), a: 'end' })
    return res
  }, [t0, durMs, compacto])

  const paso = altoFila + franja + separa
  const altoTotal = kpis.porMaquina.length * paso + 10
  return (
    <div ref={ref}>
      <svg
        viewBox={`0 0 ${ancho} ${altoTotal}`} width="100%" height={altoTotal}
        role="img" aria-label="Piezas cada 5 minutos por máquina y detenciones del turno" className="block"
      >
        {kpis.porMaquina.map((p, i) => {
          const y = i * paso
          const base = y + 16 + altoFila
          const nombre = shortMachineName(p.maquina.machineName)
          const tramos = sanearStates(p.maquina.states ?? [], kpis.ventana).filter((s) => s.durationSec >= 90)
          const de = (fam: (f: ReturnType<typeof clasificaCausa>) => boolean, color: string) => tramos
            .filter((s) => fam(clasificaCausa(s)))
            .map((s, k) => (
              <rect key={`${color}${k}`} x={x(cm(s.startAt))} y={base + 3} height={franja}
                width={Math.max(1.5, (s.durationSec * 1000 / durMs) * ancho)} fill={color} />
            ))
          return (
            <g key={p.maquina.machineid}>
              <text x={0} y={y + 11} fontSize={13} fontWeight={600} fill={COLOR.texto}>{nombre}</text>
              <text x={ancho} y={y + 11} fontSize={13} textAnchor="end" fill={COLOR.nota} className="tabular-nums">
                {(p.maquina.totalCycles || 0).toLocaleString('es-CL')} piezas
              </text>
              {anotacion?.maquina === nombre && !compacto && (
                <text x={ancho / 2} y={y + 11} fontSize={13} textAnchor="middle" fill={COLOR.crit}>{anotacion.texto}</text>
              )}
              {(p.maquina.intervals ?? []).map((iv, k) => {
                const h = ((iv.cycles || 0) / max) * altoFila
                return h > 0.2 ? <rect key={k} x={x(cm(iv.startAt))} y={base - h} width={anchoBarra} height={h} fill={COLOR.barra} /> : null
              })}
              <rect x={0} y={base + 3} width={ancho} height={franja} fill={COLOR.fondo} />
              {de((f) => f === 'planificado', COLOR.planificado)}
              {de((f) => f === 'externo' || f === 'excedido', COLOR.proceso)}
              {de((f) => f === 'falla', COLOR.crit)}
            </g>
          )
        })}
        {marcas.map((m) => (
          <text key={m.ms} x={Math.min(ancho, Math.max(0, x(m.ms)))} y={altoTotal - 8} fontSize={13} textAnchor={m.a} fill={COLOR.nota}>{m.t}</text>
        ))}
      </svg>
    </div>
  )
}

function Leyenda() {
  const item = (color: string, t: string) => (
    <span className="inline-flex items-center gap-[5px]">
      <i aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: color }} />{t}
    </span>
  )
  return (
    <p className={`${LECTURA_NOTA} flex flex-wrap gap-x-3.5 gap-y-1 m-0`}>
      {item(COLOR.crit, 'Falla técnica')}{item(COLOR.proceso, 'Proceso')}{item(COLOR.planificado, 'Planificado')}
    </p>
  )
}

function TendenciaFalla({ plantSlug, shiftId, dateKey }: { plantSlug: PlantSlug; shiftId: string; dateKey: string }) {
  const [puntos, setPuntos] = useState<PuntoTendenciaMantencion[] | null>(null)
  useEffect(() => {
    let vivo = true
    cargarTendenciaMantencion(plantSlug, shiftId, dateKey)
      .then((p) => { if (vivo) setPuntos(p) })
      .catch(() => { if (vivo) setPuntos([]) })
    return () => { vivo = false }
  }, [plantSlug, shiftId, dateKey])
  const res = useMemo(() => (puntos ? resumirTendencia(puntos, dateKey) : null), [puntos, dateKey])
  return res ? <GraficoTendencia res={res} /> : null
}

function GraficoTendencia({ res }: { res: ResumenTendencia }) {
  const { ref, ancho } = useAncho(343)
  const alto = 140, base = alto - 20
  const max = Math.max(1, ...res.valores.map((v) => v.min))
  const bw = ancho / res.valores.length
  return (
    <div className="mt-4" data-testid="informe-tendencia">
      <p className={`${LECTURA_NOTA} mb-1.5`}>Falla técnica en los últimos {res.valores.length} turnos iguales, minutos-máquina</p>
      <div ref={ref}>
        <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" height={alto} role="img" aria-label={res.texto} className="block">
          {res.valores.map((v, i) => {
            const h = (v.min / max) * (base - 18), x0 = i * bw + 2, w = bw - 4
            const relleno = v.hoy ? COLOR.crit : COLOR.barra
            return (
              <g key={i}>
                {v.min > 0
                  ? <rect x={x0} y={base - h} width={w} height={h} fill={relleno} />
                  : <rect x={x0} y={base - 1.5} width={w} height={1.5} fill={COLOR.planificado} />}
                {v.min > 0 && <text x={x0 + w / 2} y={base - h - 4} fontSize={13} textAnchor="middle" fill={v.hoy ? COLOR.crit : COLOR.nota}>{v.min}</text>}
                {(i % 2 === 1 || v.hoy) && <text x={x0 + w} y={alto - 4} fontSize={13} textAnchor="end" fill={COLOR.nota}>{v.etiqueta}</text>}
              </g>
            )
          })}
        </svg>
      </div>
      <p className={`${LECTURA_NOTA} mt-1.5`}>{res.texto}</p>
    </div>
  )
}

const TH = `${LECTURA_NOTA} py-1.5 pl-3 first:pl-0 text-right first:text-left whitespace-nowrap`
const TD = 'py-[11px] lg:py-[9px] pl-2.5 lg:pl-3 first:pl-0 text-right first:text-left border-t border-border align-baseline tabular-nums [&:not(:first-child)]:whitespace-nowrap'
const SOLO_PC = 'hidden lg:table-cell'
const SOLO_CELULAR = 'lg:hidden'

function FilaTabla({ f, clase }: { f: FilaMaquina; clase?: string }) {
  return (
    <tr className={clase}>
      <td className={TD}>{f.nombre}</td>
      <td className={TD}>{f.piezas.toLocaleString('es-CL')}</td>
      <td className={`${TD} ${SOLO_PC}`}>{f.pctObjetivo == null ? '—' : `${f.pctObjetivo} %`}</td>
      <td className={TD}>{f.produjo.toLocaleString('es-CL')}</td>
      <td className={TD}>{f.falla}</td>
      <td className={`${TD} ${SOLO_PC}`}>{f.sinAnotar}</td>
      <td className={`${TD} ${SOLO_PC}`}>{f.proceso}</td>
      <td className={`${TD} ${SOLO_PC}`}>{f.planificado}</td>
      <td className={`${TD} ${SOLO_PC}`}>{f.total.toLocaleString('es-CL')}</td>
      <td className={`${TD} ${SOLO_CELULAR}`}>{f.otras}</td>
    </tr>
  )
}

export interface TurnoInformeProps {
  kpis: KpisTurnoMantencion
  plantSlug: PlantSlug
  dateKey: string
  shiftId: string
  /** Frase de identidad: «Jueves 1 de octubre, turno 2 de la mañana, 07:15 a 15:00. Cerrado.» */
  identidad: string
  enCurso: boolean
  piezasFueraDeHorario?: number
  porDetallar: number
  sincronizado?: string
  actualizando?: boolean
  onActualizar?: () => void
  onVerMantencion: () => void
  onVerPorHacer: () => void
  onVerCompuertas?: () => void
  onCargarExcel?: () => void
  /** El análisis técnico anterior, completo, tras un plegable. */
  analisisCompleto?: ReactNode
}

export function TurnoInforme(p: TurnoInformeProps) {
  const { kpis } = p
  const inf = useMemo(() => armarInformeTurno(kpis, { enCurso: p.enCurso }), [kpis, p.enCurso])
  const maquinas = useMemo(() => kpis.porMaquina.map((x) => x.maquina), [kpis])
  const { grupos: repetidas, episodiosTurno, loading: cargandoRep } = useFallasRepetidas(p.plantSlug, maquinas)
  const volvieron = repetidas.reduce((n, g) => n + g.repeticiones, 0)
  const [completo, setCompleto] = useState(false)
  const esPC = useEsPC()
  const { respuesta: r } = inf

  const filasRespuesta = [
    { rotulo: r.eventos === 1 ? 'MTTR, 1 evento' : `MTTR, ${r.eventos} eventos`, valor: r.mttrMin == null ? '—' : `${dec1(r.mttrMin)} min` },
    ...(r.reengancheMin != null ? [{ rotulo: 'Reenganche tras la detención mayor', valor: `${r.reengancheMin} min o menos` }] : []),
    { rotulo: 'Disponibilidad técnica', valor: r.disponibilidad },
    { rotulo: 'Detenciones que volvieron', valor: cargandoRep && volvieron === 0 ? '…' : `${volvieron} de ${episodiosTurno}` },
    ...(r.piezasFalla != null ? [{ rotulo: 'Costo, al ritmo demostrado', valor: `≈ ${r.piezasFalla.toLocaleString('es-CL')} piezas` }] : []),
  ]

  const enlaces = [
    { rotulo: 'Por máquina', valor: <button type="button" className={LECTURA_ENLACE} onClick={p.onVerMantencion}>Gantt y comentarios ›</button> },
    ...(p.onVerCompuertas ? [{ rotulo: 'Compuertas', valor: <button type="button" className={LECTURA_ENLACE} onClick={p.onVerCompuertas}>Ver configuración ›</button> }] : []),
    ...(p.onCargarExcel ? [{ rotulo: 'Excel del Grader', valor: <button type="button" className={LECTURA_ENLACE} onClick={p.onCargarExcel}>Sin cargar ›</button> }] : []),
    ...(p.onActualizar ? [{
      rotulo: !p.sincronizado ? 'Shoplogix' : /sincroniz/i.test(p.sincronizado) ? p.sincronizado.charAt(0).toUpperCase() + p.sincronizado.slice(1) : `Sincronizado ${p.sincronizado}`,
      valor: <button type="button" className={LECTURA_ENLACE} onClick={p.onActualizar} disabled={p.actualizando}>{p.actualizando ? 'Actualizando…' : 'Actualizar'}</button>,
    }] : []),
  ]

  const tablaMaquinas = (
    <SeccionLectura titulo="Adónde se fue cada máquina" testId="informe-maquinas">
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse ${LECTURA_CUERPO}`}>
          <thead><tr>
            <th className={TH} scope="col">Máquina</th>
            <th className={TH} scope="col">Piezas</th>
            <th className={`${TH} ${SOLO_PC}`} scope="col">Del objetivo</th>
            <th className={TH} scope="col">Produjo</th>
            <th className={TH} scope="col"><span className="lg:hidden">Falla</span><span className="hidden lg:inline">Falla técnica</span></th>
            <th className={`${TH} ${SOLO_PC}`} scope="col">Sin anotar</th>
            <th className={`${TH} ${SOLO_PC}`} scope="col">Proceso</th>
            <th className={`${TH} ${SOLO_PC}`} scope="col">Planificado</th>
            <th className={`${TH} ${SOLO_PC}`} scope="col">Turno</th>
            <th className={`${TH} ${SOLO_CELULAR}`} scope="col">Otras</th>
          </tr></thead>
          <tbody>
            {inf.filas.map((f) => (
              <FilaTabla key={f.nombre} f={f} clase={f.nombre === inf.maquinaDestacada ? 'text-ink-crit font-semibold' : undefined} />
            ))}
            <FilaTabla f={inf.linea} clase="font-semibold [&>td]:border-t-[1.5px] [&>td]:border-foreground" />
          </tbody>
        </table>
      </div>
      <p className={`${LECTURA_NOTA} mt-2`}>
        Minutos. Cada máquina suma su turno.
        {inf.objetivoPorVerificar.length > 0 && ` Objetivo por verificar en ${inf.objetivoPorVerificar.join(' y ')}: el esperado no calza con su ritmo demostrado.`}
        {p.piezasFueraDeHorario ? ` Además, ${p.piezasFueraDeHorario.toLocaleString('es-CL')} piezas fuera del horario.` : ''}
      </p>
    </SeccionLectura>
  )

  const tablaCausas = (
    <SeccionLectura titulo="Por qué se detuvo" testId="informe-causas">
      <table className={`w-full border-collapse ${LECTURA_CUERPO}`}>
        <thead><tr>
          <th className={TH} scope="col">Causa</th>
          <th className={`${TH} ${SOLO_PC}`} scope="col">Máquina</th>
          <th className={TH} scope="col">Veces</th>
          <th className={TH} scope="col">Min</th>
        </tr></thead>
        <tbody>
          {inf.grupos.map((g) => {
            const plegado = g.id === 'sin-anotar' || g.id === 'planificado'
            return [
              <tr key={g.id} className="font-semibold">
                <td className={TD}>{g.titulo}</td>
                <td className={`${TD} ${SOLO_PC}`}>{plegado ? g.maquinas : ''}</td>
                <td className={TD}>{plegado ? (g.veces ?? '') : ''}</td>
                <td className={TD}>{g.min}</td>
              </tr>,
              ...(plegado ? [] : g.lineas.map((l) => (
                <tr key={`${g.id}-${l.causa}`}>
                  <td className={`${TD} !pl-4`}>{l.causa}<span className="lg:hidden">, {l.maquinasCorto}</span></td>
                  <td className={`${TD} ${SOLO_PC}`}>{l.maquinas}</td>
                  <td className={TD}>{l.veces}</td>
                  <td className={TD}>{l.min}</td>
                </tr>
              ))),
            ]
          })}
          <tr className="font-semibold [&>td]:border-t-[1.5px] [&>td]:border-foreground">
            <td className={TD}>Total detenido</td>
            <td className={`${TD} ${SOLO_PC}`} />
            <td className={TD} />
            <td className={TD}>{inf.totalDetenido}</td>
          </tr>
        </tbody>
      </table>
      {inf.pctConCausa != null && <p className={`${LECTURA_NOTA} mt-2`}>{inf.pctConCausa} % del tiempo detenido tiene causa anotada.</p>}
    </SeccionLectura>
  )

  const mantencion = (
    <SeccionLectura titulo="Lo que hizo Mantención" testId="informe-mantencion">
      <FilasLectura filas={filasRespuesta} />
      <TendenciaFalla plantSlug={p.plantSlug} shiftId={p.shiftId} dateKey={p.dateKey} />
    </SeccionLectura>
  )

  const porDetallar = (
    <SeccionLectura titulo="Por detallar" testId="informe-por-detallar">
      {inf.pendientes.length > 0 && (
        <table className={`w-full border-collapse ${LECTURA_CUERPO}`}>
          <tbody>
            {inf.pendientes.map((d) => (
              <tr key={`${d.hora}${d.maquina}`}>
                <td className={TD}>{d.hora} {d.causa}, {d.maquina}</td>
                <td className={TD}>{d.min} min</td>
                <td className={TD}>
                  <button type="button" onClick={p.onVerPorHacer}
                    className="min-h-11 lg:min-h-[36px] rounded-ctl border border-border px-3 text-[length:calc(13px*var(--escala-texto,1))] leading-[1.38] text-brand-ink hover:bg-muted">
                    Detallar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" onClick={p.onVerPorHacer} className={`${LECTURA_ENLACE} ${LECTURA_CUERPO} !text-brand-ink`}>
        {p.porDetallar > 0 ? `Ver las ${p.porDetallar} por detallar` : 'Ver todas las detenciones'}
      </button>
      <FilasLectura filas={enlaces} className="mt-1" />
    </SeccionLectura>
  )

  return (
    <article className={`${LECTURA_CUERPO} px-1 pb-10 flex flex-col gap-6 lg:gap-[26px]`} data-testid="turno-informe">
      <header>
        <p className={LECTURA_NOTA}>{p.identidad}</p>
        <h1 className={`${LECTURA_TITULO} mt-1.5 lg:max-w-[900px]`}>{inf.titular}</h1>
        <p className="mt-2 lg:max-w-[820px]">{inf.bajada}</p>
      </header>

      <SeccionLectura titulo="Cómo corrió el turno" extra={<span className="hidden lg:block"><Leyenda /></span>} testId="informe-grafico">
        <GraficoTurno kpis={kpis} anotacion={inf.anotacion} />
        <div className="lg:hidden mt-2"><Leyenda /></div>
        <p className={`${LECTURA_NOTA} mt-1 hidden lg:block`}>Barras: piezas cada 5 min, misma escala. Franja: detenciones de 90 s o más.</p>
      </SeccionLectura>

      {/* Un solo árbol según el ancho: dos ocultos por CSS leerían la tendencia dos veces. */}
      {esPC ? (
        <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-12 items-start">
          <div className="flex flex-col gap-[26px]">{tablaMaquinas}{tablaCausas}</div>
          <div className="flex flex-col gap-[26px]">{mantencion}{porDetallar}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">{mantencion}{tablaMaquinas}{tablaCausas}{porDetallar}</div>
      )}

      {p.analisisCompleto && (
        <section className="border-t border-border pt-1">
          <button type="button" onClick={() => setCompleto((v) => !v)} aria-expanded={completo}
            className={`${LECTURA_ENLACE} ${LECTURA_CUERPO} !text-brand-ink inline-flex items-center gap-1 min-h-11`}>
            {completo ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Análisis técnico completo: cascada, ritmo y árbol de causas
          </button>
          {completo && <div className="mt-3">{p.analisisCompleto}</div>}
        </section>
      )}
    </article>
  )
}
