import { useMemo, useState } from 'react'
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
  promedioParadaPorTurno,
  resumenGraficoParadas,
  tesisDelPeriodo,
  tituloRepuesto,
  type FilaTurno,
  type ResumenPeriodo,
  type Tendencia,
} from '@/services/bitacora/historialBitacora'
import { MINUTOS_SIN_PRODUCCION_POR_TURNO } from '@/services/bitacora/mtbf'
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

      <GraficoParadas filas={filas} />

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
          <section aria-label="Equipos que más pararon" className="order-1 flex min-w-0 flex-col md:order-none">
            <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">¿Qué equipos pararon más?</h2>
            <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
              {resumen.equipos.length === 0 ? (
                <p className="text-footnote text-muted-foreground">Ninguna parada registrada en el período.</p>
              ) : (
                resumen.equipos.map((e) => (
                  <div key={e.equipo} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      {/* Completo, en dos líneas si hace falta: cortado se perdía el «N3» que dice CUÁL máquina. */}
                      <span className="min-w-0 break-words text-body font-semibold">{e.equipo}</span>
                      <span className="shrink-0 text-footnote font-semibold tabular-nums text-ink-crit">{formatoMinutos(e.minutos)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15">
                      <div className="h-full rounded-full bg-ink-crit" style={{ width: `${Math.max(3, Math.round(e.parte * 100))}%` }} />
                    </div>
                    <span className="text-caption text-muted-foreground">
                      {e.paradas} {e.paradas === 1 ? 'parada' : 'paradas'} · {porcentaje(e.parte)} del total
                      {e.mtbfMin == null ? '' : ` · MTBF ${formatoMinutos(e.mtbfMin)}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

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

/**
 * Minutos de parada por turno, del más antiguo al más nuevo. Barras en CSS: son
 * pocas y el dato es una comparación simple; los turnos SIN paradas van en verde
 * porque un turno limpio también es resultado.
 */
function GraficoParadas({ filas }: { filas: readonly FilaTurno[] }) {
  const datos = useMemo(() => [...filas].reverse(), [filas])
  // El máximo REAL para el rótulo; el 1 es solo para no dividir por cero. Antes
  // el mismo número se mostraba, y una semana sin ninguna parada anunciaba
  // «máx 1 min», un dato que no existía (revisión 15-09).
  const maxReal = Math.max(0, ...datos.map((f) => f.resumen.minutosParada))
  const max = Math.max(1, maxReal)
  // HIG «Charts»: el título dice el HALLAZGO, no el nombre del eje — calculado
  // con los mismos datos que dibujan las barras (19-09-2026).
  const { titulo } = useMemo(() => resumenGraficoParadas(datos), [datos])
  // ¿Esto es normal? El promedio del propio período, como línea (_GUIAS: referencia
  // «promedio propio»). Cuenta los turnos sin parada.
  const promedio = useMemo(() => promedioParadaPorTurno(datos), [datos])
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const turnoSeleccionado = seleccionado ? datos.find((f) => f.turnoId === seleccionado) : null
  if (!datos.length) return null
  return (
    <section role="group" aria-label={titulo} className="rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
      {/* «máx» iba en una columna a la derecha y partía el título en el teléfono. */}
      <h2 className="text-footnote font-semibold text-foreground">{titulo}</h2>
      <p className="text-caption text-muted-foreground">
        Minutos de parada por turno
        {maxReal > 0 ? (
          <>
            {' · '}
            <span className="whitespace-nowrap">
              <span aria-hidden className="mr-1 inline-block w-3 border-t-2 border-dashed border-foreground/60 align-middle" />
              promedio {formatoMinutos(Math.round(promedio))}
            </span>
            {' · '}
            <span className="whitespace-nowrap">máx {formatoMinutos(maxReal)}</span>
          </>
        ) : (
          ' · sin paradas en el período'
        )}
      </p>
      {/* min-w por barra + scroll: con 30 días (hasta 90 turnos) las barras
          quedaban en menos de 1 px y el gráfico se veía vacío. */}
      <div className="relative mt-2 flex h-24 items-end gap-[3px] overflow-x-auto">
        {maxReal > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-foreground/60"
            style={{ bottom: `${Math.min(100, (promedio / max) * 100)}%` }}
          />
        )}
        {datos.map((f) => {
          const alto = f.resumen.minutosParada > 0 ? Math.max(4, Math.round((f.resumen.minutosParada / max) * 100)) : 3
          const etiquetaMinutos = f.resumen.conParada ? formatoMinutos(f.resumen.minutosParada) : 'sin paradas'
          const activo = seleccionado === f.turnoId
          return (
            // El ancho visual de la barra no cambia: el área táctil crece en
            // ALTO (flex items-end + h-full), no en ancho, para no desalinear
            // las barras vecinas (HIG «Charts», 19-09-2026).
            <button
              key={f.turnoId}
              type="button"
              aria-pressed={activo}
              aria-label={`${etiquetaCortaTurno(f.turnoId)}: ${f.resumen.conParada ? `${etiquetaMinutos} de parada` : 'sin paradas'}`}
              title={`${etiquetaCortaTurno(f.turnoId)}: ${etiquetaMinutos}`}
              onClick={() => setSeleccionado((prev) => (prev === f.turnoId ? null : f.turnoId))}
              className="flex min-w-[5px] flex-1 items-end self-stretch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                className={`min-h-[2px] w-full rounded-t-[3px] ${f.resumen.minutosParada > 0 ? 'bg-ink-crit' : 'bg-ink-ok'} ${activo ? 'ring-2 ring-primary' : ''}`}
                style={{ height: `${alto}%` }}
                aria-hidden
              />
            </button>
          )
        })}
      </div>
      <div className="flex items-baseline justify-between pt-1 text-caption text-muted-foreground">
        <span>{datos[0] ? etiquetaCortaTurno(datos[0].turnoId).replace('Turno ', '') : ''}</span>
        <span>verde: turno sin paradas</span>
        <span>{datos[datos.length - 1] ? etiquetaCortaTurno(datos[datos.length - 1]!.turnoId).replace('Turno ', '') : ''}</span>
      </div>
      {turnoSeleccionado && (
        <p className="pt-2 text-footnote text-foreground">
          {etiquetaCortaTurno(turnoSeleccionado.turnoId)}:{' '}
          {turnoSeleccionado.resumen.conParada ? formatoMinutos(turnoSeleccionado.resumen.minutosParada) : 'sin paradas'}
        </p>
      )}
    </section>
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
