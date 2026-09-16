import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, Check, ChevronLeft, ChevronRight, ClipboardCopy, FileDown, Loader2, MessageSquareText, NotebookPen, Plus } from 'lucide-react'
import { Button, Pill, Sheet, Tag } from '@/components/piel'
import { EventoBitacoraFila } from '@/components/bitacora/EventoBitacoraFila'
import { EventoBitacoraSheet } from '@/components/bitacora/EventoBitacoraSheet'
import { VisorFotosBitacora } from '@/components/bitacora/VisorFotosBitacora'
import { SelectorTecnico } from '@/components/bitacora/SelectorTecnico'
import { ListaTecnicosSheet, TecnicosDelTurnoSheet } from '@/components/bitacora/TecnicosTurnoSheets'
import { construirListaTecnicos, tecnicosPresentes } from '@/services/bitacora/listaTecnicos'
import { origenDePendiente } from '@/services/bitacora/entregaTurno'
import { tecnicoRecordado } from '@/components/bitacora/tecnicoRecordado'
import { useToast } from '@/hooks/useToast'
import { FUENTE_FIRESTORE, useTurnoMantencionActual, type FuenteBitacora } from '@/hooks/useBitacoraTurno'
import { BITACORA_PLANTA, ETIQUETA_TIPO } from '@/config/bitacora'
import { copiarHtml, copiarTexto } from '@/lib/clipboard'
import type { EventoBitacora, FotoEvento, TurnoMantencion } from '@/services/bitacora/bitacora.types'
import { bitacoraAHtmlCorreo, bitacoraATextoPlano, etiquetaParada, etiquetaPendientes, tituloCorreo } from '@/services/bitacora/bitacoraCorreo'
import { cargarFotoComoJpeg } from '@/services/bitacora/fotosBitacora'
import { resumirBitacora } from '@/services/bitacora/resumenBitacora'
import {
  etiquetaTurno,
  fechaTurnoLarga,
  formatoMinutos,
  horaDe,
  horarioTurno,
  turnoAdyacente,
  turnoDesdeId,
} from '@/services/bitacora/turnoMantencion'

/**
 * Bitácora de turno de Mantención.
 *
 * Móvil: se registra durante el turno (acción principal = Nuevo evento).
 * PC: se revisa lo que llegó del celular y se copia al correo (acción
 * principal = Copiar para correo), con la vista previa EXACTA de lo que se va
 * a pegar: se genera con la misma función que llena el portapapeles.
 */
export function BitacoraTurnoPage() {
  return <BitacoraTurnoVista fuente={FUENTE_FIRESTORE} />
}

