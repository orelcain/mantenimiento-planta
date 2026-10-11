/**
 * «Pedido» de repuestos: la lista que se arma desde la búsqueda general (cualquier máquina) y
 * sale como correo con fotos, texto para compartir, Excel o solicitudes en la app.
 * Lógica pura y formato del correo en `utils/repuestos/pedidoRepuestos.ts`.
 */
import { useMemo, useState } from 'react'
import { Check, ClipboardList, Copy, FileSpreadsheet, ImageOff, Minus, Plus, Share2, Trash2, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button, Sheet } from '@/components/piel'
import { cn } from '@/lib/utils'
import { copiarHtml, copiarTexto } from '@/lib/clipboard'
import { useToast } from '@/hooks/useToast'
import { usePedidoStore } from '@/store/pedidoStore'
import { compartirOBajarArchivo } from '@/services/bitacora/compartirArchivo'
import { cargarFotoComoJpeg, cargarImagen } from '@/services/bitacora/fotosBitacora'
import type { NuevaSolicitud } from '@/hooks/repuestos/useSolicitudes'
import type { StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'
import {
  asuntoPedido,
  conStockVigente,
  etiquetaStock,
  filasExcelPedido,
  htmlPedido,
  nivelStock,
  nombreArchivoPedido,
  resumenPedido,
  solicitudesDePedido,
  textoPedido,
  type FotoCorreo,
  type NivelPedido,
} from '@/utils/repuestos/pedidoRepuestos'

interface Props {
  open: boolean
  onClose: () => void
  solicitante?: string
  /** Stock vigente de bodega por SAP (el de la línea es el del momento en que se agregó). */
  stockDe?: (sap: string) => StockDeSolicitud
  /** Registra las líneas con SAP como solicitudes en la app (las ve bodega). */
  onRegistrar: (solicitudes: NuevaSolicitud[]) => Promise<void>
}

const TONO: Record<NivelPedido, string> = {
  'sin-registro': 'text-muted-foreground',
  agotado: 'text-ink-crit',
  bajo: 'text-ink-warn',
  ok: 'text-ink-ok',
}

/** Ancho de la foto en el correo: chica, para que la tabla quepa en un teléfono. */
const ANCHO_FOTO = 72

type Trabajo = 'copiar' | 'copiar-incrustadas' | 'compartir' | 'excel' | 'registrar' | null

function dataUrlABlob(dataUrl: string): Blob {
  const [cab = '', datos = ''] = dataUrl.split(',')
  const tipo = /data:([^;]+)/.exec(cab)?.[1] ?? 'image/jpeg'
  const bin = atob(datos)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

export function PedidoSheet({ open, onClose, solicitante, stockDe, onRegistrar }: Props) {
  const { lineas: guardadas, nota, fijar, quitar, setNota, vaciar } = usePedidoStore()
  const { toast } = useToast()
  const [trabajo, setTrabajo] = useState<Trabajo>(null)
  const [confirmarVaciar, setConfirmarVaciar] = useState(false)

  // El stock que se muestra y se envía es el vigente, no el del momento en que se agregó.
  const lineas = useMemo(() => guardadas.map((l) => conStockVigente(l, stockDe)), [guardadas, stockDe])
  const resumen = useMemo(() => resumenPedido(lineas), [lineas])
  const datos = useMemo(() => ({ lineas, nota, solicitante, fecha: new Date() }), [lineas, nota, solicitante])
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const vacio = lineas.length === 0

  /** Medidas de cada foto (sin ellas Outlook clásico la pega a tamaño original). */
  const medirFotos = async (): Promise<Map<string, FotoCorreo>> => {
    const mapa = new Map<string, FotoCorreo>()
    await Promise.all(
      lineas.map(async (l) => {
        if (!l.foto) return
        try {
          const img = await cargarImagen(l.foto)
          const h = Math.max(1, Math.round((ANCHO_FOTO * img.naturalHeight) / Math.max(1, img.naturalWidth)))
          mapa.set(l.clave, { src: l.foto, w: ANCHO_FOTO, h })
        } catch {
          /* esa línea va sin foto */
        }
      }),
    )
    return mapa
  }

  const copiar = async (incrustadas: boolean) => {
    setTrabajo(incrustadas ? 'copiar-incrustadas' : 'copiar')
    try {
      const fotos = await medirFotos()
      if (incrustadas) {
        // Outlook nuevo / web: la foto viaja dentro del HTML. Outlook clásico trunca las base64.
        await Promise.all(
          [...fotos.entries()].map(async ([clave, f]) => {
            try {
              const j = await cargarFotoComoJpeg(f.src, ANCHO_FOTO * 2, 0.8)
              fotos.set(clave, { ...f, src: j.dataUrl })
            } catch {
              /* queda por URL */
            }
          }),
        )
      }
      await copiarHtml(htmlPedido({ ...datos, foto: (l) => fotos.get(l.clave) ?? null }), textoPedido(datos))
      toast({
        title: 'Pedido copiado',
        description: `Pégalo en el correo con Ctrl+V. Asunto sugerido: «${asuntoPedido(datos)}».`,
        variant: 'success',
      })
    } catch {
      toast({ title: 'No se pudo copiar', description: 'El navegador bloqueó el portapapeles. Prueba con Excel o Compartir.', variant: 'destructive' })
    } finally {
      setTrabajo(null)
    }
  }

  const copiarAsunto = async () => {
    try {
      await copiarTexto(asuntoPedido(datos))
      toast({ title: 'Asunto copiado', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar el asunto', variant: 'destructive' })
    }
  }

  /** Teléfono: hoja del sistema con el texto y las fotos como archivos (Outlook, Gmail, WhatsApp…). */
  const compartir = async () => {
    setTrabajo('compartir')
    try {
      const archivos: File[] = []
      await Promise.all(
        lineas.map(async (l, i) => {
          if (!l.foto) return
          try {
            const j = await cargarFotoComoJpeg(l.foto, 1200, 0.8)
            const nombre = `${String(i + 1).padStart(2, '0')}-${l.codigoSAP || l.codigoFabricante || 'repuesto'}.jpg`
            archivos.push(new File([dataUrlABlob(j.dataUrl)], nombre, { type: 'image/jpeg' }))
          } catch {
            /* sin esa foto */
          }
        }),
      )
      archivos.sort((a, b) => a.name.localeCompare(b.name))
      const base = { title: asuntoPedido(datos), text: textoPedido(datos) }
      const conFotos = archivos.length > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files: archivos })
      await navigator.share(conFotos ? { ...base, files: archivos } : base)
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        toast({ title: 'No se pudo compartir', description: 'Usa «Copiar para correo» o Excel.', variant: 'destructive' })
      }
    } finally {
      setTrabajo(null)
    }
  }

  const excel = async () => {
    setTrabajo('excel')
    try {
      const hoja = XLSX.utils.aoa_to_sheet(filasExcelPedido(lineas))
      hoja['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 42 }, { wch: 9 }, { wch: 7 }, { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 20 }]
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, 'Pedido')
      const buf = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
      const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const via = await compartirOBajarArchivo(new Blob([buf], { type: tipo }), nombreArchivoPedido(datos.fecha, 'xlsx'), tipo)
      if (via !== 'cancelado') toast({ title: via === 'compartido' ? 'Excel listo para enviar' : 'Excel descargado', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo generar el Excel', variant: 'destructive' })
    } finally {
      setTrabajo(null)
    }
  }

  const registrar = async () => {
    const solicitudes = solicitudesDePedido(lineas, nota)
    if (!solicitudes.length) {
      toast({ title: 'Nada para registrar', description: 'Solo se registran los repuestos con código SAP.', variant: 'destructive' })
      return
    }
    setTrabajo('registrar')
    try {
      await onRegistrar(solicitudes)
    } catch {
      toast({ title: 'No se pudieron registrar las solicitudes', variant: 'destructive' })
    } finally {
      setTrabajo(null)
    }
  }

  const ocupado = trabajo !== null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="wide"
      title="Pedido de repuestos"
      description={
        vacio
          ? 'Agrega repuestos con el botón de la lista desde cualquier máquina.'
          : `${resumen.repuestos} ${resumen.repuestos === 1 ? 'repuesto' : 'repuestos'} · ${resumen.unidades} ${resumen.unidades === 1 ? 'unidad' : 'unidades'}` +
            (resumen.criticos ? ` · ${resumen.criticos} agotados o bajo el mínimo` : '')
      }
      actions={
        <>
          <Button variant="tinted" onClick={onClose}>Seguir buscando</Button>
          <Button variant="filled" onClick={() => copiar(false)} disabled={vacio || ocupado}>
            <Copy /> {trabajo === 'copiar' ? 'Copiando…' : 'Copiar para correo'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {vacio ? (
          <div className="rounded-card border border-dashed border-border px-4 py-8 text-center">
            <ClipboardList className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-body text-foreground">El pedido está vacío</p>
            <p className="mt-1 text-footnote text-muted-foreground">
              Busca un repuesto y toca el botón <Plus className="inline h-3.5 w-3.5" /> de su fila. Puedes mezclar repuestos de varias máquinas;
              la lista queda guardada en este dispositivo hasta que la vacíes.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-card bg-card">
            {lineas.map((l) => {
              const nivel = nivelStock(l)
              return (
                <li key={l.clave} className="flex items-center gap-3 px-3 py-2">
                  {l.foto ? (
                    <img src={l.foto} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-ctl object-cover ring-1 ring-border" />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl border border-dashed border-border" aria-hidden>
                      <ImageOff className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-medium text-foreground">{l.textoBreve || <span className="italic text-muted-foreground">Sin nombre</span>}</div>
                    <div className="truncate text-caption text-muted-foreground">
                      {l.codigoSAP ? <span className="font-mono">SAP {l.codigoSAP}</span> : <span>sin SAP</span>}
                      {l.codigoFabricante && <> · <span className="font-mono">{l.codigoFabricante}</span></>}
                      {l.equipo && <> · {l.equipo}</>}
                    </div>
                    <div className={cn('text-caption', TONO[nivel])}>● {etiquetaStock(l)}</div>
                  </div>
                  <div className="flex shrink-0 items-center overflow-hidden rounded-ctl border border-border">
                    <button type="button" aria-label={`Menos ${l.textoBreve}`} onClick={() => fijar(l.clave, l.cantidad - 1)}
                            className="flex h-11 w-9 items-center justify-center hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
                    <input type="number" inputMode="numeric" min={1} aria-label={`Cantidad de ${l.textoBreve}`} value={l.cantidad}
                           onChange={(e) => fijar(l.clave, Number(e.target.value))}
                           className="h-11 w-11 bg-muted text-center text-body tabular-nums text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                    <button type="button" aria-label={`Más ${l.textoBreve}`} onClick={() => fijar(l.clave, l.cantidad + 1)}
                            className="flex h-11 w-9 items-center justify-center hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <button type="button" onClick={() => quitar(l.clave)} aria-label={`Quitar ${l.textoBreve} del pedido`}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!vacio && (
          <>
            <label className="block">
              <span className="text-caption text-muted-foreground">Observación (va en el correo y en las solicitudes, opcional)</span>
              <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300}
                     className="mt-1 h-11 w-full rounded-ctl bg-muted px-3 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                     placeholder="Ej.: stock bajo para el cambio de cuchillas del lunes" />
            </label>

            {resumen.sinSap > 0 && (
              <p className="text-footnote text-muted-foreground">
                {resumen.sinSap === 1 ? 'Un repuesto no tiene' : `${resumen.sinSap} repuestos no tienen`} SAP: van en el correo con el código del fabricante, pero no se registran como solicitud.
              </p>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {puedeCompartir && (
                <Button variant="tinted" onClick={compartir} disabled={ocupado}>
                  <Share2 /> {trabajo === 'compartir' ? 'Preparando fotos…' : 'Compartir con fotos'}
                </Button>
              )}
              <Button variant="tinted" onClick={() => copiar(true)} disabled={ocupado} title="Para Outlook nuevo o la web: las fotos van dentro del correo">
                <Copy /> {trabajo === 'copiar-incrustadas' ? 'Copiando…' : 'Copiar con fotos incrustadas'}
              </Button>
              <Button variant="tinted" onClick={copiarAsunto} disabled={ocupado}>
                <Copy /> Copiar asunto
              </Button>
              <Button variant="tinted" onClick={excel} disabled={ocupado}>
                <FileSpreadsheet /> {trabajo === 'excel' ? 'Generando…' : 'Excel'}
              </Button>
              <Button variant="tinted" onClick={registrar} disabled={ocupado || resumen.repuestos === resumen.sinSap}
                      title="Crea una solicitud por repuesto con SAP en «Solicitudes» (avisa a Mantención)">
                <Check /> {trabajo === 'registrar' ? 'Registrando…' : 'Registrar como solicitudes'}
              </Button>
              {confirmarVaciar ? (
                <Button variant="destructive" onClick={() => { vaciar(); setConfirmarVaciar(false) }} disabled={ocupado}>
                  <Trash2 /> Sí, vaciar el pedido
                </Button>
              ) : (
                <Button variant="plain" onClick={() => setConfirmarVaciar(true)} disabled={ocupado}>
                  <Trash2 /> Vaciar pedido
                </Button>
              )}
            </div>
            <p className="text-footnote text-muted-foreground">
              «Copiar para correo» pega una tabla con foto, códigos, cantidad y stock en Outlook. En el teléfono, «Compartir con fotos» abre
              Outlook, Gmail o WhatsApp con las fotos adjuntas.
            </p>
          </>
        )}
      </div>
    </Sheet>
  )
}
