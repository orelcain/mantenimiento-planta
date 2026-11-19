/**
 * Ficha de una pieza de Bodega como PÁGINA (`/repuestos?pieza=<rowKey>`), no como cajón lateral.
 *
 * Lo que se lee va en forma de lectura (piezas de `piel/Lectura`): título, cifras con filete,
 * una frase de estado y secciones separadas por filete. La evidencia se ve en grande: la captura
 * del manual con la pieza marcada (o la foto), con visor de pan y zoom. Lo que se opera
 * (solicitar, movimiento, editar, aprobar o entregar un pedido) mantiene sus botones.
 *
 * PC: imagen a la izquierda (470 px) y el expediente a la derecha. Celular: imagen arriba a todo
 * el ancho y el resto debajo.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Copy, Download, ImagePlus, Loader2, MoreHorizontal, Printer, Search, Shapes } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/piel'
import { Input } from '@/components/ui'
import { FilasLectura, LECTURA_CUERPO, LECTURA_NOTA, LECTURA_TITULO, SeccionLectura, type FilaLectura } from '@/components/piel/Lectura'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { useToast } from '@/hooks/useToast'
import { AREA_TACTIL } from '@/lib/areaTactil'
import { copiarTexto } from '@/lib/clipboard'
import { escapeHtml } from '@/lib/escapeHtml'
import { cn } from '@/lib/utils'
import { dec1 } from '@/utils/formatoNumeros'
import { nombreVisible } from '@/utils/repuestos/nombreVisible'
import type { BodegaMergedItem, MovimientoBodega } from '@/hooks/repuestos/useBodega'
import type { SolicitudEstado, SolicitudRepuesto } from '@/hooks/repuestos/useSolicitudes'
import { BOTON_CEL, BOTON_PC, PARAM_PIEZA, cuandoCorto, equiposUnicos, fraseDeEstado, imagenesDePieza, valorEnBodega, type TonoEstado } from './datosFichaPieza'

const PUNTO: Record<TonoEstado, string> = { ok: 'bg-ink-ok', aviso: 'bg-ink-warn', falta: 'bg-ink-crit', neutro: 'bg-muted-foreground/50' }
const CIFRA_TONO: Record<TonoEstado, string> = { ok: 'text-foreground', aviso: 'text-ink-warn', falta: 'text-ink-crit', neutro: 'text-muted-foreground' }
const CIFRA = 'text-[length:calc(20px*var(--escala-texto,1))] lg:text-[length:calc(24px*var(--escala-texto,1))] leading-[1.2] font-semibold tabular-nums'
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`

interface Props {
  item: BodegaMergedItem
  esPC: boolean
  /** De dónde se vino (para la miga): «Bodega · Alertas». */
  origen: string
  onVolver: () => void
  onAnterior?: () => void
  onSiguiente?: () => void
  loadMovimientos: (id: string, max?: number) => Promise<MovimientoBodega[]>
  calcReorderData?: (item: BodegaMergedItem, movs: MovimientoBodega[]) => { consumoDiario: number; puntoReorden: number; diasRestantes: number; necesitaPedir: boolean } | null
  /** Figura del despiece interactivo (por código de fabricante); null = no está en un despiece. */
  dibujo: { ruta: string; fig: string } | null
  pedidos: SolicitudRepuesto[]
  onAvanzarPedido?: (id: string, next: SolicitudEstado) => Promise<void>
  onSolicitar?: () => void
  onMovimiento?: () => void
  onEditar?: () => void
  addPhoto?: (sap: string, file: File) => Promise<string>
  onViewInEquipo?: (machineId: string) => void
  onSearchSimilar?: (query: string) => void
  /** Agregar o asignar un equipo (abre el selector de equipos). Sin esto no se muestra la acción. */
  onAsignarEquipo?: () => void
  /** Quita el equipo de la pieza, con todos sus machineId de la fila (la confirmación la pone la ficha). Si falla, el padre avisa y lanza el error. */
  onQuitarEquipo?: (machineIds: string[]) => Promise<void>
  /** Registra un conteo físico: deja «Conteo físico» en movimientos y sella la fecha del conteo. */
  onContar?: (contado: number) => Promise<void>
}

