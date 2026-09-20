import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ClipboardCopy, FileDown, Loader2 } from 'lucide-react'
import { Button, Pill } from '@/components/piel'
import { useToast } from '@/hooks/useToast'
import { useHistorialBitacora } from '@/hooks/useHistorialBitacora'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { copiarHtml } from '@/lib/clipboard'
import { historialAHtmlCorreo, historialATextoPlano } from '@/services/bitacora/historialCorreo'
import {
  compararPeriodos,
  detalleRepuesto,
  parteParada,
  porcentaje,
  porcentajeFino,
  tesisDelPeriodo,
  tituloRepuesto,
  type ResumenPeriodo,
  type Tendencia,
} from '@/services/bitacora/historialBitacora'
import { MINUTOS_SIN_PRODUCCION_POR_TURNO } from '@/services/bitacora/mtbf'
import {
  agrupacionPara,
  duracionesFallas,
  fallasRepetidas,
  paretoEquipos,
  respuestaIntervenciones,
  respuestaReparacion,
  respuestaRepetidas,
  respuestaTendencia,
  serieIntervenciones,
  serieParada,
} from '@/services/bitacora/preguntasHistorial'
import {
  GraficoIntervenciones,
  GraficoPareto,
  GraficoPerdidaLinea,
  GraficoReparacion,
  GraficoTendencia,
  ListaRepetidas,
  PanelPregunta,
} from '@/components/bitacora/GraficosHistorial'
import { perdidaDeLinea, respuestaPerdida } from '@/services/bitacora/pesoDeLinea'
import { leerLineas } from '@/services/lineasProceso/lineasProceso.service'
import type { GrafoLineas } from '@/services/lineasProceso/modeloLineas'
import { etiquetaCortaTurno } from '@/services/bitacora/entregaTurno'
import { formatoMinutos } from '@/services/bitacora/turnoMantencion'

/**
 * Historial de la Bitácora (mockup aprobado 15-09-2026).
 *
 * Encabeza lo hecho SIN DETENER la línea, no la parada: es lo que demuestra el
 * aporte de Mantención; la parada sola se lee como culpa. Todo sale de los
 * eventos ya registrados — no hay nada que llenar aparte.
 */

const PERIODOS = [7, 14, 30] as const
/** Repuestos a la vista antes de «Ver todos». */
const MAX_REPUESTOS = 8
/** Turnos a la vista antes de «Ver los N turnos»: con 14 días eran 30 filas antes de los equipos. */
const MAX_TURNOS = 6

export interface FuenteHistorial {
  useHistorial: (dias: number) => ReturnType<typeof useHistorialBitacora>
}

export const FUENTE_HISTORIAL: FuenteHistorial = { useHistorial: useHistorialBitacora }

export function HistorialBitacoraPage() {
  return <HistorialBitacoraVista fuente={FUENTE_HISTORIAL} />
}

