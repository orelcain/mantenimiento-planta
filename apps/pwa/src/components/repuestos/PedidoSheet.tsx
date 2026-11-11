/**
 * «Pedido» de repuestos: la lista que se arma desde Repuestos (cualquier máquina) y sale como
 * correo con fotos, texto para compartir, Excel o solicitudes en la app.
 * Lógica pura y formato del correo en `utils/repuestos/pedidoRepuestos.ts` (probada).
 *
 * Piel: lista agrupada (Sheet `grouped`), un solo botón relleno («Copiar para correo») y las
 * demás salidas como celdas. En el teléfono es hoja; en PC, ventana ancha con dos columnas
 * (lo que se pide a la izquierda, cómo se envía a la derecha). Mockup y decisiones: PR del pedido.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCheck, Copy, FileSpreadsheet, ImageOff, Minus, Plus, Share2, ShoppingBasket, Trash2, Type } from 'lucide-react'
import { Button, CellIcon, ListCell, ListGroup, SegmentedControl, Sheet } from '@/components/piel'
import { cn } from '@/lib/utils'
import { copiarHtmlDiferido, copiarTexto } from '@/lib/clipboard'
import { useToast } from '@/hooks/useToast'
import { usePedidoStore } from '@/store/pedidoStore'
import { compartirOBajarArchivo } from '@/services/bitacora/compartirArchivo'
import { cargarFotoComoJpeg, cargarImagen } from '@/services/bitacora/fotosBitacora'
import type { NuevaSolicitud } from '@/hooks/repuestos/useSolicitudes'
import {
  asuntoPedido,
  conStockVigente,
  etiquetaStock,
  filasExcelPedido,
  htmlPedido,
  nivelStock,
  nombreArchivoPedido,
  pendientesDeRegistrar,
  resumenPedido,
  solicitudesDePedido,
  textoPedido,
  type FotoCorreo,
  type NivelPedido,
  type StockVigente,
} from '@/utils/repuestos/pedidoRepuestos'

interface Props {
  open: boolean
  onClose: () => void
  solicitante?: string
  /** Stock vigente de bodega por SAP (el de la línea es el del momento en que se agregó). */
  stockDe?: (sap: string) => StockVigente
  /** Crea UNA solicitud en la app (las ve bodega y avisa por Telegram). La hoja registra de a una
   *  y marca cada éxito, así que un reintento tras un fallo no duplica las que ya salieron. */
  onRegistrar: (solicitud: NuevaSolicitud) => Promise<void>
}

const TONO: Record<NivelPedido, string> = {
  'sin-registro': 'text-muted-foreground',
  agotado: 'text-ink-crit',
  bajo: 'text-ink-warn',
  ok: 'text-muted-foreground',
}

/** Ancho de la foto en el correo: chica, para que la tabla quepa en un teléfono. */
const ANCHO_FOTO = 72

/** Botón del paso de cantidad: caja real de 44 px, sin pseudo-elementos que se pisen. */
const PASO = 'flex size-[44px] items-center justify-center rounded-full text-primary transition-colors hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40'

type Trabajo = 'copiar' | 'copiar-incrustadas' | 'compartir' | 'excel' | 'registrar' | null