export function FichaPieza({
  item, esPC, origen, onVolver, onAnterior, onSiguiente, loadMovimientos, calcReorderData, dibujo, pedidos,
  onAvanzarPedido, onSolicitar, onMovimiento, onEditar, addPhoto, onViewInEquipo, onSearchSimilar,
  onAsignarEquipo, onQuitarEquipo, onContar,
}: Props) {
  const { toast } = useToast()
  const [movs, setMovs] = useState<MovimientoBodega[]>([])
  const [cargandoMovs, setCargandoMovs] = useState(true)
  const [visor, setVisor] = useState<number | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [contando, setContando] = useState(false)
  const [conteoVal, setConteoVal] = useState('')
  const [guardandoConteo, setGuardandoConteo] = useState(false)
  const [quitar, setQuitar] = useState<{ machineIds: string[]; nombre: string } | null>(null)
  const [quitando, setQuitando] = useState(false)
  // Cambia con cada movimiento o conteo: así la tabla de movimientos se recarga sola.
  const versionMovs = `${item.stockActual}|${item.ultimoConteoAt?.getTime() ?? 0}`

  useEffect(() => {
    let vivo = true
    setCargandoMovs(true)
    if (!item.bodegaId) { setMovs([]); setCargandoMovs(false); return }
    loadMovimientos(item.bodegaId, 20)
      .then((d) => { if (vivo) setMovs(d) })
      .catch(() => {})
      .finally(() => { if (vivo) setCargandoMovs(false) })
    return () => { vivo = false }
  }, [item.bodegaId, loadMovimientos, versionMovs])

  const nv = nombreVisible(item)
  const titulo = nv.esComun || nv.titulo !== '(sin nombre)' ? nv.titulo : `Sin nombre · SAP ${item.codigoSAP}`
  const subtitulo = nv.oficial || item.descripcion || null
  const estado = fraseDeEstado(item)
  const configurado = !!item.bodegaId
  const imagenes = useMemo(() => imagenesDePieza(item), [item])
  const principal = imagenes[0]
  const equipos = useMemo(() => equiposUnicos(item), [item])
  const reorden = configurado ? calcReorderData?.(item, movs) ?? null : null
  const ubicacion = configurado ? item.ubicacionBodega?.trim() || '—' : '—'
  const enlace = `${window.location.origin}${window.location.pathname}?${PARAM_PIEZA}=${encodeURIComponent(item.rowKey)}`

  const subirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !addPhoto) return
    setSubiendo(true)
    try { await addPhoto(item.codigoSAP, file) } catch (err) {
      toast({ title: 'No se pudo subir la foto', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    } finally { setSubiendo(false) }
  }

  const qrComoPng = () => {
    const svg = document.getElementById('ficha-pieza-qr')
    if (!svg) return
    const canvas = document.createElement('canvas')
    canvas.width = 300; canvas.height = 300
    const ctx = canvas.getContext('2d')
    const img = new window.Image()
    img.onload = () => { ctx?.drawImage(img, 0, 0); const a = document.createElement('a'); a.download = `QR_${item.codigoSAP || 'pieza'}.png`; a.href = canvas.toDataURL('image/png'); a.click() }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg))))
  }
  const imprimirQr = () => {
    const w = window.open('', '_blank', 'width=400,height=500')
    const svg = document.getElementById('ficha-pieza-qr')
    if (!w) return
    // escapeHtml: los campos vienen de Firestore y un <script> se ejecutaría en la ventana nueva.
    w.document.write(`<html><head><title>QR ${escapeHtml(item.codigoSAP)}</title><style>body{font-family:sans-serif;text-align:center;padding:20px}h2{margin:0 0 4px}p{margin:2px 0;color:#666;font-size:12px}</style></head><body><h2>${escapeHtml(item.textoBreve)}</h2><p>${escapeHtml(item.codigoSAP)}</p>${item.codigoFabricante ? `<p>${escapeHtml(item.codigoFabricante)}</p>` : ''}<div>${svg ? new XMLSerializer().serializeToString(svg) : ''}</div><p>${escapeHtml(item.ubicacionBodega || '')}</p><script>setTimeout(()=>{window.print();window.close()},300)</script></body></html>`)
    w.document.close()
  }

  const copiar = (valor: string) => {
    copiarTexto(valor)
      .then(() => toast({ title: 'Copiado', description: valor }))
      .catch(() => toast({ title: 'No se pudo copiar', variant: 'destructive' }))
  }
  // Botón de copiar: área táctil de 44 px sin agrandar la línea donde va (negativo vertical).
  const botonCopiar = (valor: string, etiqueta: string) => (
    <button type="button" onClick={() => copiar(valor)} aria-label={`Copiar ${etiqueta}`}
            className={cn(AREA_TACTIL, '-my-3 shrink-0 rounded-full text-muted-foreground hover:text-foreground')}>
      <Copy className="size-4" aria-hidden />
    </button>
  )

  const guardarConteo = async () => {
    // Number y no parseInt: «2,5» litros es un conteo válido y parseInt lo guardaba como 2.
    const texto = conteoVal.trim().replace(',', '.')
    const n = texto === '' ? Number.NaN : Number(texto)
    if (!onContar || !Number.isFinite(n) || n < 0) return
    setGuardandoConteo(true)
    try { await onContar(n); setContando(false); setConteoVal('') }
    catch { /* el padre ya avisó con un toast; el campo sigue con el número */ }
    finally { setGuardandoConteo(false) }
  }

  const confirmarQuitar = async () => {
    if (!quitar || !onQuitarEquipo) return
    setQuitando(true)
    try { await onQuitarEquipo(quitar.machineIds); setQuitar(null) }
    catch { /* el padre ya avisó; la confirmación queda abierta */ }
    finally { setQuitando(false) }
  }

  const avanzar = async (p: SolicitudRepuesto, next: SolicitudEstado) => {
    if (!onAvanzarPedido) return
    setOcupado(p.id)
    try { await onAvanzarPedido(p.id, next) } finally { setOcupado(null) }
  }

  const masAcciones = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Más acciones" className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:size-9">
          <MoreHorizontal className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13rem]">
        {!esPC && onEditar && <DropdownMenuItem className="gap-2 py-2" onClick={onEditar}>{configurado ? 'Editar datos de bodega' : 'Configurar en bodega'}</DropdownMenuItem>}
        {onSearchSimilar && <DropdownMenuItem className="gap-2 py-2" onClick={() => onSearchSimilar(item.textoBreve || item.codigoSAP)}><Search className="size-4 text-muted-foreground" />Buscar similares en Áreas</DropdownMenuItem>}
        <DropdownMenuItem className="gap-2 py-2" onClick={qrComoPng}><Download className="size-4 text-muted-foreground" />Descargar QR</DropdownMenuItem>
        <DropdownMenuItem className="gap-2 py-2" onClick={imprimirQr}><Printer className="size-4 text-muted-foreground" />Imprimir etiqueta QR</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const figura = (
    <figure className={cn('m-0 flex flex-col gap-2', esPC ? 'w-[470px] shrink-0' : '-mx-4 sm:mx-0')}>
      {principal ? (
        <button type="button" onClick={() => setVisor(0)} aria-label={`Ampliar ${principal.rotulo}`}
                className={cn('flex justify-center overflow-hidden bg-white', esPC ? 'h-[min(600px,calc(100vh-12rem))] rounded-[10px] border border-border' : 'h-[320px] sm:rounded-[14px]')}>
          <img src={principal.url} alt={principal.rotulo} className="h-full w-full object-contain" />
        </button>
      ) : (
        <div className={cn('flex flex-col items-center justify-center gap-2 border border-dashed border-border px-6 text-center', esPC ? 'h-[280px] rounded-[10px]' : 'mx-4 h-[180px] rounded-[14px] sm:mx-0')}>
          <p className={LECTURA_CUERPO}>Sin foto ni dibujo de esta pieza.</p>
          <p className={LECTURA_NOTA}>Una foto ayuda a reconocerla en bodega y en la máquina.</p>
        </div>
      )}
      <figcaption className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-1', LECTURA_NOTA, !esPC && 'px-4 sm:px-0')}>
        <span>{principal ? principal.rotulo : ''}</span>
        <span className="flex items-center gap-3">
          {dibujo && (
            <Link to={dibujo.ruta} className="inline-flex min-h-11 items-center gap-1 text-brand-ink hover:underline lg:min-h-0">
              <Shapes className="size-3.5" aria-hidden />Ver en el despiece · fig. {dibujo.fig}
            </Link>
          )}
          {addPhoto && (
            <label className={cn('inline-flex min-h-11 cursor-pointer items-center gap-1 text-brand-ink hover:underline lg:min-h-0', subiendo && 'opacity-60')}>
              {subiendo ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ImagePlus className="size-3.5" aria-hidden />}
              {subiendo ? 'Subiendo…' : 'Agregar foto'}
              <input type="file" accept="image/*" className="sr-only" onChange={subirFoto} disabled={subiendo} />
            </label>
          )}
        </span>
      </figcaption>
      {imagenes.length > 1 && (
        <div className={cn('flex gap-2 overflow-x-auto', !esPC && 'px-4 sm:px-0')}>
          {imagenes.slice(1, 7).map((im, n) => (
            <button key={im.url} type="button" onClick={() => setVisor(n + 1)} aria-label={`Ampliar ${im.rotulo}`}
                    className="size-14 shrink-0 overflow-hidden rounded-[10px] border border-border bg-white">
              <img src={im.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </figure>
  )

  const cifras: { valor: string; rotulo: string; tono?: TonoEstado; mono?: boolean; copiar?: boolean }[] = [
    { valor: configurado ? String(item.stockActual) : '—', rotulo: esPC && configurado ? `en bodega · ${item.unidad || 'pzas'}` : 'en bodega', tono: estado.tono },
    { valor: configurado && item.stockMinimo > 0 ? String(item.stockMinimo) : '—', rotulo: 'mínimo' },
    { valor: configurado && valorEnBodega(item) !== 0 ? pesos(valorEnBodega(item)) : '—', rotulo: 'valor' },
    { valor: ubicacion, rotulo: 'ubicación', mono: true, copiar: ubicacion !== '—' },
  ]

  const datos: FilaLectura[] = [
    { rotulo: 'SAP', valor: <span className="inline-flex items-center gap-1 font-mono">{item.codigoSAP || '—'}{item.codigoSAP && botonCopiar(item.codigoSAP, 'código SAP')}</span> },
    { rotulo: 'Código de fabricante', valor: <span className="inline-flex items-center gap-1 font-mono">{item.codigoFabricante || '—'}{item.codigoFabricante && botonCopiar(item.codigoFabricante, 'código de fabricante')}</span> },
    ...(item.tipo ? [{ rotulo: 'Tipo', valor: item.tipo }] : []),
    ...(configurado ? [
      { rotulo: 'Proveedor', valor: item.proveedor || '—' },
      { rotulo: 'Costo de compra', valor: item.costoCompra ? pesos(item.costoCompra) : '—' },
      { rotulo: 'Stock máximo', valor: item.stockMaximo ? String(item.stockMaximo) : '—' },
      { rotulo: 'Plazo de entrega', valor: item.leadTime ? `${item.leadTime} días` : '—' },
    ] : []),
    ...(item.categoria ? [{ rotulo: 'Clase ABC', valor: item.categoria }] : []),
  ]

  const expediente = (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <h1 className={cn(LECTURA_TITULO, 'min-w-0 flex-1')}>{titulo}</h1>
          {esPC && masAcciones}
        </div>
        <p className={cn(LECTURA_CUERPO, 'text-muted-foreground')}>
          {[
            subtitulo,
            item.codigoSAP ? <span key="sap" className="inline-flex items-center align-middle">SAP {item.codigoSAP}{botonCopiar(item.codigoSAP, 'código SAP')}</span> : null,
            item.codigoFabricante ? `fab. ${item.codigoFabricante}` : null,
          ].filter(Boolean).map((parte, n) => <span key={n}>{n > 0 && ' · '}{parte}</span>)}
        </p>
      </div>

      <dl className={cn('m-0', esPC ? 'flex flex-wrap' : 'grid grid-cols-4')}>
        {cifras.map((c, n) => (
          <div key={c.rotulo} className={cn('flex min-w-0 flex-col gap-0.5', esPC ? 'pr-4' : 'pr-2', n > 0 && (esPC ? 'border-l border-border pl-4' : 'border-l border-border pl-2.5'), n === cifras.length - 1 && 'pr-0')}>
            <dt className={cn('order-2', LECTURA_NOTA)}>{c.rotulo}</dt>
            <dd className={cn('m-0 order-1 inline-flex items-center gap-1', CIFRA, c.mono && 'font-mono', c.tono ? CIFRA_TONO[c.tono] : 'text-foreground')}>{c.copiar && !esPC
              // Celular: la celda mide ~80 px y el icono partía «C-3» en dos líneas; se copia tocando el valor.
              ? <button type="button" onClick={() => copiar(c.valor)} aria-label={`Copiar ${c.rotulo}`} className="-my-3 min-h-11 min-w-11 whitespace-nowrap text-left">{c.valor}</button>
              : <><span className="whitespace-nowrap">{c.valor}</span>{c.copiar && botonCopiar(c.valor, c.rotulo)}</>}</dd>
          </div>
        ))}
      </dl>

      <p className={LECTURA_CUERPO}>
        <span className={cn('mr-2 inline-block size-2 rounded-full align-[2px]', PUNTO[estado.tono])} aria-hidden />
        {estado.texto}
      </p>

      {contando && onContar ? (
        <div className="flex flex-col gap-2" data-testid="ficha-contar">
          <label htmlFor="ficha-conteo" className={LECTURA_CUERPO}>¿Cuántas hay ahora?</label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="ficha-conteo"
              type="number"
              min={0}
              inputMode="decimal"
              autoFocus
              value={conteoVal}
              onChange={(e) => setConteoVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void guardarConteo()
                else if (e.key === 'Escape') { setContando(false); setConteoVal('') }
              }}
              disabled={guardandoConteo}
              className={cn('w-28 tabular-nums', esPC ? 'h-9' : 'h-11 text-[length:calc(17px*var(--escala-texto,1))]')}
            />
            <Button size={esPC ? 'sm' : 'md'} className={esPC ? BOTON_PC : cn(BOTON_CEL, 'flex-1')} disabled={guardandoConteo || conteoVal.trim() === ''} onClick={() => void guardarConteo()}>
              {guardandoConteo && <Loader2 className="size-4 animate-spin" aria-hidden />}Guardar conteo
            </Button>
            <Button variant="plain" size={esPC ? 'sm' : 'md'} className={esPC ? BOTON_PC : BOTON_CEL} disabled={guardandoConteo} onClick={() => { setContando(false); setConteoVal('') }}>Cancelar</Button>
          </div>
        </div>
      ) : (onSolicitar || onMovimiento || onEditar || onContar) && (
        <div className="flex flex-wrap gap-2">
          {onSolicitar && item.codigoSAP && <Button size={esPC ? 'sm' : 'md'} className={cn(esPC ? BOTON_PC : cn(BOTON_CEL, 'h-[50px] flex-1'))} onClick={onSolicitar}>Solicitar</Button>}
          {onMovimiento && configurado && <Button variant="tinted" size={esPC ? 'sm' : 'md'} className={cn(esPC ? BOTON_PC : cn(BOTON_CEL, 'h-[50px] flex-1'))} onClick={onMovimiento}>Movimiento</Button>}
          {onContar && item.codigoSAP && <Button variant="tinted" size={esPC ? 'sm' : 'md'} className={cn(esPC ? BOTON_PC : cn(BOTON_CEL, 'h-[50px] flex-1'))} onClick={() => { setConteoVal(''); setContando(true) }}>Contar</Button>}
          {esPC && onEditar && <Button variant="tinted" size="sm" className={BOTON_PC} onClick={onEditar}>{configurado ? 'Editar' : 'Configurar en bodega'}</Button>}
        </div>
      )}

      {pedidos.length > 0 && (
        <SeccionLectura titulo={pedidos.length === 1 ? 'Pedido abierto' : `Pedidos abiertos · ${pedidos.length}`} testId="ficha-pedidos">
          {pedidos.map((p) => (
            <div key={p.id} className={cn('flex items-center gap-3 border-t border-border py-2', LECTURA_CUERPO)}>
              <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{p.cantidad}</span>
              <span className="min-w-0 flex-1">
                {p.solicitadoPorNombre || 'Alguien'} lo pidió {cuandoCorto(p.createdAt)}
                <span className={cn(LECTURA_NOTA, 'block')}>{p.estado === 'pendiente' ? 'por aprobar' : `aprobado${p.aprobadaPor ? ` por ${p.aprobadaPor}` : ''}, por entregar`}{p.observaciones ? ` · ${p.observaciones}` : ''}</span>
              </span>
              {onAvanzarPedido && (p.estado === 'pendiente'
                ? <Button size={esPC ? 'sm' : 'md'} className={esPC ? BOTON_PC : BOTON_CEL} disabled={ocupado === p.id} onClick={() => avanzar(p, 'aprobada')}>Aprobar</Button>
                : configurado && item.stockActual > 0
                  ? <Button variant="tinted" size={esPC ? 'sm' : 'md'} className={esPC ? BOTON_PC : BOTON_CEL} disabled={ocupado === p.id} onClick={() => avanzar(p, 'entregada')}>Entregar</Button>
                  : <span className={LECTURA_NOTA}>Falta comprar</span>)}
            </div>
          ))}
        </SeccionLectura>
      )}

      <SeccionLectura titulo={equipos.length > 0 ? `Dónde se usa · ${equipos.length} ${equipos.length === 1 ? 'equipo' : 'equipos'}` : 'Dónde se usa'} testId="ficha-donde">
        {equipos.length === 0
          ? <p className={LECTURA_NOTA}>No está asignado a ningún equipo.</p>
          : equipos.map((e) => (
            <div key={e.machineId} className={cn('flex items-center justify-between gap-3 border-t border-border py-2', LECTURA_CUERPO)}>
              <span className="min-w-0 truncate">{e.machineName}</span>
              <span className="flex shrink-0 items-center gap-3">
                {onViewInEquipo && (
                  <button type="button" onClick={() => onViewInEquipo(e.machineId)} className="min-h-11 text-footnote text-brand-ink hover:underline lg:min-h-0">Ver en Áreas</button>
                )}
                {onQuitarEquipo && (
                  <button type="button" onClick={() => setQuitar({ machineIds: e.machineIds, nombre: e.machineName })} className="min-h-11 text-footnote text-ink-crit hover:underline lg:min-h-0">Quitar</button>
                )}
              </span>
            </div>
          ))}
        {quitar && onQuitarEquipo && (
          <div role="alertdialog" aria-label="Confirmar quitar equipo" className="flex flex-col gap-2 border-t border-border py-2">
            <p className={LECTURA_CUERPO}>
              ¿Quitar <strong>{quitar.nombre}</strong> de este repuesto?
              {equipos.length === 1 && ' Quedará como material transversal, sin equipo.'}
            </p>
            <div className="flex gap-2">
              <Button size={esPC ? 'sm' : 'md'} variant="destructive" className={esPC ? BOTON_PC : BOTON_CEL} disabled={quitando} onClick={() => void confirmarQuitar()}>
                {quitando && <Loader2 className="size-4 animate-spin" aria-hidden />}Quitar
              </Button>
              <Button size={esPC ? 'sm' : 'md'} variant="plain" className={esPC ? BOTON_PC : BOTON_CEL} disabled={quitando} onClick={() => setQuitar(null)}>Cancelar</Button>
            </div>
          </div>
        )}
        {onAsignarEquipo && (
          <button type="button" onClick={onAsignarEquipo} className="min-h-11 self-start text-footnote text-brand-ink hover:underline lg:min-h-0">
            {equipos.length > 0 ? 'Agregar equipo' : 'Asignar a un equipo'}
          </button>
        )}
      </SeccionLectura>

      {reorden && (
        <SeccionLectura titulo={reorden.necesitaPedir ? 'Reposición: hay que pedir' : 'Reposición'}>
          <FilasLectura filas={[
            { rotulo: 'Punto de reorden', valor: reorden.puntoReorden },
            { rotulo: 'Consumo por día', valor: dec1(reorden.consumoDiario) },
            { rotulo: 'Días que alcanza', valor: reorden.diasRestantes === Infinity ? 'sin consumo' : reorden.diasRestantes },
          ]} />
        </SeccionLectura>
      )}

      <SeccionLectura titulo={cargandoMovs ? 'Movimientos' : `Movimientos · ${movs.length}`} testId="ficha-movimientos">
        {cargandoMovs ? <p className={LECTURA_NOTA}>Cargando…</p>
          : movs.length === 0 ? <p className={LECTURA_NOTA}>{configurado ? 'Sin movimientos registrados.' : 'Sin registro en bodega.'}</p>
          : (
            <table className={cn('w-full border-collapse', LECTURA_CUERPO)}>
              <thead className={LECTURA_NOTA}>
                <tr>
                  <th className="pb-1.5 pr-3 text-left font-normal">Fecha</th>
                  <th className="pb-1.5 pr-3 text-left font-normal">Tipo</th>
                  <th className="pb-1.5 pr-3 text-right font-normal">Cambio</th>
                  <th className="pb-1.5 pr-3 text-right font-normal">Queda</th>
                  {esPC && <th className="pb-1.5 text-left font-normal">Motivo</th>}
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className="border-t border-border align-baseline">
                    <td className="whitespace-nowrap py-2 pr-3 font-mono text-footnote">{cuandoCorto(m.createdAt)}</td>
                    <td className="py-2 pr-3">{m.tipo === 'entrada' ? 'Entrada' : m.tipo === 'salida' ? 'Salida' : 'Ajuste'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m.tipo === 'ajuste' ? '→' : m.tipo === 'entrada' ? `+${m.cantidad}` : `−${m.cantidad}`}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{m.stockResultante}</td>
                    {esPC && <td className="py-2 text-muted-foreground">{m.motivo || '—'}{m.realizadoPorNombre ? ` · ${m.realizadoPorNombre}` : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </SeccionLectura>

      <SeccionLectura titulo="Datos">
        <FilasLectura filas={datos} />
        {item.observaciones && <p className={cn(LECTURA_CUERPO, 'border-t border-border py-2 text-muted-foreground')}>{item.observaciones}</p>}
      </SeccionLectura>
    </div>
  )

  return (
    <article className="flex flex-col gap-4 pb-10" data-testid="ficha-pieza">
      <nav aria-label="Ubicación" className={cn('flex items-center gap-2', LECTURA_NOTA)}>
        <button type="button" onClick={onVolver} className="inline-flex min-h-11 items-center gap-1 text-body text-brand-ink hover:underline lg:min-h-0 lg:text-footnote">
          <ChevronLeft className="size-4" aria-hidden />{origen}
        </button>
        {esPC && <span aria-hidden>›</span>}
        {esPC && <span className="truncate">{titulo}</span>}
        <span className="ml-auto flex items-center gap-4">
          {esPC && onAnterior && <button type="button" onClick={onAnterior} className="text-brand-ink hover:underline">‹ Anterior</button>}
          {esPC && onSiguiente && <button type="button" onClick={onSiguiente} className="text-brand-ink hover:underline">Siguiente ›</button>}
          {!esPC && masAcciones}
        </span>
      </nav>

      {esPC ? <div className="flex items-start gap-10">{figura}{expediente}</div> : <>{figura}{expediente}</>}

      <div className="hidden" aria-hidden>
        <QRCodeSVG id="ficha-pieza-qr" value={enlace} size={300} level="H" includeMargin />
      </div>

      {visor !== null && imagenes.length > 0 && (
        <ImageLightbox photos={imagenes.map((i) => i.url)} initialIndex={visor} onClose={() => setVisor(null)} />
      )}
    </article>
  )
}
