/**
 * JackKnifeCard — Diagrama Jack-Knife de Mantención.
 *
 * Cada punto es una causa del balde Mantención: cuántas veces detuvo la línea
 * (eje X, log) y cuánto duró cada vez (eje Y, MTTR en minutos, log). Los
 * umbrales son el promedio de eventos por causa y de minutos por evento de la
 * ventana elegida. Port del mockup aprobado (07-11-2026); la lógica de ventanas,
 * riel y colocación de etiquetas es la del mockup.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, FileDown, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Button, SegmentedControl } from '@/components/piel'
import { calcularLayout } from './jackKnifeLayout'
import { dec, dec1 } from '@/utils/formatoNumeros'
import {
  ETIQUETA_VEREDICTO,
  SIN_IMPUTAR,
  agruparComentarios,
  calcularJackKnife,
  cargarTurnosCrudos,
  codificarEstadoJK,
  comentariosDe,
  datosInforme,
  filtrarComentarios,
  leerEstadoJK,
  palabrasFrecuentes,
  previaAnterior,
  previaJK,
  prepararTurnos,
  resumenComparacion,
  sentidoCambio,
  veredicto,
  ventanaJK,
  type CuadranteJK,
  type ModoCmpJK,
  type PreviaJK,
  type RangoJK,
  type TurnoCrudo,
  type TurnoJK,
  type VentanaJK,
  type VistaJK,
} from '@/services/shoplogix/jackKnife'

// ── Presentación ────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** Colores de cuadrante: tinta para el texto, punto para el marcador, relleno de baja opacidad. */
const Q: Record<CuadranteJK, { t: string; a: string; ink: string; dot: string; fill: string }> = {
  amb: { t: 'Agudas y crónicas', a: 'Prioridad 1: atacar causa raíz y tiempo de reparación.', ink: 'rgb(var(--tw-red-600))', dot: 'rgb(var(--tw-red-500))', fill: 'rgb(var(--tw-red-500) / 0.08)' },
  agu: { t: 'Agudas', a: 'Pocas veces, pero larga: revisar repuestos, diagnóstico y procedimiento.', ink: 'rgb(var(--jk-agu))', dot: 'rgb(var(--jk-agu))', fill: 'rgb(var(--jk-agu) / 0.08)' },
  cro: { t: 'Crónicas', a: 'Rápida, pero repetida: buscar causa raíz o preventivo.', ink: 'rgb(var(--jk-cro))', dot: 'rgb(var(--jk-cro))', fill: 'rgb(var(--jk-cro) / 0.08)' },
  ok: { t: 'Bajo control', a: 'Sin acción. Mantener seguimiento.', ink: 'rgb(var(--success))', dot: 'rgb(var(--success))', fill: 'rgb(var(--success) / 0.07)' },
}
const COLOR_SIN = 'rgb(var(--cat-6-ink))'

/** Etiqueta corta en pantallas angostas; el texto largo sigue siendo el nombre accesible. */
const dual = (largo: string, corto: string) => (
  <>
    <span aria-hidden className="text-center leading-tight whitespace-normal sm:hidden">{corto}</span>
    <span className="sr-only text-center leading-tight whitespace-normal sm:not-sr-only">{largo}</span>
  </>
)

const VISTAS: { value: VistaJK; label: string }[] = [
  { value: 'imp', label: 'Imputadas' },
  { value: 'sin', label: 'Sin imputar' },
  { value: 'todas', label: 'Todas' },
]
const PRESETS: { value: VentanaJK; label: ReactNode }[] = [
  { value: 'turno', label: dual('Último turno', 'Turno') },
  { value: '7', label: dual('7 días', '7 d') },
  { value: '30', label: dual('30 días', '30 d') },
  { value: '90', label: dual('90 días', '90 d') },
  { value: 'todo', label: 'Todo' },
]

const fechaCorta = (dateKey: string) => {
  const [, m, d] = dateKey.split('-')
  return `${Number(d)}-${MES[Number(m) - 1]}`
}
const turnoCorto = (shiftId: string) => shiftId.replace('Turno ', 'T')
/** Horas con coma: menos de una hora en minutos. */
const hrs = (m: number) => (m < 60 ? `${m < 10 ? dec1(m) : dec(m, 0)} min` : `${dec1(m / 60)} h`)
const durS = (m: number) => (m >= 90 ? `${dec1(m / 60)} h` : `${dec1(m)} min`)
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

// ── Riel ────────────────────────────────────────────────────────────────────

const RANGO_INPUT =
  'absolute inset-x-0 bottom-[18px] h-7 w-full appearance-none bg-transparent pointer-events-none ' +
  '[&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-card ' +
  '[&::-webkit-slider-thumb]:cursor-ew-resize [&::-moz-range-thumb]:pointer-events-auto ' +
  '[&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full ' +
  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-card'

/** «Ahora» o «Antes» en palabras: fecha y turno de cada extremo, o «N turnos». */
const rangoTexto = (turnos: readonly TurnoJK[], r: RangoJK) => {
  const a = turnos[r.desde]
  const b = turnos[r.hasta]
  if (!a || !b) return ''
  return r.desde === r.hasta
    ? `${fechaCorta(a.dateKey)} ${turnoCorto(a.shiftId)}`
    : `${fechaCorta(a.dateKey)} ${turnoCorto(a.shiftId)} a ${fechaCorta(b.dateKey)} ${turnoCorto(b.shiftId)}`
}

