/**
 * Pedidos por atender, arriba del Stock de Bodega: lo que espera a bodega se ve al entrar,
 * sin abrir una ventana. Aprobar y entregar se hacen aquí; las altas de código y el historial
 * siguen en el panel de Solicitudes («Ver todos»), que tiene sus formularios.
 *
 * Una franja con el resumen y «Revisar»; al desplegarla aparece la lista (tabla en PC, filas en celular).
 * Sin nada por atender no ocupa espacio.
 */
import { useState } from 'react'
import { Button } from '@/components/piel'
import { LECTURA_NOTA } from '@/components/piel/Lectura'
import { cn } from '@/lib/utils'
import type { NombreVisible } from '@/utils/repuestos/nombreVisible'
import type { StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'
import type { SolicitudEstado, SolicitudItem, SolicitudRepuesto, AltaCodigo } from '@/hooks/repuestos/useSolicitudes'
import { BOTON_CEL, BOTON_PC, cuandoCorto, pedidosPorAtender, stockDelPedido } from '@/pages/repuestos/datosFichaPieza'

const PUNTO = { crit: 'bg-ink-crit', warn: 'bg-ink-warn', ok: '', neutro: 'bg-muted-foreground/50' } as const

function Punto({ tono }: { tono: keyof typeof PUNTO }) {
  if (!PUNTO[tono]) return null
  return <span className={cn('mr-1.5 inline-block size-2 shrink-0 rounded-full align-[1px]', PUNTO[tono])} aria-hidden />
}

interface Props {
  solicitudes: readonly SolicitudItem[]
  esPC: boolean
  stockDe: (sap: string) => StockDeSolicitud | undefined
  nombreDe: (sap: string, texto?: string) => NombreVisible
  onAvanzar?: (id: string, next: SolicitudEstado) => Promise<void>
  onVerTodos: () => void
  onAbrirPieza?: (sap: string) => void
}

/** En el celular se ven los primeros; el resto, en «Ver todos». */
const MAX_CELULAR = 3

export function PedidosPorAtender({ solicitudes, esPC, stockDe, nombreDe, onAvanzar, onVerTodos, onAbrirPieza }: Props) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const { porAprobar, porEntregar, altas, total } = pedidosPorAtender(solicitudes)
  const entregados = solicitudes.filter((s) => s.estado === 'entregada').length

  const resumen = [
    porAprobar.length > 0 && `${porAprobar.length} por aprobar`,
    porEntregar.length > 0 && `${porEntregar.length} por entregar`,
    altas.length > 0 && `${altas.length} ${altas.length === 1 ? 'alta' : 'altas'} de código`,
  ].filter(Boolean).join(' · ')

  const avanzar = async (s: SolicitudRepuesto, next: SolicitudEstado) => {
    if (!onAvanzar) return
    setOcupado(s.id)
    try { await onAvanzar(s.id, next) } finally { setOcupado(null) }
  }

  type Fila = { s: SolicitudRepuesto; alta?: undefined } | { s: AltaCodigo; alta: true }
  const filas: Fila[] = [
    ...porAprobar.map((s) => ({ s })),
    ...porEntregar.map((s) => ({ s })),
    ...altas.map((s) => ({ s, alta: true as const })),
  ]

  const boton = esPC ? BOTON_PC : BOTON_CEL
  const accion = (f: Fila) => {
    if (f.alta) return <Button variant="tinted" size="sm" className={boton} onClick={onVerTodos}>Resolver</Button>
    const s = f.s
    if (!onAvanzar) return null
    if (s.estado === 'pendiente') {
      return <Button size="sm" className={boton} disabled={ocupado === s.id} onClick={() => avanzar(s, 'aprobada')}>Aprobar</Button>
    }
    const st = stockDelPedido(stockDe(s.codigoSAP), s.cantidad)
    if (st.tono === 'crit') return <span className={LECTURA_NOTA}>Falta comprar</span>
    return <Button variant="tinted" size="sm" className={boton} disabled={ocupado === s.id} onClick={() => avanzar(s, 'entregada')}>Entregar</Button>
  }

  const nombre = (f: Fila) => (f.alta ? f.s.textoBreve || f.s.codigoFabricante : nombreDe(f.s.codigoSAP, f.s.textoBreve).titulo)
  const enlaceNombre = (f: Fila) => {
    const t = nombre(f)
    if (f.alta || !onAbrirPieza) return <span>{t}</span>
    const sap = f.s.codigoSAP
    return <button type="button" onClick={() => onAbrirPieza(sap)} className="text-left text-brand-ink hover:underline">{t}</button>
  }
  const codigo = (f: Fila) => (f.alta ? `sin SAP · ${f.s.codigoFabricante}` : f.s.codigoSAP)
  const estado = (f: Fila) => (f.alta ? 'alta de código' : f.s.estado === 'pendiente' ? 'por aprobar' : f.s.aprobadaPor ? `aprobó ${f.s.aprobadaPor.split(' ')[0]}` : 'por entregar')
  const stockCelda = (f: Fila) => {
    if (f.alta) return <span className="text-muted-foreground">—</span>
    const st = stockDelPedido(stockDe(f.s.codigoSAP), f.s.cantidad)
    return <span className="whitespace-nowrap"><Punto tono={st.tono} />{st.texto}</span>
  }

  // Título de la franja: singular y plural correctos según lo que espera.
  const nPorAprobar = porAprobar.length
  const nPorEntregar = porEntregar.length
  const nAltas = altas.length
  const soloAprobar = nPorAprobar > 0 && nPorEntregar === 0 && nAltas === 0
  const soloEntregar = nPorEntregar > 0 && nPorAprobar === 0 && nAltas === 0
  const soloAltas = nAltas > 0 && nPorAprobar === 0 && nPorEntregar === 0
  const titulo = soloAprobar
    ? `${nPorAprobar} ${nPorAprobar === 1 ? 'pedido' : 'pedidos'} por aprobar`
    : soloEntregar
      ? `${nPorEntregar} por entregar`
      : soloAltas
        ? `${nAltas} ${nAltas === 1 ? 'alta de código' : 'altas de código'}`
        : `${total} ${total === 1 ? 'pedido' : 'pedidos'} por atender`

  // Detalle de la franja (solo PC): en mixto, el resumen delante de los nombres.
  const mixto = [nPorAprobar, nPorEntregar, nAltas].filter((n) => n > 0).length > 1
  const nombres = filas.slice(0, 3).map((f) => `${nombre(f)} ×${f.s.cantidad}`)
  const restoNombres = filas.length - nombres.length
  const nombresTxt = [nombres.join(' · '), restoNombres > 0 && `y ${restoNombres} más`].filter(Boolean).join(' · ')
  const detalle = mixto ? `${resumen} · ${nombresTxt}` : nombresTxt

  if (total === 0) return null

  const encabezadoDesplegado = (
    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={LECTURA_NOTA}>{resumen}</span>
      <button type="button" onClick={onVerTodos} className="ml-auto min-h-[44px] text-footnote font-medium text-brand-ink hover:underline lg:min-h-0">
        {esPC && entregados > 0 && solicitudes.length > 1 ? `Ver los ${solicitudes.length}, con entregados` : 'Ver todos'}
      </button>
    </div>
  )

  const franja = (
    <div
      className={cn(
        'flex min-h-[52px] items-center gap-3 rounded-[26px] bg-card pl-4 text-subhead shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none',
        esPC ? 'pr-2' : 'pr-1.5',
      )}
    >
      <span aria-hidden className="inline-block size-2 shrink-0 rounded-full bg-ink-warn" />
      <span className="whitespace-nowrap font-semibold text-foreground">{titulo}</span>
      {esPC ? <span className="min-w-0 flex-1 truncate text-muted-foreground">{detalle}</span> : <span className="flex-1" />}
      <Button
        variant="tinted"
        size="sm"
        className={boton}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? 'Ocultar' : 'Revisar'}
      </Button>
    </div>
  )

  if (esPC) {
    return (
      <section aria-label="Pedidos por atender" data-testid="pedidos-por-atender" className="flex flex-col gap-2">
        {franja}
        {abierto && (
          <div>
            {encabezadoDesplegado}
            <table className="w-full border-collapse text-subhead">
              <tbody>
                {filas.map((f) => (
                  <tr key={f.s.id} className="border-t border-border">
                    <td className="w-10 py-2 pr-3 text-right font-semibold tabular-nums">{f.s.cantidad}</td>
                    <td className="py-2 pr-3">{enlaceNombre(f)} <span className="font-mono text-footnote text-muted-foreground">{codigo(f)}</span></td>
                    <td className="py-2 pr-3 text-footnote">{stockCelda(f)}</td>
                    <td className="py-2 pr-3 text-footnote text-muted-foreground">{[f.s.solicitadoPorNombre?.split(' ')[0], cuandoCorto(f.s.createdAt)].filter(Boolean).join(' · ')}</td>
                    <td className="py-2 pr-3 text-footnote text-muted-foreground">{estado(f)}</td>
                    <td className="py-1.5 text-right">{accion(f)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )
  }

  const visibles = filas.slice(0, MAX_CELULAR)
  const resto = filas.length - visibles.length
  return (
    <section aria-label="Pedidos por atender" data-testid="pedidos-por-atender" className="flex flex-col gap-2">
      {franja}
      {abierto && (
        <div>
          {encabezadoDesplegado}
          {visibles.map((f) => (
            <div key={f.s.id} className="flex items-center gap-3 border-t border-border py-2.5">
              <span className="w-6 shrink-0 text-right text-body font-semibold tabular-nums">{f.s.cantidad}</span>
              <div className="min-w-0 flex-1 text-body">
                <div className="truncate">{enlaceNombre(f)}</div>
                <div className="truncate text-footnote text-muted-foreground">{stockCelda(f)} · {f.alta ? 'alta de código' : cuandoCorto(f.s.createdAt)}</div>
              </div>
              <div className="shrink-0 [&_button]:h-11">{accion(f)}</div>
            </div>
          ))}
          {resto > 0 && (
            <button type="button" onClick={onVerTodos} className="block min-h-[44px] w-full border-t border-border text-left text-subhead text-brand-ink">
              {resto === 1 ? '1 más' : `${resto} más`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
