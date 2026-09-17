import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ClipboardCopy, FileDown, Loader2 } from 'lucide-react'
import { Button, Pill } from '@/components/piel'
import { useToast } from '@/hooks/useToast'
import { useHistorialBitacora } from '@/hooks/useHistorialBitacora'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { copiarHtml } from '@/lib/clipboard'
import { historialAHtmlCorreo, historialATextoPlano } from '@/services/bitacora/historialCorreo'
import { detalleRepuesto, porcentaje, tesisDelPeriodo, tituloRepuesto, type FilaTurno, type ResumenPeriodo } from '@/services/bitacora/historialBitacora'
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
  const { filas, resumen, cargando, error } = fuente.useHistorial(dias)
  const [trabajando, setTrabajando] = useState<null | 'copiar' | 'pdf'>(null)
  const [verTodosRepuestos, setVerTodosRepuestos] = useState(false)
  const abrirTurno = alAbrirTurno ?? ((turnoId: string) => navigate(`/bitacora?turno=${turnoId}`))

  const copiar = async () => {
    setTrabajando('copiar')
    try {
      await copiarHtml(
        historialAHtmlCorreo(resumen, filas, BITACORA_PLANTA.nombre),
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
      await generarPdfHistorial(resumen, filas, BITACORA_PLANTA.nombre)
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

      <section aria-label="Resumen del período" className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none sm:grid-cols-4">
        {/* Los mismos ocho del correo y del PDF: comparar la pantalla con lo
            pegado en el correo no puede dar de menos (revisión 15-09). */}
        <Kpi valor={String(resumen.eventos)} etiqueta={resumen.eventos === 1 ? 'evento' : 'eventos'} />
        <Kpi valor={formatoMinutos(resumen.minutosParada)} etiqueta={`de parada (${resumen.conParada})`} tinta={resumen.minutosParada > 0 ? 'text-ink-crit' : undefined} />
        <Kpi valor={resumen.mttrMin == null ? '—' : formatoMinutos(resumen.mttrMin)} etiqueta="MTTR" />
        <Kpi valor={String(resumen.sinDetener)} etiqueta="sin detener" tinta={resumen.sinDetener > 0 ? 'text-ink-ok' : undefined} />
        <Kpi valor={String(resumen.pendientesCerrados)} etiqueta="pendientes cerrados" tinta={resumen.pendientesCerrados > 0 ? 'text-ink-ok' : undefined} />
        <Kpi valor={String(resumen.pendientesAbiertos)} etiqueta="pendientes abiertos" tinta={resumen.pendientesAbiertos > 0 ? 'text-ink-warn' : undefined} />
        <Kpi valor={String(resumen.repuestos.length)} etiqueta={resumen.repuestos.length === 1 ? 'repuesto usado' : 'repuestos usados'} />
        <Kpi valor={String(resumen.unidadesRepuestos)} etiqueta="unidades" />
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

      <div className="grid items-start gap-5 md:grid-cols-2">
        {/* min-w-0: un hijo de grilla mide `min-width:auto` y el contenido más
            ancho de la lista estiraba la columna a 396 px, dejando la página
            con scroll horizontal a 375 px (medido 15-09). */}
        <section aria-label="Turnos del período" className="flex min-w-0 flex-col">
          <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">Turnos</h2>
          {filas.length === 0 && !cargando ? (
            <p className="rounded-card bg-card px-6 py-8 text-center text-footnote text-muted-foreground">
              Sin turnos registrados en este período.
            </p>
          ) : (
            <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
              {filas.map((f) => (
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
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section aria-label="Equipos que más pararon" className="flex min-w-0 flex-col">
            <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">Equipos que más pararon</h2>
            <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
              {resumen.equipos.length === 0 ? (
                <p className="text-footnote text-muted-foreground">Ninguna parada registrada en el período.</p>
              ) : (
                resumen.equipos.map((e) => (
                  <div key={e.equipo} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-body font-semibold">{e.equipo}</span>
                      <span className="shrink-0 text-footnote font-semibold tabular-nums text-ink-crit">{formatoMinutos(e.minutos)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15">
                      <div className="h-full rounded-full bg-ink-crit" style={{ width: `${Math.max(3, Math.round(e.parte * 100))}%` }} />
                    </div>
                    <span className="text-caption text-muted-foreground">
                      {e.paradas} {e.paradas === 1 ? 'parada' : 'paradas'} · {porcentaje(e.parte)} del total
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Repuestos usados (mockup aprobado 17-09): lista por repuesto, de más
              a menos unidades; el equipo va en la misma fila. */}
          <section aria-label="Repuestos usados" className="flex min-w-0 flex-col">
            <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">Repuestos usados</h2>
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
                      {r.unidades}
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
            <section aria-label="Quién registró" className="flex flex-col">
              <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">Quién registró</h2>
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
  if (!datos.length) return null
  return (
    <section aria-label="Minutos de parada por turno" className="rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
      <div className="flex items-baseline justify-between">
        <h2 className="text-footnote text-muted-foreground">Minutos de parada por turno</h2>
        <span className="text-caption tabular-nums text-muted-foreground">
          {maxReal > 0 ? `máx ${formatoMinutos(maxReal)}` : 'sin paradas en el período'}
        </span>
      </div>
      {/* min-w por barra + scroll: con 30 días (hasta 90 turnos) las barras
          quedaban en menos de 1 px y el gráfico se veía vacío. */}
      <div className="mt-2 flex h-24 items-end gap-[3px] overflow-x-auto">
        {datos.map((f) => {
          const alto = f.resumen.minutosParada > 0 ? Math.max(4, Math.round((f.resumen.minutosParada / max) * 100)) : 3
          return (
            <div
              key={f.turnoId}
              className={`min-h-[2px] min-w-[5px] flex-1 rounded-t-[3px] ${f.resumen.minutosParada > 0 ? 'bg-ink-crit' : 'bg-ink-ok'}`}
              style={{ height: `${alto}%` }}
              title={`${etiquetaCortaTurno(f.turnoId)}: ${f.resumen.conParada ? formatoMinutos(f.resumen.minutosParada) : 'sin paradas'}`}
            />
          )
        })}
      </div>
      <div className="flex items-baseline justify-between pt-1 text-caption text-muted-foreground">
        <span>{datos[0] ? etiquetaCortaTurno(datos[0].turnoId).replace('Turno ', '') : ''}</span>
        <span>verde: turno sin paradas</span>
        <span>{datos[datos.length - 1] ? etiquetaCortaTurno(datos[datos.length - 1]!.turnoId).replace('Turno ', '') : ''}</span>
      </div>
    </section>
  )
}

function Kpi({ valor, etiqueta, tinta }: { valor: string; etiqueta: string; tinta?: string }) {
  return (
    <div className="min-w-0">
      <span className={`block text-title2 tabular-nums leading-tight ${tinta ?? ''}`}>{valor}</span>
      <span className="block text-footnote text-muted-foreground">{etiqueta}</span>
    </div>
  )
}