const TONO_CAMBIO: Record<'mejor' | 'peor' | 'igual', string> = {
  mejor: 'text-ink-ok',
  peor: 'text-ink-crit',
  igual: 'text-muted-foreground',
}
const SIMBOLO_CAMBIO: Record<'mejor' | 'peor' | 'igual', string> = { mejor: '▼', peor: '▲', igual: '=' }
const TONO_VEREDICTO: Record<string, string> = {
  mejoro: 'text-ink-ok',
  sinEventos: 'text-ink-ok',
  empeoro: 'text-ink-crit',
  nueva: 'text-ink-crit',
  igual: 'text-muted-foreground',
}

/** Antes → ahora de una magnitud, con ▼ mejor, ▲ peor o = igual (±10 %). Color y símbolo, no solo color. */
function CambioTexto({ nombre, antes, ahora, unidad, fmt }: { nombre: string; antes: number; ahora: number; unidad: string; fmt: (x: number) => string }) {
  const s = sentidoCambio(antes, ahora)
  const palabra = s === 'mejor' ? 'mejor' : s === 'peor' ? 'peor' : 'igual'
  return (
    <span className="tabular-nums">
      {nombre} {fmt(antes)} → {fmt(ahora)}{unidad}{' '}
      <span className={cn('font-semibold', TONO_CAMBIO[s])}>{SIMBOLO_CAMBIO[s]} {palabra}</span>
    </span>
  )
}

const MODOS: { value: ModoCmpJK; label: ReactNode }[] = [
  { value: 'ant', label: dual('Vs. período anterior', 'Anterior') },
  { value: 'mes', label: dual('Vs. mes pasado', 'Mes pasado') },
  { value: 'mano', label: dual('Elegir a mano', 'A mano') },
  { value: 'no', label: <span className="text-center text-footnote leading-tight whitespace-normal">Sin comparar</span> },
]

// Riel: manijas «Antes» en color de advertencia suave (solo en «Elegir a mano»).
const RANGO_INPUT_ANTES = RANGO_INPUT.replace(/border-accent/g, 'border-warning')

