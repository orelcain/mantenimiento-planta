import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ClipboardCopy, FileDown, Loader2, NotebookPen, Plus } from 'lucide-react'
import { Button, Pill } from '@/components/piel'
import { EventoBitacoraFila } from '@/components/bitacora/EventoBitacoraFila'
import { EventoBitacoraSheet } from '@/components/bitacora/EventoBitacoraSheet'
import { useToast } from '@/hooks/useToast'
import { FUENTE_FIRESTORE, useTurnoMantencionActual, type FuenteBitacora } from '@/hooks/useBitacoraTurno'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { copiarHtml } from '@/lib/clipboard'
import type { EventoBitacora, TurnoMantencion } from '@/services/bitacora/bitacora.types'
import { bitacoraAHtmlCorreo, bitacoraATextoPlano } from '@/services/bitacora/bitacoraCorreo'
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
  const turnoActual = useTurnoMantencionActual()
  const turnoParam = params.get('turno')
  const [editor, setEditor] = useState<{ evento: EventoBitacora | null; idNuevo: string; turno: TurnoMantencion } | null>(null)
  const turnoNavegado = useMemo(() => turnoDesdeId(turnoParam) ?? turnoActual, [turnoParam, turnoActual])
  // Con el editor abierto el turno queda CONGELADO: si el reloj cruza las
  // 16:00 a mitad de escribir, el formulario no se borra y el evento se guarda
  // en el turno donde se empezó a registrar.
  const turno = editor?.turno ?? turnoNavegado
  const esActual = turno.id === turnoActual.id

  const { eventos, cargando, error, sincronizando, ultimaSync, nuevoId, guardar, borrar } = fuente.useEventos(turno)
  const tecnicos = fuente.useTecnicos(turno)
  const r = useMemo(() => resumirBitacora(eventos), [eventos])

  const [trabajando, setTrabajando] = useState<null | 'copiar' | 'copiar-incrustadas' | 'pdf'>(null)

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
    () => ({ turno, eventos, tecnicos, planta: BITACORA_PLANTA.nombre }),
    [turno, eventos, tecnicos],
  )
  const htmlCorreo = useMemo(() => bitacoraAHtmlCorreo(datosCorreo), [datosCorreo])

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
    <div className="flex flex-col gap-5 pb-8">
      {/* Encabezado: título grande (uno por pantalla) + navegación de turnos */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1">
        <div className="min-w-0 flex-1 md:flex-none">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-display">Bitácora</h1>
            {esActual ? (
              <Pill tone="info" dot="pulse">En curso</Pill>
            ) : (
              <Button variant="plain" size="sm" onClick={irAlActual}>Ir al turno actual</Button>
            )}
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
        {tecnicos.length > 0 && <p>De turno: {tecnicos.join(', ')}</p>}
      </div>

      {/* Resumen del turno: los números que demuestran el trabajo */}
      <section aria-label="Resumen del turno" className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none sm:grid-cols-4">
        <Stat valor={String(r.eventos)} etiqueta={r.eventos === 1 ? 'evento' : 'eventos'} />
        <Stat
          valor={formatoMinutos(r.minutosParada)}
          etiqueta={r.mttrMin != null ? `de parada · MTTR ${formatoMinutos(r.mttrMin)}` : 'de parada'}
          tinta={r.minutosParada > 0 ? 'text-ink-crit' : undefined}
        />
        <Stat valor={String(r.enVentana)} etiqueta="sin detener producción" tinta={r.enVentana > 0 ? 'text-ink-ok' : undefined} />
        <Stat valor={String(r.pendientes)} etiqueta={r.pendientes === 1 ? 'pendiente' : 'pendientes'} tinta={r.pendientes > 0 ? 'text-ink-warn' : undefined} />
      </section>

      {/* Acciones de móvil: aquí la principal es registrar. */}
      <div className="flex flex-col gap-2 md:hidden">
        <Button size="block" onClick={abrirNuevo}>
          <Plus /> Nuevo evento
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="tinted" onClick={copiar} disabled={!!trabajando || eventos.length === 0}>
            {trabajando === 'copiar' ? <Loader2 className="animate-spin" /> : <ClipboardCopy />} Copiar
          </Button>
          <Button variant="tinted" onClick={exportarPdf} disabled={!!trabajando || eventos.length === 0}>
            {trabajando === 'pdf' ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
          </Button>
        </div>
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
                <EventoBitacoraFila key={e.id} evento={e} onAbrir={() => setEditor({ evento: e, idNuevo: e.id, turno })} />
              ))}
            </div>
          )}
        </section>

        {/* Vista previa del correo (solo PC) */}
        <section aria-label="Vista previa del correo" className="hidden flex-col md:flex md:sticky md:top-4">
          <div className="flex items-baseline justify-between gap-2 px-4 pb-2">
            <h2 className="text-caption font-semibold text-muted-foreground">Así queda al pegar en el correo</h2>
            <Button variant="plain" size="sm" onClick={copiarIncrustadas} disabled={!!trabajando}>
              {trabajando === 'copiar-incrustadas' ? <Loader2 className="animate-spin" /> : null}
              Copiar con fotos incrustadas
            </Button>
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
        idNuevo={editor?.idNuevo ?? ''}
        sugerenciasEquipo={sugerenciasEquipo}
        subirFoto={fuente.subirFoto}
        onGuardar={guardar}
        onBorrar={borrar}
        onClose={() => setEditor(null)}
      />
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
function VistaPreviaCorreo({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [alto, setAlto] = useState(480)
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#fff;}</style></head><body>${html}</body></html>`

  const medir = () => {
    const body = ref.current?.contentDocument?.body
    if (body) setAlto(Math.max(240, body.scrollHeight + 4))
  }

  return (
    <iframe
      ref={ref}
      title="Vista previa del correo"
      sandbox="allow-same-origin"
      srcDoc={doc}
      onLoad={() => {
        medir()
        // Las fotos terminan de cargar después del onLoad del documento.
        ref.current?.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', medir))
      }}
      // Fondo blanco fijo en ambos temas: es el papel del correo, no cromo de la app.
      style={{ height: alto, background: '#fff' }}
      className="w-full rounded-card border-0 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
    />
  )
}