function dataUrlABlob(dataUrl: string): Blob {
  const [cab = '', datos = ''] = dataUrl.split(',')
  const tipo = /data:([^;]+)/.exec(cab)?.[1] ?? 'image/jpeg'
  const bin = atob(datos)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

/** Nombre para leer en voz alta (aria) aunque el repuesto no tenga texto. */
const nombreAria = (l: { textoBreve: string; codigoSAP: string; codigoFabricante: string }) =>
  l.textoBreve || l.codigoSAP || l.codigoFabricante || 'repuesto'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Cantidad editable: se puede borrar y escribir otro número (con el valor ligado directo al
 * store, borrar daba 0 → 1 al instante y "7" quedaba "17"). Se aplica al salir o con Enter.
 */
function CampoCantidad({ cantidad, etiqueta, onFijar }: { cantidad: number; etiqueta: string; onFijar: (n: number) => void }) {
  const [texto, setTexto] = useState(String(cantidad))
  useEffect(() => setTexto(String(cantidad)), [cantidad])
  const aplicar = () => {
    const n = Number(texto)
    if (texto.trim() === '' || !Number.isFinite(n)) setTexto(String(cantidad))
    else onFijar(n)
  }
  return (
    <input type="text" inputMode="numeric" pattern="[0-9]*" aria-label={etiqueta} value={texto}
           onChange={(e) => setTexto(e.target.value.replace(/\D/g, '').slice(0, 3))}
           onBlur={aplicar}
           onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
           className="h-[44px] w-[44px] bg-transparent text-center text-body tabular-nums text-foreground focus:outline-none" />
  )
}

export function PedidoSheet({ open, onClose, solicitante, stockDe, onRegistrar }: Props) {
  const { lineas: guardadas, nota, registradas, conFotos, setConFotos, fijar, quitar, setNota, marcarRegistrada, vaciar } = usePedidoStore()
  const { toast } = useToast()
  const [trabajo, setTrabajo] = useState<Trabajo>(null)
  const [confirmarVaciar, setConfirmarVaciar] = useState(false)

  // El stock que se muestra y se envía es el vigente, no el del momento en que se agregó.
  const lineas = useMemo(() => guardadas.map((l) => conStockVigente(l, stockDe)), [guardadas, stockDe])
  const resumen = useMemo(() => resumenPedido(lineas), [lineas])
  const datos = useMemo(() => ({ lineas, nota, solicitante, fecha: new Date() }), [lineas, nota, solicitante])
  const porRegistrar = useMemo(() => pendientesDeRegistrar(lineas, registradas), [lineas, registradas])
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const vacio = lineas.length === 0

  // La confirmación de «Vaciar» no queda armada al cerrar la hoja ni al cambiar la lista.
  useEffect(() => setConfirmarVaciar(false), [open, guardadas.length])

  /* Las fotos se preparan al abrir la hoja, NO al tocar: Safari (iPhone) y Firefox exigen que
     `navigator.share` y el portapapeles se llamen dentro del gesto, y esperar a cargar fotos
     antes de llamarlos hace que los rechacen. */
  const medidas = useRef(new Map<string, FotoCorreo>()) // por URL de foto
  const [archivos, setArchivos] = useState<File[] | null>(null)
  const firmaFotos = lineas.map((l) => `${l.clave}|${l.foto ?? ''}`).join(',')

  useEffect(() => {
    if (!open) return
    let vivo = true
    for (const l of lineas) {
      const url = l.foto
      if (!url || medidas.current.has(url)) continue
      cargarImagen(url)
        .then((img) => {
          const h = Math.max(1, Math.round((ANCHO_FOTO * img.naturalHeight) / Math.max(1, img.naturalWidth)))
          medidas.current.set(url, { src: url, w: ANCHO_FOTO, h })
        })
        .catch(() => { /* esa línea va sin foto */ })
    }
    if (puedeCompartir && !conFotos) {
      setArchivos([])
    } else if (puedeCompartir) {
      setArchivos(null)
      Promise.all(
        lineas.map(async (l, i) => {
          if (!l.foto) return null
          try {
            const j = await cargarFotoComoJpeg(l.foto, 1200, 0.8)
            const nombre = `${String(i + 1).padStart(2, '0')}-${l.codigoSAP || l.codigoFabricante || 'repuesto'}.jpg`
            return new File([dataUrlABlob(j.dataUrl)], nombre, { type: 'image/jpeg' })
          } catch {
            return null
          }
        }),
      ).then((fs) => { if (vivo) setArchivos(fs.filter((f): f is File => f !== null)) })
    }
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `firmaFotos` resume `lineas` (clave y foto)
  }, [open, firmaFotos, puedeCompartir, conFotos])

  /** Medidas de cada foto; las que aún no estaban, se esperan (ya dentro de la escritura diferida). */
  const medirFotos = async (): Promise<Map<string, FotoCorreo>> => {
    const mapa = new Map<string, FotoCorreo>()
    await Promise.all(
      lineas.map(async (l) => {
        if (!l.foto) return
        let m = medidas.current.get(l.foto)
        if (!m) {
          try {
            const img = await cargarImagen(l.foto)
            m = { src: l.foto, w: ANCHO_FOTO, h: Math.max(1, Math.round((ANCHO_FOTO * img.naturalHeight) / Math.max(1, img.naturalWidth))) }
            medidas.current.set(l.foto, m)
          } catch {
            return
          }
        }
        mapa.set(l.clave, m)
      }),
    )
    return mapa
  }

  const copiar = async (incrustadas: boolean) => {
    setTrabajo(incrustadas ? 'copiar-incrustadas' : 'copiar')
    let conFotoEnCorreo = 0
    // El HTML se arma como promesa: la escritura al portapapeles parte ya, dentro del toque.
    const html = (async () => {
      if (!conFotos) return htmlPedido({ ...datos, conFotos: false })
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
      conFotoEnCorreo = fotos.size
      return htmlPedido({ ...datos, foto: (l) => fotos.get(l.clave) ?? null })
    })()
    try {
      await copiarHtmlDiferido(html, textoPedido(datos))
      const conFoto = lineas.filter((l) => l.foto).length
      // Si alguna foto no se pudo leer, se dice: el toast no puede afirmar «con fotos» a ciegas.
      const faltan = conFotos ? conFoto - conFotoEnCorreo : 0
      toast({
        title: 'Pedido copiado',
        description: `Pégalo en el correo con Ctrl+V. Asunto sugerido: «${asuntoPedido(datos)}».` +
          (faltan > 0 ? ` ${plural(faltan, 'foto no se pudo leer y va', 'fotos no se pudieron leer y van')} sin imagen.` : ''),
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

  /** Teléfono: hoja del sistema con el texto y las fotos (ya preparadas) como archivos. */
  const compartir = async () => {
    const base = { title: asuntoPedido(datos), text: textoPedido(datos) }
    const fs = conFotos ? archivos ?? [] : []
    const adjunta = fs.length > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files: fs })
    setTrabajo('compartir')
    try {
      await navigator.share(adjunta ? { ...base, files: fs } : base)
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
      // Import dinámico: xlsx no entra al chunk del hub (mismo criterio que StockTablaPC).
      const XLSX = await import('xlsx')
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

  /** De a una, marcando cada éxito: tocar dos veces o reintentar tras un fallo no duplica. */
  const registrar = async () => {
    if (!porRegistrar.length) return
    setTrabajo('registrar')
    let hechas = 0
    let unidades = 0
    try {
      for (const l of porRegistrar) {
        const [solicitud] = solicitudesDePedido([l], nota)
        if (!solicitud) continue
        await onRegistrar(solicitud)
        marcarRegistrada(l.clave)
        hechas++
        unidades += l.cantidad
      }
      toast({
        title: hechas === 1 ? '1 solicitud registrada' : `${hechas} solicitudes registradas`,
        description: `${plural(unidades, 'unidad', 'unidades')}. Bodega las ve en «Pedidos por atender» y se avisa al grupo de Mantención en Telegram.`,
        variant: 'success',
      })
    } catch {
      const faltan = porRegistrar.length - hechas
      toast({
        title: hechas ? `Se registraron ${hechas}; faltan ${faltan}` : 'No se pudieron registrar las solicitudes',
        description: 'Vuelve a tocar «Registrar»: solo se envían las que faltan.',
        variant: 'destructive',
      })
    } finally {
      setTrabajo(null)
    }
  }

  const ocupado = trabajo !== null
  const conSap = resumen.repuestos - resumen.sinSap
  const textoRegistrar =
    trabajo === 'registrar' ? 'Registrando…'
      : porRegistrar.length === 0 && conSap > 0 ? 'Solicitudes registradas'
        : registradas.length > 0 ? `Registrar ${porRegistrar.length} que ${porRegistrar.length === 1 ? 'falta' : 'faltan'}`
          : 'Registrar como solicitudes'

  const titulo = vacio
    ? 'Pedido vacío'
    : `${plural(resumen.repuestos, 'repuesto', 'repuestos')} · ${plural(resumen.unidades, 'unidad', 'unidades')}`

  const lista = (
    <ListGroup title="Lo que se pide">
      {lineas.map((l) => {
        const nivel = nivelStock(l)
        const nombre = nombreAria(l)
        return (
          /* Fila propia (no ListCell): con el paso de cantidad a la derecha el nombre quedaba en
             12 caracteres a 375 px. Aquí el nombre usa todo el ancho y el paso va en la línea
             del stock. Mismo separador insetado que ListCell. */
          <div
            key={l.clave}
            className='relative flex gap-3 px-4 py-3 before:absolute before:left-[4.75rem] before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
          >
            {l.foto
              ? <img src={l.foto} alt="" loading="lazy" className="size-[48px] shrink-0 rounded-ctl object-cover" />
              : <span className="flex size-[48px] shrink-0 items-center justify-center rounded-ctl bg-muted text-muted-foreground" aria-hidden><ImageOff className="size-4" /></span>}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-body leading-tight text-foreground">{l.textoBreve || <span className="italic text-muted-foreground">Sin nombre</span>}</p>
              <p className="mt-0.5 truncate text-footnote text-muted-foreground">
                {l.codigoSAP ? <span className="font-mono tabular-nums">{l.codigoSAP}</span> : <span>Sin SAP{l.codigoFabricante ? <> · <span className="font-mono">{l.codigoFabricante}</span></> : null}</span>}
                {l.equipo && <> · {l.equipo}</>}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className={cn('min-w-0 line-clamp-2 text-footnote leading-tight', TONO[nivel])}>{/* Guion que no corta: «E3-N2» no se parte en dos líneas. */}{etiquetaStock(l).replace(/-/g, '‑')}</span>
              <div className="flex shrink-0 items-center rounded-full bg-muted">
                {/* En 1, el «−» se vuelve papelera (como el carrito de Apple): quitar sin otro botón. */}
                {l.cantidad <= 1 ? (
                  <button type="button" className={cn(PASO, 'text-ink-crit')} aria-label={`Quitar ${nombre} del pedido`} onClick={() => quitar(l.clave)}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : (
                  <button type="button" className={PASO} aria-label={`Menos ${nombre}`} onClick={() => fijar(l.clave, l.cantidad - 1)}>
                    <Minus className="size-4" aria-hidden />
                  </button>
                )}
                <CampoCantidad cantidad={l.cantidad} etiqueta={`Cantidad de ${nombre}`} onFijar={(n) => fijar(l.clave, n)} />
                <button type="button" className={PASO} aria-label={`Más ${nombre}`} onClick={() => fijar(l.clave, l.cantidad + 1)}>
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
              </div>
            </div>
          </div>
        )
      })}
    </ListGroup>
  )

  const envio = (
    <div className="space-y-5">
      <ListGroup title="Observación" footer="Va en el correo y en las solicitudes.">
        <div className="px-4 py-1">
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} aria-label="Observación del pedido"
                 className="h-[44px] w-full bg-transparent text-body text-foreground placeholder:text-muted-foreground focus:outline-none"
                 placeholder="Ej.: para el cambio de cuchillas del lunes" />
        </div>
      </ListGroup>

      <div className="space-y-1.5">
        <p className="px-4 text-footnote text-muted-foreground">Fotos en el correo</p>
        <SegmentedControl
          ariaLabel="Fotos en el pedido"
          value={conFotos ? 'con' : 'sin'}
          onChange={(v) => setConFotos(v === 'con')}
          segments={[
            { value: 'con', label: 'Con fotos' },
            { value: 'sin', label: 'Sin fotos' },
          ]}
        />
      </div>

      <ListGroup
        title="Otras formas de enviarlo"
        footer={resumen.sinSap > 0
          ? `${resumen.sinSap === 1 ? 'Un repuesto no tiene' : `${resumen.sinSap} repuestos no tienen`} SAP: va en el correo con el código del fabricante, pero no se registra como solicitud.`
          : 'Registrar crea una solicitud por repuesto; bodega las atiende en «Pedidos por atender».'}
      >
        {puedeCompartir && (
          <ListCell
            leading={<CellIcon tone="neutral"><Share2 aria-hidden /></CellIcon>}
            title={archivos === null ? 'Preparando fotos…' : conFotos ? 'Compartir con fotos' : 'Compartir'}
            subtitle="Outlook, Gmail o WhatsApp"
            onClick={ocupado || archivos === null ? undefined : compartir}
            aria-disabled={ocupado || archivos === null || undefined}
            chevron={false}
          />
        )}
        {conFotos && (
          <ListCell
            leading={<CellIcon tone="neutral"><Copy aria-hidden /></CellIcon>}
            title={trabajo === 'copiar-incrustadas' ? 'Copiando…' : 'Copiar con fotos incrustadas'}
            subtitle="Para Outlook nuevo o la web"
            onClick={ocupado ? undefined : () => copiar(true)}
            aria-disabled={ocupado || undefined}
            chevron={false}
          />
        )}
        <ListCell
          leading={<CellIcon tone="neutral"><Type aria-hidden /></CellIcon>}
          title="Copiar asunto"
          subtitle={asuntoPedido(datos)}
          onClick={ocupado ? undefined : copiarAsunto}
          aria-disabled={ocupado || undefined}
          chevron={false}
        />
        <ListCell
          leading={<CellIcon tone="neutral"><FileSpreadsheet aria-hidden /></CellIcon>}
          title={trabajo === 'excel' ? 'Generando…' : 'Descargar Excel'}
          onClick={ocupado ? undefined : excel}
          aria-disabled={ocupado || undefined}
          chevron={false}
        />
        <ListCell
          leading={<CellIcon tone="neutral"><ClipboardCheck aria-hidden /></CellIcon>}
          title={textoRegistrar}
          onClick={ocupado || porRegistrar.length === 0 ? undefined : registrar}
          aria-disabled={ocupado || porRegistrar.length === 0 || undefined}
          className={cn(porRegistrar.length === 0 && 'opacity-60')}
          chevron={false}
        />
      </ListGroup>

      <ListGroup>
        <ListCell
          leading={<CellIcon tone="neutral"><Trash2 aria-hidden className="text-ink-crit" /></CellIcon>}
          title={<span className="text-ink-crit">{confirmarVaciar ? 'Toca de nuevo para vaciar' : 'Vaciar pedido'}</span>}
          onClick={ocupado ? undefined : () => (confirmarVaciar ? (vaciar(), setConfirmarVaciar(false)) : setConfirmarVaciar(true))}
          aria-disabled={ocupado || undefined}
          chevron={false}
        />
      </ListGroup>
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="wide"
      surface="grouped"
      presentacionPC="ventana"
      ocultarBarra
      title={titulo}
      description={
        vacio
          ? undefined
          : resumen.criticos
            ? <span className="text-ink-crit">{plural(resumen.criticos, 'agotado o bajo el mínimo', 'agotados o bajo el mínimo')}</span>
            : 'Repuestos de cualquier máquina, para el correo a bodega.'
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
      {vacio ? (
        <div className="px-4 py-10 text-center">
          <ShoppingBasket className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-headline text-foreground">Aún no hay repuestos</p>
          <p className="mx-auto mt-1 max-w-sm text-footnote text-muted-foreground">
            En la lista, desliza la fila y toca «Pedido», o usa «Agregar al pedido» en la ficha. En el PC, la columna
            Pedido. Puedes mezclar máquinas; queda guardado en este dispositivo hasta que lo vacíes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pb-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-8">
          <div className="lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">{lista}</div>
          <div className="lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">{envio}</div>
        </div>
      )}
    </Sheet>
  )
}