export function BitacoraTurnoVista({ fuente }: { fuente: FuenteBitacora }) {
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const turnoActual = useTurnoMantencionActual()
  const turnoParam = params.get('turno')
  const [editor, setEditor] = useState<{ evento: EventoBitacora | null; idNuevo: string; turno: TurnoMantencion; pendienteOrigen?: EventoBitacora | null } | null>(null)
  // La jerarquía (702 nodos) se carga recién al abrir el editor, y queda en caché.
  const { opciones: opcionesEquipo, cargando: cargandoEquipos } = fuente.useOpcionesEquipo(Boolean(editor))
  const turnoNavegado = useMemo(() => turnoDesdeId(turnoParam) ?? turnoActual, [turnoParam, turnoActual])
  // Con el editor abierto el turno queda CONGELADO: si el reloj cruza las
  // 16:00 a mitad de escribir, el formulario no se borra y el evento se guarda
  // en el turno donde se empezó a registrar.
  const turno = editor?.turno ?? turnoNavegado
  const esActual = turno.id === turnoActual.id

  const { eventos, cargando, error, sincronizando, ultimaSync, nuevoId, guardar, borrar } = fuente.useEventos(turno)
  const calendario = fuente.useTecnicos(turno)
  const { observacion, guardarObservacion, guardarPresentes } = fuente.useObservacion(turno)
  const { ajustes, guardarAjustes } = fuente.useAjustes()
  // Lista de técnicos = planilla del calendario + ajustes; presentes = ajuste del
  // turno o, si nadie lo tocó, lo que dice el calendario.
  const listaTecnicos = useMemo(() => construirListaTecnicos(calendario.todos, ajustes), [calendario.todos, ajustes])
  const presentes = useMemo(
    () => tecnicosPresentes(observacion.presentes, calendario.deTurno, listaTecnicos),
    [observacion.presentes, calendario.deTurno, listaTecnicos],
  )
  const deTurnoCalendario = useMemo(() => tecnicosPresentes(null, calendario.deTurno, listaTecnicos).nombres, [calendario.deTurno, listaTecnicos])
  const tecnicos = useMemo(
    () => ({ deTurno: presentes.nombres, todos: listaTecnicos.map((t) => t.nombre) }),
    [presentes.nombres, listaTecnicos],
  )
  const [hojaTecnicos, setHojaTecnicos] = useState<null | 'presentes' | 'lista'>(null)
  // Borrador de «Técnicos del turno»: se toma al tocar Editar y sobrevive a ir y volver de la lista.
  const [borradorPresentes, setBorradorPresentes] = useState<string[]>([])
  // Nombre recordado en el teléfono, solo si sigue en la lista (pudo corregirse o quitarse).
  const nombreRecordadoValido = () => {
    const recordado = tecnicoRecordado()
    return tecnicos.todos.length === 0 || tecnicos.todos.includes(recordado) ? recordado : ''
  }
  const r = useMemo(() => resumirBitacora(eventos), [eventos])

  const [trabajando, setTrabajando] = useState<null | 'copiar' | 'copiar-incrustadas' | 'pdf'>(null)
  const [editandoObs, setEditandoObs] = useState(false)
  const [textoObs, setTextoObs] = useState('')
  const [quienObs, setQuienObs] = useState('')
  const [visor, setVisor] = useState<{ fotos: FotoEvento[]; indice: number; titulo: string } | null>(null)
  // Entrega de turno: pendientes abiertos de turnos anteriores.
  const { pendientes: pendientesPrevios, cerrarNoAplica } = fuente.usePendientesAnteriores(turno)
  const [noAplica, setNoAplica] = useState<EventoBitacora | null>(null)
  const [motivoNoAplica, setMotivoNoAplica] = useState('')
  const [quienNoAplica, setQuienNoAplica] = useState('')

  const abrirNuevo = useCallback(() => setEditor({ evento: null, idNuevo: nuevoId(), turno }), [nuevoId, turno])

  // `?nuevo=1` (desde la tarjeta del Inicio) abre el editor UNA vez y se quita
  // de la URL. Un solo efecto es dueño de ese parámetro.
  useEffect(() => {
    if (params.get('nuevo') !== '1') return
    abrirNuevo()
    const p = new URLSearchParams(params)
    p.delete('nuevo')
    setParams(p, { replace: true })
  }, [params, setParams, abrirNuevo])

  const irATurno = (paso: -1 | 1) => {
    const destino = turnoAdyacente(turno, paso)
    const p = new URLSearchParams(params)
    if (destino.id === turnoActual.id) p.delete('turno')
    else p.set('turno', destino.id)
    setParams(p)
  }
  const irAlActual = () => {
    const p = new URLSearchParams(params)
    p.delete('turno')
    setParams(p)
  }

  const datosCorreo = useMemo(
    () => ({
      turno,
      eventos,
      tecnicos: presentes.nombres,
      planta: BITACORA_PLANTA.nombre,
      observacion: observacion.texto,
      // Solo en el turno EN CURSO: para uno pasado, «sigue pendiente» listaba
      // los pendientes abiertos HOY, una entrega de turno que nunca ocurrió.
      pendientesAnteriores: esActual ? pendientesPrevios : [],
    }),
    [turno, eventos, presentes.nombres, observacion.texto, pendientesPrevios, esActual],
  )
  const htmlCorreo = useMemo(() => bitacoraAHtmlCorreo(datosCorreo), [datosCorreo])
  const asunto = tituloCorreo(turno)

  const copiarAsunto = async () => {
    try {
      await copiarTexto(asunto)
      toast({ title: 'Asunto copiado', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar el asunto', variant: 'destructive' })
    }
  }

  const copiar = async () => {
    setTrabajando('copiar')
    try {
      await copiarHtml(htmlCorreo, bitacoraATextoPlano(datosCorreo))
      toast({ title: 'Copiado', description: 'Pégalo en el correo con Ctrl+V.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar', description: 'El navegador bloqueó el portapapeles. Prueba de nuevo o usa el PDF.', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  /**
   * Variante para Outlook nuevo / web: las fotos van dentro del HTML (JPEG a
   * 600 px). Outlook clásico trunca las imágenes base64, por eso NO es la
   * opción por defecto.
   */
  const copiarIncrustadas = async () => {
    setTrabajando('copiar-incrustadas')
    try {
      const urls = [...new Set(eventos.flatMap((e) => (e.fotos ?? []).map((f) => f.url)))]
      const mapa = new Map<string, string>()
      await Promise.all(
        urls.map(async (u) => {
          try {
            mapa.set(u, (await cargarFotoComoJpeg(u, 600, 0.78)).dataUrl)
          } catch {
            /* esa foto queda por URL */
          }
        }),
      )
      const html = bitacoraAHtmlCorreo({ ...datosCorreo, fuenteFoto: (f) => mapa.get(f.url) ?? f.url })
      await copiarHtml(html, bitacoraATextoPlano(datosCorreo))
      toast({ title: 'Copiado con fotos incrustadas', description: 'Pensado para Outlook nuevo o web.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  const exportarPdf = async () => {
    setTrabajando('pdf')
    try {
      const { generarPdfBitacora } = await import('@/services/bitacora/bitacoraPdf')
      const { fotosFallidas } = await generarPdfBitacora(datosCorreo)
      toast({
        title: 'PDF descargado',
        description: fotosFallidas ? `${fotosFallidas} foto(s) no se pudieron incluir.` : undefined,
        variant: fotosFallidas ? 'default' : 'success',
      })
    } catch {
      toast({ title: 'No se pudo generar el PDF', variant: 'destructive' })
    } finally {
      setTrabajando(null)
    }
  }

  const sugerenciasEquipo = useMemo(() => eventos.map((e) => e.equipo).filter(Boolean), [eventos])
  const fecha = fechaTurnoLarga(turno)

  return (
    // pb-28 en móvil: el botón fijo «Nuevo evento» no debe tapar el último evento.
    <div className="flex flex-col gap-5 pb-28 md:pb-8">
      {/* Encabezado: título grande (uno por pantalla) + navegación de turnos */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1">
        <div className="min-w-0 flex-1 md:flex-none">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-display">Bitácora</h1>
            <span className="flex items-center gap-1">
              {esActual ? (
                <Pill tone="info" dot="pulse">En curso</Pill>
              ) : (
                <Button variant="plain" size="sm" onClick={irAlActual}>Ir al turno actual</Button>
              )}
              <Button variant="plain" size="sm" onClick={() => navigate('/bitacora/historial')}>
                <BarChart3 /> Historial
              </Button>
            </span>
          </div>
          {/* Navegación de turnos: una sola fila que no se parte (las flechas
              quedan siempre a los lados del turno, también a 375 px). */}
          <div className="-ml-3 mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => irATurno(-1)}
              aria-label="Turno anterior"
              className="flex size-[44px] shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1 md:flex-none">
              <p className="text-headline leading-tight">
                {etiquetaTurno(turno)} <span className="whitespace-nowrap font-normal text-muted-foreground">{horarioTurno(turno)}</span>
              </p>
              <p className="truncate text-footnote text-muted-foreground first-letter:uppercase">{fecha} · {BITACORA_PLANTA.nombre}</p>
            </div>
            <button
              type="button"
              onClick={() => irATurno(1)}
              aria-label="Turno siguiente"
              className="flex size-[44px] shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>

        {/* Acciones de PC: aquí la principal es copiar al correo. */}
        <div className="hidden flex-wrap gap-2 md:flex">
          <Button variant="tinted" onClick={abrirNuevo}>
            <Plus /> Nuevo evento
          </Button>
          <Button variant="tinted" onClick={exportarPdf} disabled={!!trabajando}>
            {trabajando === 'pdf' ? <Loader2 className="animate-spin" /> : <FileDown />} Exportar PDF
          </Button>
          <Button onClick={copiar} disabled={!!trabajando}>
            {trabajando === 'copiar' ? <Loader2 className="animate-spin" /> : <ClipboardCopy />} Copiar para correo
          </Button>
        </div>
      </header>

      {/* Estado de sincronización: nunca se esconde (Constitución, estados de datos). */}
      <div className="-mt-3 flex flex-col gap-0.5 px-1 text-footnote text-muted-foreground">
        <p className="flex items-center gap-2" aria-live="polite">
          {error ? (
            <span className="font-semibold text-ink-crit">{error}</span>
          ) : sincronizando ? (
            <>
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> Guardando…
            </>
          ) : cargando ? (
            'Cargando…'
          ) : (
            <>
              <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
              Sincronizado{ultimaSync ? ` a las ${horaDe(ultimaSync)}` : ''}
            </>
          )}
        </p>
      </div>

      {/* Técnicos del turno: quién está de verdad (mockup aprobado, pieza 1). */}
      {/* Entrega de turno: lo primero que ve el turno que llega (mockup aprobado). */}
      {pendientesPrevios.length > 0 && (
        <section aria-label="Pendientes de turnos anteriores" className="flex flex-col">
          <h2 className="px-4 pb-2 text-footnote text-muted-foreground">
            <span className="font-semibold text-foreground">Vienen de turnos anteriores</span> · {pendientesPrevios.length}
          </h2>
          <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
            {pendientesPrevios.map((p) => (
              <div
                key={p.id}
                className='relative flex flex-col gap-1.5 px-4 py-3 before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-headline leading-tight">{p.equipo?.trim() || 'Sin equipo'}</span>
                  <Tag>{ETIQUETA_TIPO[p.tipo]}</Tag>
                  <Pill tone="warning">Pendiente</Pill>
                </div>
                <p className="line-clamp-3 whitespace-pre-line text-body">{p.descripcion}</p>
                <p className="text-footnote text-muted-foreground">{origenDePendiente(p, turno)}</p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <Button variant="tinted" onClick={() => setEditor({ evento: null, idNuevo: nuevoId(), turno, pendienteOrigen: p })}>
                    <Check /> Resolver
                  </Button>
                  <Button
                    variant="plain"
                    onClick={() => {
                      setNoAplica(p)
                      setMotivoNoAplica('')
                      setQuienNoAplica(nombreRecordadoValido())
                    }}
                  >
                    Ya no aplica
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Técnicos del turno" className="flex flex-col gap-2.5 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-footnote text-muted-foreground">Técnicos del turno</h2>
          <Button variant="plain" size="sm" onClick={() => {
              setBorradorPresentes(presentes.nombres)
              setHojaTecnicos('presentes')
            }}>
            Editar
          </Button>
        </div>
        {presentes.nombres.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {presentes.nombres.map((n) => (
              <span key={n} className="inline-flex min-h-[32px] items-center rounded-full bg-primary/[0.13] px-3 text-footnote font-semibold text-brand-ink">
                {n}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-body text-muted-foreground">Nadie marcado. Toca «Editar» para marcar quién está.</p>
        )}
        <p className="text-footnote text-muted-foreground">
          {presentes.ajustado
            ? deTurnoCalendario.length
              ? `Ajustado a mano · el calendario decía ${deTurnoCalendario.join(', ')}`
              : 'Ajustado a mano'
            : 'Según el calendario de Mantención'}
        </p>
      </section>

      {/* Resumen del turno: los números que demuestran el trabajo */}
      <section aria-label="Resumen del turno" className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none sm:grid-cols-4">
        <Stat valor={String(r.eventos)} etiqueta={r.eventos === 1 ? 'evento' : 'eventos'} />
        <Stat
          valor={formatoMinutos(r.minutosParada)}
          // La pantalla decía solo «de parada» mientras el correo y el PDF
          // avisaban «1 sin duración»: el dato faltante se veía recién al pegar.
          etiqueta={`${etiquetaParada(r)}${r.mttrMin != null ? ` · MTTR ${formatoMinutos(r.mttrMin)}` : ''}`}
          tinta={r.minutosParada > 0 ? 'text-ink-crit' : undefined}
        />
        <Stat valor={String(r.enVentana)} etiqueta="sin detener producción" tinta={r.enVentana > 0 ? 'text-ink-ok' : undefined} />
        <Stat
          valor={String(r.pendientesDelTurno)}
          etiqueta={etiquetaPendientes(r)}
          tinta={r.pendientes > 0 ? 'text-ink-warn' : undefined}
        />
        {r.pendientesCerrados > 0 ? (
          <Stat valor={String(r.pendientesCerrados)} etiqueta={r.pendientesCerrados === 1 ? 'pendiente cerrado' : 'pendientes cerrados'} tinta="text-ink-ok" />
        ) : null}
      </section>

      {/* Observación general del turno (del mockup aprobado). */}
      <button
        type="button"
        onClick={() => {
          setTextoObs(observacion.texto)
          setQuienObs(nombreRecordadoValido())
          setEditandoObs(true)
        }}
        className="flex min-h-[44px] w-full items-start gap-3 rounded-card bg-card px-4 py-3 text-left shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none dark:shadow-none"
      >
        <MessageSquareText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-footnote text-muted-foreground">Observación general del turno</span>
          {observacion.texto ? (
            <span className="line-clamp-4 block whitespace-pre-line text-body">{observacion.texto}</span>
          ) : (
            <span className="block text-body text-muted-foreground">Agregar una nota: estado de la planta, entrega de turno…</span>
          )}
          {observacion.texto && observacion.actualizadoPorNombre && (
            <span className="block pt-0.5 text-caption text-muted-foreground">{observacion.actualizadoPorNombre}</span>
          )}
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {/* Acciones secundarias de móvil. La principal (Nuevo evento) va fija abajo. */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        <Button variant="tinted" onClick={copiar} disabled={!!trabajando || eventos.length === 0}>
          {trabajando === 'copiar' ? <Loader2 className="animate-spin" /> : <ClipboardCopy />} Copiar
        </Button>
        <Button variant="tinted" onClick={exportarPdf} disabled={!!trabajando || eventos.length === 0}>
          {trabajando === 'pdf' ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
        </Button>
      </div>

      {/* «Nuevo evento» siempre a mano en el celular: justo sobre la barra de
          pestañas (h-16 = 4rem; 2.5rem cuando el teléfono está acostado), así no
          hay que volver arriba con 10 eventos cargados. */}
      <div
        className="fixed inset-x-0 z-30 bg-background/80 px-4 pb-3 pt-2 backdrop-blur-xl md:hidden bottom-[calc(4rem+env(safe-area-inset-bottom))] [@media(max-height:500px)]:bottom-[calc(2.5rem+env(safe-area-inset-bottom))]"
      >
        <Button size="block" onClick={abrirNuevo}>
          <Plus /> Nuevo evento
        </Button>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Línea de tiempo */}
        <section aria-label="Eventos del turno" className="flex flex-col">
          <h2 className="px-4 pb-2 text-caption font-semibold text-muted-foreground">Eventos</h2>
          {cargando ? (
            <div className="flex flex-col gap-2 rounded-card bg-card p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-ctl bg-muted-foreground/10 motion-reduce:animate-none" />
              ))}
            </div>
          ) : eventos.length === 0 ? (
            <div className="rounded-card bg-card px-6 py-10 text-center">
              <NotebookPen className="mx-auto mb-3 size-9 text-muted-foreground" aria-hidden />
              <p className="text-headline">Aún no hay eventos en este turno</p>
              <p className="mx-auto mt-1 max-w-[42ch] text-footnote text-muted-foreground">
                Registra fallas, ajustes y rondas con sus fotos. Lo que cargues en el celular aparece solo en el PC.
              </p>
              <Button variant="tinted" className="mt-4" onClick={abrirNuevo}>
                <Plus /> Agregar el primero
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
              {eventos.map((e) => (
                <EventoBitacoraFila
                  key={e.id}
                  evento={e}
                  onAbrir={() => setEditor({ evento: e, idNuevo: e.id, turno })}
                  onVerFoto={(fotos, indice) => setVisor({ fotos, indice, titulo: [e.horaInicio, e.equipo].filter(Boolean).join(' · ') })}
                />
              ))}
            </div>
          )}
        </section>

        {/* Vista previa del correo (solo PC) */}
        <section aria-label="Vista previa del correo" className="hidden flex-col md:flex md:sticky md:top-4">
          <div className="flex flex-col gap-1 px-4 pb-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-caption font-semibold text-muted-foreground">Así queda al pegar en el correo</h2>
              <Button variant="plain" size="sm" onClick={copiarIncrustadas} disabled={!!trabajando}>
                {trabajando === 'copiar-incrustadas' ? <Loader2 className="animate-spin" /> : null}
                Copiar con fotos incrustadas
              </Button>
            </div>
            {/* El portapapeles lleva el CUERPO; el asunto se copia aparte. */}
            <div className="flex min-w-0 items-center gap-2 text-footnote">
              <span className="shrink-0 text-muted-foreground">Asunto:</span>
              <span className="min-w-0 truncate">{asunto}</span>
              <Button variant="plain" size="sm" className="shrink-0" onClick={copiarAsunto}>
                Copiar asunto
              </Button>
            </div>
          </div>
          <VistaPreviaCorreo html={htmlCorreo} />
          <p className="px-4 pt-2 text-footnote text-muted-foreground">
            Outlook clásico: usa «Copiar para correo». Si en Outlook nuevo o web las fotos no aparecen, usa «Copiar con fotos incrustadas».
          </p>
        </section>
      </div>

      <EventoBitacoraSheet
        open={!!editor}
        turno={turno}
        evento={editor?.evento ?? null}
        pendienteOrigen={editor?.pendienteOrigen ?? null}
        idNuevo={editor?.idNuevo ?? ''}
        sugerenciasEquipo={sugerenciasEquipo}
        tecnicos={tecnicos}
        opcionesEquipo={opcionesEquipo}
        cargandoEquipos={cargandoEquipos}
        subirFoto={fuente.subirFoto}
        onGuardar={guardar}
        onBorrar={borrar}
        onClose={() => setEditor(null)}
      />

      <Sheet
        open={editandoObs}
        onClose={() => setEditandoObs(false)}
        title="Observación general del turno"
        description="Sale en el correo y en el PDF, debajo del resumen."
        actions={
          <>
            <Button variant="tinted" onClick={() => setEditandoObs(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (tecnicos.todos.length > 0 && !quienObs.trim()) {
                  toast({ title: 'Elige quién escribe la observación', variant: 'destructive' })
                  return
                }
                void guardarObservacion(textoObs, quienObs)
                  .then(() => {
                    toast({ title: 'Observación guardada', variant: 'success' })
                    setEditandoObs(false)
                  })
                  .catch((e: unknown) => toast({ title: e instanceof Error ? e.message : 'No se pudo guardar', variant: 'destructive' }))
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        {tecnicos.todos.length > 0 && (
          <div className="mb-4">
            <SelectorTecnico etiqueta="Quién escribe" deTurno={tecnicos.deTurno} todos={tecnicos.todos} valor={quienObs} onChange={setQuienObs} />
          </div>
        )}
        <label htmlFor="bitacora-observacion" className="sr-only">Observación general del turno</label>
        <textarea
          id="bitacora-observacion"
          value={textoObs}
          onChange={(e) => setTextoObs(e.target.value)}
          maxLength={3000}
          placeholder="Planta operando normal. Queda pendiente el motor de tensado de la enzunchadora…"
          className="min-h-[160px] w-full resize-y rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-[16px] leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
        />
      </Sheet>

      <Sheet
        open={Boolean(noAplica)}
        onClose={() => setNoAplica(null)}
        title="Ya no aplica"
        description={noAplica ? `${noAplica.equipo || 'Sin equipo'} · ${origenDePendiente(noAplica, turno)}` : undefined}
        actions={
          <>
            <Button variant="tinted" onClick={() => setNoAplica(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!noAplica) return
                if (tecnicos.todos.length > 0 && !quienNoAplica.trim()) {
                  toast({ title: 'Elige quién cierra el pendiente', variant: 'destructive' })
                  return
                }
                if (!motivoNoAplica.trim()) {
                  toast({ title: 'Escribe por qué ya no aplica', variant: 'destructive' })
                  return
                }
                void cerrarNoAplica(noAplica, motivoNoAplica, quienNoAplica)
                  .then(() => {
                    toast({ title: 'Pendiente cerrado', description: 'No cuenta como resuelto por Mantención.' })
                    setNoAplica(null)
                  })
                  .catch((e: unknown) => toast({ title: e instanceof Error ? e.message : 'No se pudo cerrar', variant: 'destructive' }))
              }}
            >
              Cerrar pendiente
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {tecnicos.todos.length > 0 && (
            <SelectorTecnico etiqueta="Quién lo cierra" deTurno={tecnicos.deTurno} todos={tecnicos.todos} valor={quienNoAplica} onChange={setQuienNoAplica} />
          )}
          <div>
            <label htmlFor="bitacora-motivo-no-aplica" className="mb-1.5 block text-footnote text-muted-foreground">
              Por qué ya no aplica
            </label>
            <textarea
              id="bitacora-motivo-no-aplica"
              value={motivoNoAplica}
              onChange={(e) => setMotivoNoAplica(e.target.value)}
              maxLength={300}
              placeholder="Se resolvió solo, estaba duplicado, se cambió el equipo…"
              className="min-h-[88px] w-full resize-y rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-[16px] leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </div>
      </Sheet>

      <TecnicosDelTurnoSheet
        open={hojaTecnicos === 'presentes'}
        lista={listaTecnicos}
        deTurnoCalendario={deTurnoCalendario}
        marcados={borradorPresentes}
        onMarcados={setBorradorPresentes}
        onGuardar={(nombres) => {
          void guardarPresentes(nombres).catch((e: unknown) =>
            toast({ title: e instanceof Error ? e.message : 'No se pudo guardar', variant: 'destructive' }),
          )
          toast({ title: 'Técnicos del turno guardados', variant: 'success' })
        }}
        onAbrirLista={() => setHojaTecnicos('lista')}
        onClose={() => setHojaTecnicos(null)}
      />
      <ListaTecnicosSheet
        open={hojaTecnicos === 'lista'}
        lista={listaTecnicos}
        ajustes={ajustes}
        onGuardar={(nuevos) => {
          void guardarAjustes(nuevos).catch((e: unknown) =>
            toast({ title: e instanceof Error ? e.message : 'No se pudo guardar', variant: 'destructive' }),
          )
        }}
        // Al cerrar vuelve a «Técnicos del turno», que es desde donde se abrió.
        onClose={() => setHojaTecnicos('presentes')}
      />

      {visor && (
        <VisorFotosBitacora fotos={visor.fotos} indiceInicial={visor.indice} titulo={visor.titulo} onClose={() => setVisor(null)} />
      )}
    </div>
  )
}

function Stat({ valor, etiqueta, tinta }: { valor: string; etiqueta: string; tinta?: string }) {
  return (
    <div className="min-w-0">
      <span className={`block text-title2 tabular-nums leading-tight ${tinta ?? ''}`}>{valor}</span>
      <span className="block text-footnote text-muted-foreground">{etiqueta}</span>
    </div>
  )
}

/**
 * El HTML del correo en un iframe aislado: los estilos de la app (preflight de
 * Tailwind resetea imágenes y tablas) no deben alterar la vista previa, que
 * tiene que ser lo mismo que ve Outlook. Sin scripts: `sandbox` sin
 * `allow-scripts`; `allow-same-origin` solo para medir la altura.
 */
/** Ancho con que se arma el correo (680 px de cuerpo + 20 px de margen por lado). */
const ANCHO_CORREO = 720

function VistaPreviaCorreo({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [alto, setAlto] = useState(480)
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;}body{padding:20px;width:${ANCHO_CORREO - 40}px;}</style></head><body>${html}</body></html>`

  /**
   * El correo se dibuja a SU ancho real y se escala para caber en la columna.
   * Achicar las fotos para que quepan no sirve: la columna mide distinto con y
   * sin menú lateral, y la vista previa dejaría de mostrar lo que llega a Outlook.
   */
  const ajustar = useCallback(() => {
    const iframe = ref.current
    const d = iframe?.contentDocument
    if (!iframe || !d?.body) return
    const escala = Math.min(1, iframe.clientWidth / ANCHO_CORREO)
    d.documentElement.style.zoom = String(escala)
    setAlto(Math.max(240, Math.ceil(d.body.scrollHeight * escala) + 4))
  }, [])

  useEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    const ro = new ResizeObserver(() => ajustar())
    ro.observe(iframe)
    return () => ro.disconnect()
  }, [ajustar])

  return (
    <iframe
      ref={ref}
      title="Vista previa del correo"
      sandbox="allow-same-origin"
      srcDoc={doc}
      onLoad={() => {
        ajustar()
        // Las fotos terminan de cargar después del onLoad del documento.
        ref.current?.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', ajustar))
      }}
      // Fondo blanco fijo en ambos temas: es el papel del correo, no cromo de la app.
      style={{ height: alto, background: '#fff' }}
      className="w-full rounded-card border-0 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
    />
  )
}