export function HistorialBitacoraVista({ fuente, alAbrirTurno }: { fuente: FuenteHistorial; alAbrirTurno?: (turnoId: string) => void }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [dias, setDias] = useState<number>(14)
  const { eventos, filas, resumen, resumenAnterior, cargando, error } = fuente.useHistorial(dias)
  const [trabajando, setTrabajando] = useState<null | 'copiar' | 'pdf'>(null)
  const [verTodosRepuestos, setVerTodosRepuestos] = useState(false)
  const [verTodosTurnos, setVerTodosTurnos] = useState(false)
  // Reglas de análisis de datos (Orel, 19-09-2026): cada cifra responde una pregunta y
  // lleva contra qué se compara — ¿es mucho? (% del tiempo de producción) y ¿mejoramos?
  // (el período anterior, solo si está completo).
  const comparacion = useMemo(() => compararPeriodos(resumen, resumenAnterior ?? null), [resumen, resumenAnterior])
  const pParada = parteParada(resumen)
  const horasProduccionTurno = formatoMinutos(480 - MINUTOS_SIN_PRODUCCION_POR_TURNO)
  // Las cinco preguntas del Historial (mockup aprobado 19-09-2026): cada gráfico
  // tiene su respuesta calculada con los mismos datos que dibuja.
  const agrupar = agrupacionPara(dias)
  const porParada = useMemo(() => serieParada(filas, agrupar), [filas, agrupar])
  const tendencia = useMemo(() => respuestaTendencia(porParada), [porParada])
  const pareto = useMemo(() => paretoEquipos(resumen), [resumen])
  const porIntervencion = useMemo(() => serieIntervenciones(filas, agrupar), [filas, agrupar])
  const intervenciones = useMemo(() => respuestaIntervenciones(porIntervencion), [porIntervencion])
  const duraciones = useMemo(() => duracionesFallas(eventos), [eventos])
  const reparacion = useMemo(() => respuestaReparacion(duraciones), [duraciones])
  const repetidas = useMemo(() => fallasRepetidas(eventos), [eventos])
  /**
   * Las líneas de proceso, para pasar de «máquina detenida» a «línea perdida». Se lee una
   * vez: es un solo documento. Si todavía no existe, el bloque lo dice en vez de inventar.
   */
  const [lineas, setLineas] = useState<GrafoLineas | null>(null)
  useEffect(() => {
    let vivo = true
    leerLineas(BITACORA_PLANTA.id)
      .then((g) => vivo && setLineas(g))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [])
  const perdida = useMemo(() => perdidaDeLinea(resumen.equiposTodos, lineas), [resumen, lineas])
  const respPerdida = useMemo(() => respuestaPerdida(perdida, (m) => formatoMinutos(Math.round(m))), [perdida])
  const unidadSerie = agrupar === 'dia' ? 'día' : 'semana'
  const abrirTurno = alAbrirTurno ?? ((turnoId: string) => navigate(`/bitacora?turno=${turnoId}`))

  const copiar = async () => {
    setTrabajando('copiar')
    try {
      await copiarHtml(
        historialAHtmlCorreo(resumen, filas, BITACORA_PLANTA.nombre, eventos),
        historialATextoPlano(resumen, filas, BITACORA_PLANTA.nombre),
      )
      toast({ title: 'Resumen copiado', description: 'Pégalo en el correo con Ctrl+V.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar', description: 'El navegador bloqueó el portapapeles.', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  const exportarPdf = async () => {
    setTrabajando('pdf')
    try {
      const { generarPdfHistorial } = await import('@/services/bitacora/historialPdf')
      await generarPdfHistorial(resumen, filas, BITACORA_PLANTA.nombre, eventos)
      toast({ title: 'PDF descargado', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo generar el PDF', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1">
        <div className="min-w-0">
          <Button variant="plain" className="-ml-2" onClick={() => navigate('/bitacora')}>
            <ChevronLeft /> Bitácora
          </Button>
          <h1 className="text-display">Historial</h1>
          <p className="text-footnote text-muted-foreground">
            {cargando ? 'Cargando…' : `${resumen.turnos} ${resumen.turnos === 1 ? 'turno registrado' : 'turnos registrados'}`} · {BITACORA_PLANTA.nombre}
          </p>
        </div>
        <div className="hidden flex-wrap gap-2 md:flex">
          <Button variant="tinted" onClick={exportarPdf} disabled={!!trabajando || cargando}>
            {trabajando === 'pdf' ? <Loader2 className="animate-spin" /> : <FileDown />} Exportar PDF
          </Button>
          <Button onClick={copiar} disabled={!!trabajando || cargando}>
            {trabajando === 'copiar' ? <Loader2 className="animate-spin" /> : <ClipboardCopy />} Copiar resumen para correo
          </Button>
        </div>
      </header>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Período">
        {PERIODOS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={dias === d}
            onClick={() => setDias(d)}
            className={[
              'min-h-[44px] shrink-0 rounded-full px-4 text-footnote font-semibold transition-colors duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              dias === d ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/10 text-foreground hover:bg-muted-foreground/15',
            ].join(' ')}
          >
            {d} días
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="px-1 text-footnote font-semibold text-ink-crit">
          {error}
        </p>
      )}

      {/* La tesis primero: la frase que se lleva a una reunión. */}
      <section className="rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
        <p className="text-title2 leading-snug">
          {cargando ? 'Calculando…' : <TesisConResalte resumen={resumen} />}
        </p>
        {!cargando && resumen.eventos > 0 && (
          <p className="pt-1 text-footnote text-muted-foreground">
            {resumen.conImpacto > 0
              ? `${porcentaje(resumen.parteSinDetener)} en ventana (colación, cambio de turno, línea sin producción)`
              : 'Ninguno detuvo ni intervino la línea en producción.'}
            {resumen.turnosSinParada > 0
              ? ` · ${resumen.turnosSinParada} de ${resumen.turnos} ${resumen.turnos === 1 ? 'turno cerró' : 'turnos cerraron'} sin ninguna parada`
              : ''}
          </p>
        )}
      </section>

      <section aria-label="Resumen del período" className="flex flex-col gap-4 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
        {/* Los mismos números del correo y del PDF, agrupados por la pregunta que
            responden (Orel, 19-09-2026: «los datos responden preguntas claras»). */}
        <div>
          <h2 className="pb-3 text-subhead font-semibold">¿Cuánto paró la línea?</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Kpi
              valor={formatoMinutos(resumen.minutosParada)}
              etiqueta={pParada != null ? `de parada · ${porcentajeFino(pParada)} del tiempo de producción` : 'de parada'}
              punto={resumen.minutosParada > 0 ? 'crit' : undefined}
              tendencia={comparacion?.parada}
            />
            <Kpi valor={String(resumen.fallas)} etiqueta={resumen.fallas === 1 ? 'falla' : 'fallas'} tendencia={comparacion?.fallas} />
            <Kpi valor={resumen.mttrMin == null ? '—' : formatoMinutos(resumen.mttrMin)} etiqueta="MTTR · tiempo medio en reparar" tendencia={comparacion?.mttr} />
            <Kpi valor={resumen.mtbfMin == null ? '—' : formatoMinutos(resumen.mtbfMin)} etiqueta="MTBF · tiempo medio entre fallas" tendencia={comparacion?.mtbf} />
          </div>
        </div>
        <div className="border-t border-muted-foreground/20 pt-4">
          <h2 className="pb-3 text-subhead font-semibold">¿Cómo trabajó Mantención?</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Kpi valor={String(resumen.eventos)} etiqueta={resumen.eventos === 1 ? 'evento registrado' : 'eventos registrados'} />
            <Kpi
              valor={String(resumen.sinDetener)}
              etiqueta={resumen.conImpacto > 0 ? `sin detener la línea · ${porcentaje(resumen.parteSinDetener)} de las intervenciones` : 'sin detener la línea'}
              punto={resumen.sinDetener > 0 ? 'ok' : undefined}
            />
            <Kpi
              valor={String(resumen.pendientesAbiertos)}
              etiqueta={`${resumen.pendientesAbiertos === 1 ? 'pendiente abierto' : 'pendientes abiertos'} · ${resumen.pendientesCerrados} ${resumen.pendientesCerrados === 1 ? 'cerrado' : 'cerrados'}`}
              punto={resumen.pendientesAbiertos > 0 ? 'warn' : resumen.pendientesCerrados > 0 ? 'ok' : undefined}
            />
            <Kpi
              valor={String(resumen.repuestos.length)}
              etiqueta={`${resumen.repuestos.length === 1 ? 'repuesto' : 'repuestos'} · ${resumen.unidadesRepuestos} ${resumen.unidadesRepuestos === 1 ? 'unidad' : 'unidades'}`}
            />
          </div>
        </div>
        {!cargando && resumen.turnos > 0 && (
          <p className="text-caption text-muted-foreground">
            {comparacion
              ? `▲▼ contra los ${dias} días anteriores (${resumenAnterior?.turnos ?? 0} turnos): verde es mejor, rojo es peor. `
              : `Todavía no hay ${dias} días anteriores completos para comparar: la bitácora se usa desde el 15-09-2026. `}
            Tiempo de producción: {resumen.turnos} {resumen.turnos === 1 ? 'turno' : 'turnos'} × {horasProduccionTurno} (8 h menos {formatoMinutos(MINUTOS_SIN_PRODUCCION_POR_TURNO)} sin producción).
          </p>
        )}
      </section>

      {/* Acciones de móvil (en PC van en el encabezado). */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        <Button variant="tinted" onClick={copiar} disabled={!!trabajando || cargando}>
          {trabajando === 'copiar' ? <Loader2 className="animate-spin" /> : <ClipboardCopy />} Copiar
        </Button>
        <Button variant="tinted" onClick={exportarPdf} disabled={!!trabajando || cargando}>
          {trabajando === 'pdf' ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
        </Button>
      </div>

      {!cargando && resumen.eventos > 0 && (
        <>
          {/* 5 va primero: es la que pide acción (alerta temprana). */}
          <PanelPregunta
            pregunta="¿Qué falla se está repitiendo?"
            respuesta={respuestaRepetidas(repetidas, dias)}
            referencia="Equipos con 2 o más fallas en el período, el más repetido primero: actuar antes de la próxima."
          >
            <ListaRepetidas lista={repetidas} dias={dias} />
          </PanelPregunta>
          <div className="grid items-start gap-5 md:grid-cols-2">
            <PanelPregunta
              pregunta="¿La línea está parando más o menos?"
              respuesta={tendencia.titulo}
              referencia={`% del tiempo de producción parado, por ${unidadSerie} · línea punteada: promedio del período (${porcentajeFino(tendencia.promedio)}). Bajo la línea, mejor que lo habitual.`}
            >
              <GraficoTendencia serie={porParada} promedio={tendencia.promedio} />
            </PanelPregunta>
            <PanelPregunta
              pregunta="¿Dónde se concentra la parada?"
              respuesta={pareto.titulo}
              referencia="Parada por equipo, de mayor a menor · el % es ACUMULADO: en rojo, los que juntos suman el 70 %, donde conviene atacar primero."
            >
              <GraficoPareto barras={pareto.barras} />
            </PanelPregunta>
            {respPerdida && (
              <PanelPregunta
                pregunta="¿Cuánto de eso le costó a la línea?"
                respuesta={respPerdida.titulo}
                referencia={
                  <>
                    {respPerdida.detalle} La cuota de cada máquina sale del editor de líneas de proceso: una de tres máquinas en paralelo pesa un tercio; una en serie,
                    toda la línea. <span className="text-muted-foreground/80">Barra gris: máquina detenida · barra azul: línea perdida.</span>
                  </>
                }
              >
                <GraficoPerdidaLinea perdida={perdida} />
              </PanelPregunta>
            )}
            <PanelPregunta
              pregunta="¿Mantención interviene sin detener la línea?"
              respuesta={intervenciones.titulo}
              referencia={
                <>
                  Intervenciones por {unidadSerie} · <span className="font-semibold text-ink-ok">verde: sin detener</span> (abajo) ·{' '}
                  <span className="font-semibold text-ink-crit">rojo: con parada</span>
                </>
              }
            >
              <GraficoIntervenciones serie={porIntervencion} />
            </PanelPregunta>
            <PanelPregunta
              pregunta="¿Cuánto tardamos en reparar?"
              respuesta={reparacion.titulo}
              referencia={
                duraciones.length >= 5 && reparacion.promedio != null
                  ? `Cada punto es una falla · la raya: la mitad de las fallas a cada lado (mediana). El promedio da ${formatoMinutos(Math.round(reparacion.promedio))}: lo suben las fallas largas de la derecha, que son las que hay que mirar.`
                  : 'Cada punto es una falla con su duración.'
              }
            >
              {duraciones.length > 0 && <GraficoReparacion duraciones={duraciones} mediana={reparacion.mediana} p80={reparacion.p80} />}
            </PanelPregunta>
          </div>
        </>
      )}

      {/* Teléfono: equipos → repuestos → turnos → quién (lo que dice DÓNDE actuar,
          arriba; antes estaba detrás de 30 turnos). PC: dos columnas como antes. */}
      <div className="grid items-start gap-5 md:grid-cols-2">
        {/* min-w-0: un hijo de grilla mide `min-width:auto` y el contenido más
            ancho de la lista estiraba la columna a 396 px, dejando la página
            con scroll horizontal a 375 px (medido 15-09). */}
        <section aria-label="Turnos del período" className="order-3 flex min-w-0 flex-col md:order-none">
          <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">¿Cómo fue cada turno?</h2>
          {filas.length === 0 && !cargando ? (
            <p className="rounded-card bg-card px-6 py-8 text-center text-footnote text-muted-foreground">
              Sin turnos registrados en este período.
            </p>
          ) : (
            <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
              {(verTodosTurnos ? filas : filas.slice(0, MAX_TURNOS)).map((f) => (
                <button
                  key={f.turnoId}
                  type="button"
                  onClick={() => abrirTurno(f.turnoId)}
                  className='relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-body font-semibold">{etiquetaCortaTurno(f.turnoId)}</span>
                      {/* Sus números todavía están corriendo: el turno en curso no
                          se puede leer igual que uno cerrado. */}
                      {f.enCurso ? <Pill tone="info" dot="pulse">En curso</Pill> : null}
                    </span>
                    <span className="block text-caption text-muted-foreground">
                      {f.resumen.eventos} {f.resumen.eventos === 1 ? 'evento' : 'eventos'} · {f.resumen.enVentana} sin detener
                      {f.pendientesAbiertos ? ` · ${f.pendientesAbiertos} pendiente${f.pendientesAbiertos === 1 ? '' : 's'}` : ''}
                    </span>
                  </span>
                  <span className={`shrink-0 text-footnote font-semibold tabular-nums ${f.resumen.minutosParada > 0 ? 'text-ink-crit' : 'text-muted-foreground'}`}>
                    {f.resumen.conParada ? formatoMinutos(f.resumen.minutosParada) : '—'}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                </button>
              ))}
              {filas.length > MAX_TURNOS && (
                <button
                  type="button"
                  onClick={() => setVerTodosTurnos((v) => !v)}
                  className='relative flex min-h-[44px] w-full items-center px-4 text-left text-footnote font-semibold text-primary before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
                >
                  {verTodosTurnos ? 'Ver menos' : `Ver los ${filas.length} turnos`}
                </button>
              )}
            </div>
          )}
        </section>

        <div className="contents md:flex md:min-w-0 md:flex-col md:gap-5">

          {/* Repuestos usados (mockup aprobado 17-09): lista por repuesto, de más
              a menos unidades; el equipo va en la misma fila. */}
          <section aria-label="Repuestos usados" className="order-2 flex min-w-0 flex-col md:order-none">
            <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">¿Qué repuestos salieron de bodega?</h2>
            <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
              {resumen.repuestos.length === 0 ? (
                <p className="p-4 text-footnote text-muted-foreground">Ningún repuesto registrado en el período.</p>
              ) : (
                (verTodosRepuestos ? resumen.repuestos : resumen.repuestos.slice(0, MAX_REPUESTOS)).map((r) => (
                  <div
                    key={r.codigoSAP}
                    className='relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-3 before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
                  >
                    <span className="min-w-0 truncate text-body font-semibold">{tituloRepuesto(r)}</span>
                    <span className="text-right text-body font-semibold tabular-nums">
                      {r.unidades} <span className="text-footnote font-normal">un.</span>
                      <span className="block text-caption font-normal text-muted-foreground">
                        {r.eventos} {r.eventos === 1 ? 'evento' : 'eventos'}
                      </span>
                    </span>
                    <span className="col-span-2 truncate text-caption tabular-nums text-muted-foreground">{detalleRepuesto(r)}</span>
                    <span className="col-span-2 text-caption text-muted-foreground">
                      {[...r.equipos, r.ultimoTurnoId ? etiquetaCortaTurno(r.ultimoTurnoId) : ''].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                ))
              )}
            </div>
            {resumen.repuestos.length > MAX_REPUESTOS && (
              <button
                type="button"
                className="min-h-[44px] px-4 text-left text-footnote font-semibold text-primary"
                onClick={() => setVerTodosRepuestos((v) => !v)}
              >
                {verTodosRepuestos ? 'Ver menos' : `Ver todos (${resumen.repuestos.length})`}
              </button>
            )}
            <p className="px-4 pt-2 text-caption text-muted-foreground">Unidades por código SAP, de mayor a menor: lo que Mantención sacó de bodega para la línea.</p>
          </section>

          {resumen.porTecnico.length > 0 && (
            <section aria-label="Quién registró" className="order-4 flex flex-col md:order-none">
              <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">¿Quién está registrando?</h2>
              <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
                {resumen.porTecnico.map((t) => (
                  <div
                    key={t.nombre}
                    className='relative flex min-h-[44px] items-center justify-between gap-3 px-4 py-2 before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
                  >
                    <span className="min-w-0 truncate text-body">{t.nombre}</span>
                    <span className="shrink-0 text-footnote font-semibold tabular-nums">
                      {t.eventos} <span className="font-normal text-muted-foreground">{t.eventos === 1 ? 'evento' : 'eventos'}</span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="px-4 pt-2 text-caption text-muted-foreground">Para saber si todos están usando la bitácora, no para comparar personas.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function TesisConResalte({ resumen }: { resumen: ResumenPeriodo }) {
  const texto = tesisDelPeriodo(resumen)
  const marca = resumen.sinDetener > 0 ? `${resumen.sinDetener} ${resumen.sinDetener === 1 ? 'se hizo' : 'se hicieron'} sin detener la línea` : ''
  if (!marca || !texto.includes(marca)) return <>{texto}</>
  const [antes, despues] = texto.split(marca)
  return (
    <>
      {antes}
      <span className="font-semibold text-ink-ok">{marca}</span>
      {despues}
    </>
  )
}

const PUNTO = { ok: 'bg-ink-ok', warn: 'bg-ink-warn', crit: 'bg-ink-crit' } as const

/** Cifra en tinta normal; el estado, en un punto junto al rótulo (DESIGN.md §10). */
function Kpi({ valor, etiqueta, punto, tendencia }: { valor: string; etiqueta: string; punto?: keyof typeof PUNTO; tendencia?: Tendencia | null }) {
  return (
    <div className="min-w-0">
      <span className="block text-title2 tabular-nums leading-tight">{valor}</span>
      <span className="block text-footnote text-muted-foreground">
        {punto && <span className={`mr-1.5 inline-block size-2 rounded-full align-middle ${PUNTO[punto]}`} aria-hidden />}
        {etiqueta}
      </span>
      {/* ¿Mejoramos? El valor del período anterior, con flecha: verde mejor, rojo peor. */}
      {tendencia && (
        <span
          className={`block text-caption font-semibold tabular-nums ${tendencia.mejora == null ? 'text-muted-foreground' : tendencia.mejora ? 'text-ink-ok' : 'text-ink-crit'}`}
        >
          {tendencia.sentido === 'sube' ? '▲' : tendencia.sentido === 'baja' ? '▼' : '='} antes {tendencia.antes}
          <span className="sr-only">{tendencia.mejora == null ? ', sin cambio' : tendencia.mejora ? ', mejoró' : ', empeoró'}</span>
        </span>
      )}
    </div>
  )
}