/** Fecha y hora de un comentario: «7-nov 14:05». */
const fechaHora = (ms: number) => {
  const d = new Date(ms)
  return `${d.getDate()}-${MES[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface ComentarioVista { dateKey: string; shiftId: string; inicioMs: number; texto: string }

/** Todos los comentarios del período de la causa elegida: chips, búsqueda y orden. */
function ComentariosCausa({ causa, todos, busqueda, onBusqueda, palabra, onPalabra, modo, onModo }: {
  causa: string
  todos: ComentarioVista[]
  busqueda: string
  onBusqueda: (v: string) => void
  palabra: string | null
  onPalabra: (v: string | null) => void
  modo: 'grupo' | 'fecha'
  onModo: (v: 'grupo' | 'fecha') => void
}) {
  const chips = useMemo(() => palabrasFrecuentes(todos.map((c) => c.texto), 10), [todos])
  const filtrados = filtrarComentarios(todos, busqueda, palabra)
  const filas = modo === 'grupo'
    ? agruparComentarios(filtrados).map((g) => ({
      clave: g.texto,
      texto: g.texto,
      cola: `${g.n > 1 ? `×${g.n} · ` : ''}${fechaHora(g.ultimoMs)}`,
    }))
    : [...filtrados].sort((a, b) => b.inicioMs - a.inicioMs).map((c) => ({
      clave: `${c.inicioMs}-${c.texto}`,
      texto: c.texto,
      cola: `${fechaHora(c.inicioMs)} · ${turnoCorto(c.shiftId)}`,
    }))

  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-footnote font-semibold text-foreground">Comentarios de {causa}</h4>
        <span className="text-caption tabular-nums text-muted-foreground">{filtrados.length} de {todos.length} en el período</span>
      </div>
      {todos.length === 0 ? (
        <p className="text-footnote text-muted-foreground">Esta causa no tiene comentarios en el período.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.palabra}
                type="button"
                aria-pressed={palabra === c.palabra}
                onClick={() => onPalabra(palabra === c.palabra ? null : c.palabra)}
                className={cn(
                  'min-h-[44px] rounded-ctl px-3 text-caption tabular-nums',
                  palabra === c.palabra ? 'bg-card font-semibold text-accent ring-1 ring-accent' : 'bg-muted text-foreground',
                )}
              >
                {c.palabra} <b className="font-semibold">{c.n}</b>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 min-[561px]:flex-row min-[561px]:items-center">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => onBusqueda(e.target.value)}
              placeholder="Buscar en los comentarios"
              aria-label="Buscar en los comentarios"
              className="min-h-[44px] min-w-0 flex-1 rounded-ctl bg-muted px-3 text-footnote text-foreground placeholder:text-muted-foreground"
            />
            <SegmentedControl<'grupo' | 'fecha'>
              ariaLabel="Orden de comentarios"
              value={modo}
              onChange={onModo}
              segments={[{ value: 'grupo', label: 'Agrupados' }, { value: 'fecha', label: 'Por fecha' }]}
            />
          </div>
          <ul className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
            {filas.length === 0 ? (
              <li className="text-footnote text-muted-foreground">Ningún comentario coincide.</li>
            ) : filas.map((f) => (
              <li key={f.clave} className="text-footnote text-foreground">
                <span className="break-words">{f.texto}</span>
                <span className="block text-caption tabular-nums text-muted-foreground">{f.cola}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

type InformeDatos = NonNullable<ReturnType<typeof datosInforme>>

/** Informe: resultado, mejoraron y empeoraron, prioridad 1, detalle por causa y comentarios clave. */
function InformeJackKnife({ planta, informe, ahoraTxt, antesTxt, horasAhora, horasAntes, vistaTxt, pdfEnCurso, errorPdf, onPdf }: {
  planta: string
  informe: InformeDatos
  ahoraTxt: string
  antesTxt: string
  horasAhora: number
  horasAntes: number
  vistaTxt: string
  pdfEnCurso: boolean
  errorPdf: boolean
  onPdf: () => void
}) {
  const i = informe
  const signo = i.variacionPct <= 0 ? '−' : '+'
  const resultadoTxt = i.resultado === 'se_mantiene' ? 'se mantiene' : i.resultado === 'mejoro' ? 'mejoró' : 'empeoró'
  return (
    <section aria-label="Informe Jack-Knife" className="space-y-4 pt-2 text-footnote text-foreground">
      <h4 className="text-headline font-semibold">Informe Jack-Knife · {planta}</h4>
      <p className="text-caption tabular-nums text-muted-foreground">
        Ahora: {ahoraTxt} ({i.nAhora} {plural(i.nAhora, 'turno', 'turnos')}) · Antes: {antesTxt} ({i.nAntes} {plural(i.nAntes, 'turno', 'turnos')}) · {vistaTxt}. Fuente: detenciones imputadas en Shoplogix, causas del balde Mantención.
      </p>

      <div className="space-y-1">
        <h5 className="font-semibold">Resultado</h5>
        <p className="tabular-nums">
          La detención atribuida a Mantención pasó de {dec1(i.minTurnoAntes)} a {dec1(i.minTurnoAhora)} min por turno ({signo}{dec(Math.abs(i.variacionPct), 0)} %): {resultadoTxt}. En total, {hrs(horasAntes)} antes y {hrs(horasAhora)} ahora.
        </p>
        <p>
          <b>Mejoraron ({i.mejoraron.length}):</b> {i.mejoraron.join(', ') || 'ninguna'}. <b>Empeoraron o aparecieron ({i.empeoraron.length}):</b> {i.empeoraron.join(', ') || 'ninguna'}.
        </p>
        {i.prioridad1.length > 0 && (
          <p><b>Prioridad 1 ahora:</b> {i.prioridad1.join(', ')}: se repiten más que el promedio y tardan más en repararse.</p>
        )}
      </div>

      <div className="space-y-2">
        <h5 className="font-semibold">Detalle por causa (por cada 10 turnos)</h5>
        <ul className="space-y-3">
          {i.filas.map((f) => (
            <li key={f.causa} className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="min-w-0 break-words font-semibold">{f.causa}</span>
                <span className={cn('text-caption font-semibold', TONO_VEREDICTO[f.veredicto])}>{ETIQUETA_VEREDICTO[f.veredicto]}</span>
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-caption tabular-nums">
                <dt className="text-muted-foreground">Eventos antes → ahora</dt>
                <dd className="text-foreground">{dec1(f.evAntes10)} → {dec1(f.evAhora10)}</dd>
                <dt className="text-muted-foreground">Reparación antes → ahora</dt>
                <dd className="text-foreground">{f.antes ? `${dec1(f.antes.mttr)} min` : '—'} → {f.ahora ? `${dec1(f.ahora.mttr)} min` : '—'}</dd>
                <dt className="text-muted-foreground">Min. detenido antes → ahora</dt>
                <dd className="text-foreground">{dec(f.minAntes10, 0)} → {dec(f.minAhora10, 0)}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1">
        <h5 className="font-semibold">Qué dicen los comentarios</h5>
        {i.comentariosClave.length === 0 ? (
          <p>Sin causas prioritarias ni empeoradas.</p>
        ) : i.comentariosClave.map((g) => (
          <p key={g.causa} className="break-words">
            <b>{g.causa}:</b>{' '}
            {g.top.length ? g.top.map((t) => `«${t.texto}»${t.n > 1 ? ` ×${t.n}` : ''}`).join(' · ') : 'sin comentarios en el período.'}
          </p>
        ))}
      </div>

      <p className="text-caption text-muted-foreground">
        Regla: una causa mejora o empeora si sus minutos por turno cambian más de 10 %. Las horas y los eventos se llevan a cada 10 turnos para comparar períodos de distinto largo. El PDF trae un QR que abre esta misma vista.
      </p>

      <div className="flex flex-col gap-2 min-[561px]:flex-row min-[561px]:items-center">
        <Button variant="filled" size="md" onClick={onPdf} disabled={pdfEnCurso} className="gap-2">
          <FileDown aria-hidden />
          {pdfEnCurso ? 'Preparando PDF…' : 'Descargar PDF'}
        </Button>
        {errorPdf && <p role="alert" className="text-footnote text-ink-crit">No se pudo generar el PDF. Intenta de nuevo.</p>}
      </div>
    </section>
  )
}

export function JackKnifeCard({ plantSlug }: { plantSlug: string }) {
  // Filtros desde el QR o el link del informe (#jk=…), leídos una sola vez al abrir.
  const [inicial] = useState(() => leerEstadoJK(window.location.hash, plantSlug))
  const [crudos, setCrudos] = useState<TurnoCrudo[] | null>(null)
  const [error, setError] = useState(false)
  const [vista, setVista] = useState<VistaJK>(inicial?.vs ?? 'imp')
  const [preset, setPreset] = useState<VentanaJK | 'libre'>(inicial?.v ?? '90')
  const [manual, setManual] = useState<RangoJK | null>(null)
  const [modoCmp, setModoCmp] = useState<ModoCmpJK>(inicial?.cmp ?? 'ant')
  const [manualAntes, setManualAntes] = useState<RangoJK | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [palabra, setPalabra] = useState<string | null>(null)
  const [modoCom, setModoCom] = useState<'grupo' | 'fecha'>('grupo')
  const [verInforme, setVerInforme] = useState(false)
  const [pdfEnCurso, setPdfEnCurso] = useState(false)
  const [errorPdf, setErrorPdf] = useState(false)
  const [ancho, setAncho] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const pendienteURL = useRef(inicial)

  useEffect(() => {
    let vivo = true
    setCrudos(null)
    setError(false)
    cargarTurnosCrudos(plantSlug)
      .then((r) => { if (vivo) setCrudos(r) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [plantSlug])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    setAncho(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const prep = useMemo(() => prepararTurnos(crudos ?? []), [crudos])
  const turnos: TurnoJK[] = prep.turnos
  const n = turnos.length

  // Filtros del enlace: los extremos manuales llegan como id de turno.
  useEffect(() => {
    const e = pendienteURL.current
    if (!e || !turnos.length) return
    pendienteURL.current = null
    const idx = (id?: string) => (id ? turnos.findIndex((t) => t.id === id) : -1)
    const ha = idx(e.ha)
    const hb = idx(e.hb)
    const ca = idx(e.ca)
    const cb = idx(e.cb)
    if (ha >= 0 && hb >= 0) setManual({ desde: Math.min(ha, hb), hasta: Math.max(ha, hb) })
    if (ca >= 0 && cb >= 0) setManualAntes({ desde: Math.min(ca, cb), hasta: Math.max(ca, cb) })
  }, [turnos])

  const win = useMemo(() => {
    if (preset !== 'libre') return ventanaJK(turnos, preset)
    if (!manual || n === 0) return ventanaJK(turnos, '90')
    const desde = Math.min(Math.max(0, manual.desde), n - 1)
    const hasta = Math.min(Math.max(manual.hasta, desde), n - 1)
    return { desde, hasta }
  }, [turnos, preset, manual, n])

  const calc = useMemo(
    () => calcularJackKnife(turnos, win.desde, win.hasta, vista),
    [turnos, win.desde, win.hasta, vista],
  )

  // Período de comparación. «Elegir a mano» parte con el período anterior.
  const antesEf: RangoJK = manualAntes ?? previaAnterior(win.desde, win.hasta) ?? { desde: 0, hasta: 0 }
  const previa: PreviaJK | null = useMemo(
    () => (modoCmp === 'mano' ? previaJK(turnos, win, 'mano', antesEf) : previaJK(turnos, win, modoCmp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [turnos, win.desde, win.hasta, modoCmp, antesEf.desde, antesEf.hasta],
  )
  const antesCalc = useMemo(
    () => (previa ? calcularJackKnife(turnos, previa.desde, previa.hasta, vista) : null),
    [turnos, previa, vista],
  )
  const resumen = useMemo(() => resumenComparacion(calc, antesCalc, previa), [calc, antesCalc, previa])
  const informe = useMemo(
    () => (verInforme && previa && antesCalc ? datosInforme(turnos, calc, antesCalc, previa) : null),
    [verInforme, turnos, calc, antesCalc, previa],
  )
  const nAhoraT = win.hasta - win.desde + 1
  const nAntesT = previa ? previa.hasta - previa.desde + 1 : 0
  const plantaTxt = plantSlug === 'chonchi' ? 'Chonchi' : plantSlug === 'yal' ? 'Yal' : plantSlug
  // Causas que tuvieron eventos antes y ahora no: la lista de la tarjeta no las dibuja.
  const soloAntes = antesCalc ? antesCalc.pts.filter((p) => !calc.pts.some((q) => q.k === p.k)) : []

  /** Enlace de esta vista con los mismos filtros, para el QR del PDF. */
  const urlVista = () => {
    const estado = {
      pl: plantSlug,
      v: preset,
      vs: vista,
      cmp: modoCmp,
      ...(preset === 'libre' && n ? { ha: turnos[win.desde]?.id, hb: turnos[win.hasta]?.id } : {}),
      ...(modoCmp === 'mano' && previa ? { ca: turnos[previa.desde]?.id, cb: turnos[previa.hasta]?.id } : {}),
    }
    return `${window.location.origin}${window.location.pathname}${codificarEstadoJK(estado)}`
  }

  const descargarPdf = async () => {
    if (!informe || !previa || !antesCalc) return
    setPdfEnCurso(true)
    setErrorPdf(false)
    try {
      const { exportarInformeJackKnifePDF } = await import('@/services/grader/jackKnifePdf')
      await exportarInformeJackKnifePDF({
        planta: plantaTxt,
        informe,
        ahoraTxt: rangoTexto(turnos, win),
        antesTxt: rangoTexto(turnos, previa),
        horasAhora: calc.D,
        horasAntes: antesCalc.D,
        vistaTxt: VISTAS.find((v) => v.value === vista)?.label ?? '',
        url: urlVista(),
      })
    } catch {
      setErrorPdf(true)
    } finally {
      setPdfEnCurso(false)
    }
  }

  const W = Math.max(300, ancho || 900)
  // Columnas de la lista según el ancho de la TARJETA (no del viewport): 4 ≥ 900 px, 2 ≥ 520 px, 1 si no.
  const columnasLista = ancho >= 900 ? 4 : ancho >= 520 ? 2 : 1
  const layout = useMemo(
    () => (calc.pts.length ? calcularLayout(calc, W, sel) : null),
    [calc, W, sel],
  )

  const porTotal = [...calc.pts].sort((a, b) => b.min - a.min)
  const selPunto = calc.pts.find((p) => p.k === sel) ?? porTotal[0] ?? null
  const esSin = vista === 'sin' || selPunto?.k === SIN_IMPUTAR
  const comentarios = selPunto && !esSin && n > 0
    ? comentariosDe(turnos, win.desde, win.hasta, selPunto.k, Infinity)
    : []

  const prim = calc.pts.filter((p) => p.q === 'amb')
  const sinPt = calc.pts.find((p) => p.k === SIN_IMPUTAR)
  const tesis = (() => {
    if (vista === 'sin') {
      if (!calc.pts.length) return 'No hay detenciones sin causa en esta ventana, sin contar microdetenciones.'
      const top = porTotal[0]!
      return `${calc.N} ${plural(calc.N, 'detención', 'detenciones')} sin causa anotada (${hrs(calc.D)}). La que más deja sin anotar: ${top.k}, con ${top.ev} y ${hrs(top.min)}.`
    }
    if (!calc.pts.length) return 'Sin detenciones de Mantención con causa en esta ventana.'
    const cabecera = prim.length
      ? `Prioridad 1: ${[...prim].sort((a, b) => b.min - a.min).map((p) => p.k).join(', ')}.`
      : 'Ninguna causa cae en agudas y crónicas.'
    const sinTxt = sinPt ? `, de las que ${hrs(sinPt.min)} no tienen causa.` : ' atribuidas a Mantención.'
    return `${cabecera} ${calc.N} ${plural(calc.N, 'evento', 'eventos')} y ${hrs(calc.D)} de detención${sinTxt}`
  })()

  const avisos: string[] = []
  if (vista !== 'sin' && calc.pts.length && (calc.N < 15 || calc.pts.length < 4)) {
    avisos.push(`Con ${calc.N} ${plural(calc.N, 'evento', 'eventos')} y ${calc.pts.length} ${plural(calc.pts.length, 'causa', 'causas')} los cuadrantes orientan poco: usa la lista.`)
  }
  if (calc.cob !== null && calc.cob < 0.5) {
    avisos.push(`Solo ${Math.round(calc.cob * 100)} % del tiempo detenido no planificado tiene causa anotada, contando microdetenciones: faltan eventos en este gráfico.`)
  }

  if (modoCmp !== 'no') {
    if (!previa) {
      avisos.push(modoCmp === 'mes'
        ? 'No hay turnos del mes pasado en los datos para comparar.'
        : 'No hay historia anterior a esta ventana para comparar: elige otro período.')
    } else if (previa.parcial) {
      avisos.push('La historia no alcanza para un período anterior completo: se compara con menos turnos.')
    }
  }
  const tesisCmp = resumen
    ? ` Antes: ${hrs(resumen.horasAntes)} en ${resumen.nAntes} ${plural(resumen.nAntes, 'turno', 'turnos')}; por turno ${dec1(resumen.minAntes)} → ${dec1(resumen.minAhora)} min. ${resumen.mejoraron} ${plural(resumen.mejoraron, 'causa mejoró', 'causas mejoraron')} y ${resumen.empeoraron} ${plural(resumen.empeoraron, 'empeoró', 'empeoraron')}.${resumen.parcial ? ' La historia no alcanza para un período anterior completo.' : ''}`
    : ''

  // Riel: barras por turno (escala raíz, como el mockup).
  const mxBarra = Math.max(...calc.barras, 1)
  const alturaBarra = (v: number) => (v ? Math.max(4, 100 * Math.sqrt(v / mxBarra)) : 0)
  const meses = useMemo(() => {
    const out: { i: number; t: string }[] = []
    let ult = ''
    turnos.forEach((t, i) => {
      const k = t.dateKey.slice(0, 7)
      if (k !== ult) { ult = k; out.push({ i, t: MES[Number(k.slice(5)) - 1]! }) }
    })
    const w = ancho || 600
    let prev = -1e9
    return out.filter(({ i }) => {
      const px = (w * i) / Math.max(1, n)
      if (px - prev < 44) return false
      prev = px
      return true
    })
  }, [turnos, n, ancho])

  const mover = (dir: -1 | 1) => {
    const len = win.hasta - win.desde + 1
    const max = n - 1
    let a = win.desde + dir * len
    let b = win.hasta + dir * len
    if (a < 0) { a = 0; b = len - 1 }
    if (b > max) { b = max; a = max - len + 1 }
    setManual({ desde: a, hasta: b })
    setPreset('libre')
  }

  // Al cambiar de causa o de vista se limpian el filtro y la búsqueda de comentarios.
  const elegirCausa = (k: string) => { setSel(k); setBusqueda(''); setPalabra(null) }
  const cambiarVista = (v: VistaJK) => { setVista(v); setSel(null); setBusqueda(''); setPalabra(null) }
  const cambiarPreset = (v: VentanaJK | 'libre') => { setPreset(v); setManual(null) }
  const cambiarModo = (m: ModoCmpJK) => {
    setModoCmp(m)
    if (m === 'mano') setManualAntes(previaAnterior(win.desde, win.hasta) ?? { desde: 0, hasta: 0 })
  }

  const nuevoA = (v: number) => { setManual({ desde: Math.min(v, win.hasta), hasta: win.hasta }); setPreset('libre') }
  const nuevoB = (v: number) => { setManual({ desde: win.desde, hasta: Math.max(v, win.desde) }); setPreset('libre') }
  const nuevoAntesA = (v: number) => setManualAntes({ desde: v, hasta: antesEf.hasta })
  const nuevoAntesB = (v: number) => setManualAntes({ desde: antesEf.desde, hasta: v })

  const inicioVentana = n ? turnos[win.desde]! : null
  const finVentana = n ? turnos[win.hasta]! : null
  const nTurnosVentana = n ? win.hasta - win.desde + 1 : 0

  return (
    <Card ref={rootRef} className="bg-card">
      <CardContent className="p-4 space-y-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-headline font-semibold text-foreground">Diagrama Jack-Knife de Mantención</h3>
        </div>
        <p className="text-footnote text-muted-foreground max-w-prose">
          Cada punto es una causa de Mantención: cuántas veces detuvo la línea y cuánto duró cada vez.
        </p>

        <div className="flex flex-wrap gap-2">
          <SegmentedControl<VistaJK> ariaLabel="Qué detenciones ver" value={vista} onChange={cambiarVista} segments={VISTAS} />
          <SegmentedControl<VentanaJK | 'libre'> ariaLabel="Período" value={preset} onChange={cambiarPreset} segments={PRESETS} />
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl<ModoCmpJK> ariaLabel="Comparar con" value={modoCmp} onChange={cambiarModo} segments={MODOS} />
        </div>

        {error && <p className="text-footnote text-destructive">No se pudo leer el resumen de turnos. Intenta de nuevo.</p>}
        {!error && crudos === null && <p className="text-footnote text-muted-foreground">Cargando turnos…</p>}

        {crudos !== null && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Ventana anterior"
                  disabled={win.desde === 0 || n === 0}
                  onClick={() => mover(-1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent disabled:opacity-35"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <div className="min-w-0 text-center text-footnote tabular-nums text-foreground">
                  {inicioVentana && finVentana ? (
                    nTurnosVentana === 1 ? (
                      <>
                        {fechaCorta(inicioVentana.dateKey)} · {turnoCorto(inicioVentana.shiftId)}
                        <span className="block text-caption text-muted-foreground">1 turno</span>
                      </>
                    ) : (
                      <>
                        {fechaCorta(inicioVentana.dateKey)} {turnoCorto(inicioVentana.shiftId)} a {fechaCorta(finVentana.dateKey)} {turnoCorto(finVentana.shiftId)}
                        <span className="block text-caption text-muted-foreground">{nTurnosVentana} turnos</span>
                      </>
                    )
                  ) : (
                    <span className="text-muted-foreground">Sin turnos con resumen</span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Ventana siguiente"
                  disabled={win.hasta >= n - 1 || n === 0}
                  onClick={() => mover(1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent disabled:opacity-35"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div className="relative h-24 touch-none">
                <svg
                  className="absolute inset-x-0 top-0 h-[68px] w-full"
                  viewBox={`0 0 ${Math.max(1, n)} 100`}
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  {calc.barras.map((v, i) => (
                    <rect
                      key={turnos[i]?.id ?? i}
                      x={i}
                      y={100 - alturaBarra(v)}
                      width={0.8}
                      height={alturaBarra(v)}
                      className={
                    i >= win.desde && i <= win.hasta
                      ? 'fill-accent'
                      : previa && i >= previa.desde && i <= previa.hasta
                        ? 'fill-warning'
                        : 'fill-muted-foreground opacity-40'
                  }
                    />
                  ))}
                </svg>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, n - 1)}
                  step={1}
                  value={win.desde}
                  onChange={(e) => nuevoA(Number(e.target.value))}
                  aria-label="Primer turno"
                  disabled={n === 0}
                  className={RANGO_INPUT}
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, n - 1)}
                  step={1}
                  value={win.hasta}
                  onChange={(e) => nuevoB(Number(e.target.value))}
                  aria-label="Último turno"
                  disabled={n === 0}
                  className={RANGO_INPUT}
                />
                {modoCmp === 'mano' && (
                  <>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, n - 1)}
                      step={1}
                      value={antesEf.desde}
                      onChange={(e) => nuevoAntesA(Number(e.target.value))}
                      aria-label="Primer turno de Antes"
                      disabled={n === 0}
                      className={RANGO_INPUT_ANTES}
                    />
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, n - 1)}
                      step={1}
                      value={antesEf.hasta}
                      onChange={(e) => nuevoAntesB(Number(e.target.value))}
                      aria-label="Último turno de Antes"
                      disabled={n === 0}
                      className={RANGO_INPUT_ANTES}
                    />
                  </>
                )}
                <div className="absolute inset-x-0 bottom-0 h-4 text-caption text-muted-foreground">
                  {meses.map(({ i, t }) => (
                    <span
                      key={`${i}-${t}`}
                      className="absolute -translate-x-1/2 whitespace-nowrap"
                      style={{ left: `${Math.min(96, Math.max(3, (100 * i) / Math.max(1, n)))}%` }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              {previa && (
                <p className="text-footnote tabular-nums text-foreground">
                  Ahora: {rangoTexto(turnos, win)}
                  <span className="text-muted-foreground"> · Antes: {rangoTexto(turnos, previa)}, {previa.hasta - previa.desde + 1} {plural(previa.hasta - previa.desde + 1, 'turno', 'turnos')}</span>
                </p>
              )}
              <p className="text-caption text-muted-foreground">
                Las barras son las horas de detención por turno de lo que muestra el filtro. Arrastra las dos manijas, o usa ‹ › para mover la misma ventana.
                {previa && ' En color de advertencia: el período de comparación.'}
              </p>
            </div>

            <p className="text-body font-semibold text-foreground">{tesis}{tesisCmp}</p>
            {avisos.length > 0 && <p className="text-footnote text-warning">{avisos.join(' ')}</p>}
            {prep.sinResumen > 0 && (
              <p className="text-caption text-muted-foreground">
                {prep.sinResumen} {plural(prep.sinResumen, 'turno sin resumen', 'turnos sin resumen')}: se abrieron antes de la carga del resumen. Se pueden rellenar con el script de backfill.
              </p>
            )}

            {layout ? (
              <svg
                viewBox={`0 0 ${layout.W} ${layout.H}`}
                height={layout.H}
                role="img"
                aria-label="Eventos contra MTTR por causa"
                className="block w-full"
              >
                <rect x={layout.L} y={layout.T} width={Math.max(0, layout.ux - layout.L)} height={Math.max(0, layout.uy - layout.T)} fill={Q.agu.fill} />
                <rect x={layout.ux} y={layout.T} width={Math.max(0, layout.W - layout.R - layout.ux)} height={Math.max(0, layout.uy - layout.T)} fill={Q.amb.fill} />
                <rect x={layout.L} y={layout.uy} width={Math.max(0, layout.ux - layout.L)} height={Math.max(0, layout.T + layout.ih - layout.uy)} fill={Q.ok.fill} />
                <rect x={layout.ux} y={layout.uy} width={Math.max(0, layout.W - layout.R - layout.ux)} height={Math.max(0, layout.T + layout.ih - layout.uy)} fill={Q.cro.fill} />

                {layout.xs.map(({ v, x }) => (
                  <text key={`x${v}`} x={x} y={layout.T + layout.ih + 18} textAnchor="middle" className="fill-muted-foreground text-caption">
                    {String(v).replace('.', ',')}
                  </text>
                ))}
                {layout.ys.map(({ v, y }) => (
                  <text key={`y${v}`} x={layout.L - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-caption">
                    {String(v).replace('.', ',')}
                  </text>
                ))}
                <text x={layout.L + layout.iw / 2} y={layout.H - 6} textAnchor="middle" className="fill-muted-foreground text-caption">Eventos en el período</text>
                <text transform={`translate(13 ${layout.T + layout.ih / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted-foreground text-caption">MTTR (min)</text>

                <line x1={layout.ux} y1={layout.T} x2={layout.ux} y2={layout.T + layout.ih} className="stroke-muted-foreground opacity-40" strokeDasharray="4 4" />
                <line x1={layout.L} y1={layout.uy} x2={layout.W - layout.R} y2={layout.uy} className="stroke-muted-foreground opacity-40" strokeDasharray="4 4" />

                {(
                  [
                    ['amb', 'Agudas y crónicas', layout.W - layout.R - 8, layout.T + 18, 'end'],
                    ['agu', 'Agudas', layout.L + 8, layout.T + 18, 'start'],
                    ['ok', 'Bajo control', layout.L + 8, layout.T + layout.ih - 8, 'start'],
                    ['cro', 'Crónicas', layout.W - layout.R - 8, layout.T + layout.ih - 8, 'end'],
                  ] as const
                ).map(([q, t, x, y, an]) => (
                  <text key={q} x={x} y={y} textAnchor={an} className="text-footnote font-semibold" style={{ fill: Q[q].ink }}>
                    {t}
                  </text>
                ))}

                {layout.puntos.filter((d) => d.etiqueta?.lin).map(({ p, x, y, etiqueta }) => (
                  <line key={`l-${p.k}`} x1={x} y1={y} x2={etiqueta!.cx} y2={etiqueta!.cy} className="stroke-muted-foreground opacity-40" />
                ))}
                {layout.puntos.map(({ p, x, y, rad, etiqueta }) => {
                  const color = p.k === SIN_IMPUTAR ? COLOR_SIN : Q[p.q].dot
                  const activar = () => elegirCausa(p.k)
                  return (
                    <g
                      key={p.k}
                      role="button"
                      tabIndex={0}
                      aria-label={`${p.k}: ${p.ev} ${plural(p.ev, 'evento', 'eventos')}, ${durS(p.mttr)}`}
                      onClick={activar}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activar() } }}
                      className="cursor-pointer focus-visible:outline-none"
                    >
                      <title>{p.k}</title>
                      <circle cx={x} cy={y} r={rad} fill={color} className="stroke-card" strokeWidth={1.5} />
                      {etiqueta && (
                        <text x={etiqueta.bx} y={etiqueta.by} className="fill-foreground text-footnote">{p.k}</text>
                      )}
                    </g>
                  )
                })}
              </svg>
            ) : (
              <p className="text-footnote text-muted-foreground">Sin detenciones de Mantención con causa en esta ventana.</p>
            )}

            {selPunto && (
              <div className="text-footnote space-y-1">
                <p className="font-semibold text-foreground">
                  <span style={{ color: Q[selPunto.q].ink }}>{selPunto.k} · {Q[selPunto.q].t}</span>
                </p>
                <p className="text-foreground tabular-nums">
                  {selPunto.ev} {plural(selPunto.ev, 'evento', 'eventos')} · {esSin ? 'duración media' : 'MTTR'} {durS(selPunto.mttr)} · {hrs(selPunto.min)} en total.{' '}
                  <span className="text-muted-foreground">
                    {esSin
                      ? 'Sin causa anotada: pedir la imputación al supervisor del turno; hasta entonces no se sabe si es de Mantención.'
                      : Q[selPunto.q].a}
                  </span>
                </p>
                {previa && (() => {
                  const ant = antesCalc?.pts.find((p) => p.k === selPunto.k)
                  return ant ? (
                    <p className="text-foreground">
                      <span className="text-muted-foreground">Antes → ahora, por cada 10 turnos: </span>
                      <CambioTexto nombre="eventos" antes={(ant.ev / nAntesT) * 10} ahora={(selPunto.ev / nAhoraT) * 10} unidad="" fmt={(x) => dec1(x)} />
                      {' · '}
                      <CambioTexto nombre="reparación" antes={ant.mttr} ahora={selPunto.mttr} unidad=" min" fmt={(x) => dec1(x)} />
                      {' · '}
                      <CambioTexto nombre="detenido" antes={(ant.min / nAntesT) * 10} ahora={(selPunto.min / nAhoraT) * 10} unidad=" min" fmt={(x) => dec(x, 0)} />
                    </p>
                  ) : (
                    <p className="text-foreground">
                      <span className="font-semibold text-ink-crit">Nueva:</span>{' '}
                      <span className="text-muted-foreground">no tuvo eventos en el período de comparación.</span>
                    </p>
                  )
                })()}
                {!esSin && (
                  <ComentariosCausa
                    causa={selPunto.k}
                    todos={comentarios}
                    busqueda={busqueda}
                    onBusqueda={setBusqueda}
                    palabra={palabra}
                    onPalabra={setPalabra}
                    modo={modoCom}
                    onModo={setModoCom}
                  />
                )}
              </div>
            )}

            <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${columnasLista}, minmax(0, 1fr))` }}>
              {(['amb', 'agu', 'cro', 'ok'] as const).map((k) => {
                const filas = calc.pts.filter((p) => p.q === k).sort((a, b) => b.min - a.min)
                return (
                  <div key={k} className="min-w-0">
                    <h4 className="flex items-center gap-2 text-footnote font-semibold text-foreground mb-1">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: Q[k].dot }} aria-hidden />
                      {Q[k].t}
                    </h4>
                    {filas.length ? (
                      filas.map((p) => (
                        <button
                          key={p.k}
                          type="button"
                          aria-pressed={selPunto?.k === p.k}
                          onClick={() => elegirCausa(p.k)}
                          className={cn(
                            'flex min-h-[44px] w-full items-start justify-between gap-3 text-left text-footnote tabular-nums',
                            selPunto?.k === p.k ? 'font-semibold text-brand-ink' : 'text-foreground',
                          )}
                        >
                          <span className="min-w-0 flex-1 break-words">{p.k}</span>
                          <span className="shrink-0 text-right text-caption text-muted-foreground">
                            <span className="block">{p.ev} · {durS(p.mttr)}</span>
                            {previa && (() => {
                              const v = veredicto(p, antesCalc?.pts.find((x) => x.k === p.k), nAhoraT, nAntesT)
                              return v === 'igual' ? null : (
                                <span className={cn('block font-semibold', TONO_VEREDICTO[v])}>{ETIQUETA_VEREDICTO[v]}</span>
                              )
                            })()}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="text-caption text-muted-foreground">Ninguna en este período</p>
                    )}
                  </div>
                )
              })}
            </div>

            {soloAntes.length > 0 && (
              <p className="text-caption text-muted-foreground">
                <span className="font-semibold text-ink-ok">{ETIQUETA_VEREDICTO.sinEventos}</span>: {soloAntes.map((p) => p.k).join(', ')}.
              </p>
            )}

            <div className="space-y-2">
              <Button variant="tinted" size="md" onClick={() => setVerInforme((v) => !v)} aria-expanded={verInforme} className="gap-2">
                <FileText aria-hidden />
                {verInforme ? 'Ocultar informe' : 'Generar informe'}
              </Button>
              {verInforme && (
                !previa ? (
                  <p className="text-footnote text-muted-foreground">
                    Elige un período de comparación para que el informe diga qué causas mejoraron o empeoraron.
                  </p>
                ) : !informe || !antesCalc ? (
                  <p className="text-footnote text-muted-foreground">
                    No hay eventos en el período de comparación: el informe no puede decir qué causas mejoraron.
                  </p>
                ) : (
                  <InformeJackKnife
                    planta={plantaTxt}
                    informe={informe}
                    ahoraTxt={rangoTexto(turnos, win)}
                    antesTxt={rangoTexto(turnos, previa)}
                    horasAhora={calc.D}
                    horasAntes={antesCalc.D}
                    vistaTxt={VISTAS.find((v) => v.value === vista)?.label ?? ''}
                    pdfEnCurso={pdfEnCurso}
                    errorPdf={errorPdf}
                    onPdf={() => void descargarPdf()}
                  />
                )
              )}
            </div>

            <p className="text-caption text-muted-foreground">
              {calc.N > 0 && (vista === 'sin'
                ? `Umbrales: ${dec1(calc.un)} eventos por evisceradora y ${dec1(calc.um)} min de duración media. `
                : `Umbrales: ${dec1(calc.un)} eventos por causa y ${dec1(calc.um)} min de MTTR, recalculados con cada ventana. `)}
              {calc.cob !== null && `Cobertura de causa aproximada, con microdetenciones: ${Math.round(calc.cob * 100)} %. `}
              {layout && layout.ocultas > 0 && `${layout.ocultas} ${plural(layout.ocultas, 'punto no lleva', 'puntos no llevan')} nombre para no montarse: tócalos o míralos en la lista. `}
              {vista === 'sin'
                ? 'Sin imputar se cuenta por evisceradora, para ver dónde falta anotar. No incluye microdetenciones.'
                : 'Una detención simultánea en las 3 evisceradoras cuenta como un evento.'}
              {vista === 'todas' && ' «Sin imputar» junta las detenciones sin causa de la línea, sin microdetenciones.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
