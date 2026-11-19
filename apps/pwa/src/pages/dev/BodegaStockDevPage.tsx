/**
 * Vitrina de desarrollo: la etapa 2 de Bodega › Stock con sus componentes REALES
 * (CabeceraBodega, StockTablaPC o StockListaMovil + BodegaRow, PedidosPorAtender,
 * LineaInventarioEnCurso, StockFormModal, MovimientoModal) y estado LOCAL.
 * Ruta `/dev/bodega-stock`, solo en desarrollo. No lee ni escribe Firestore: las acciones
 * (editar, movimiento, favorito, revisar/aprobar, ver inventario) cambian una copia en memoria.
 */
import { useState } from 'react'
import { CabeceraBodega, BodegaRow, MovimientoModal, StockFormModal } from '@/pages/repuestos/BodegaView'
import { StockTablaPC } from '@/pages/repuestos/StockTablaPC'
import { StockListaMovil, type CampoOrden } from '@/pages/repuestos/StockListaMovil'
import { PedidosPorAtender } from '@/components/repuestos/PedidosPorAtender'
import { LineaInventarioEnCurso } from '@/components/repuestos/bodega/LineaInventarioEnCurso'
import { aplicarFiltroDeStock, type StockFilterKey } from '@/hooks/repuestos/filtrosDeStock'
import type { BodegaMergedItem, BodegaStockData, InventarioSesion } from '@/hooks/repuestos/useBodega'
import type { SolicitudEstado, SolicitudRepuesto } from '@/hooks/repuestos/useSolicitudes'
import { useEsPC } from '@/hooks/useEsPC'
import { useTheme } from '@/hooks/useTheme'
import { usePielApple } from '@/hooks/usePielApple'
import { useToast } from '@/hooks/useToast'
import { nombreVisible } from '@/utils/repuestos/nombreVisible'

const DIA = 86_400_000
const NOMBRE_TECNICO = 'Técnico'

type Pieza = {
  nombre: string
  sap: string
  ubic?: string
  /** Nombre del equipo; «Sin equipo» = marcador (no cuenta); null = sin equipo asignado. */
  equipo: string | null
  stock: number
  minimo: number
  conteo?: Date
  favorita?: boolean
  sinBodega?: boolean
}

function pieza(p: Pieza): BodegaMergedItem {
  const equipos = p.equipo === null
    ? []
    : p.equipo === 'Sin equipo'
      ? [{ machineId: '', machineName: 'Sin equipo' }]
      : [{ machineId: p.equipo.toLowerCase().replace(/\s+/g, '-'), machineName: p.equipo }]
  return {
    rowKey: p.sap,
    codigoSAP: p.sap,
    codigoFabricante: '',
    textoBreve: p.nombre,
    valorUnitario: 0,
    equipos,
    bodegaId: p.sinBodega ? undefined : 'bod-vitrina',
    stockActual: p.stock,
    stockMinimo: p.minimo,
    ubicacionBodega: p.ubic ?? '',
    unidad: 'pzas',
    ultimoConteoAt: p.conteo,
    isWatched: p.favorita ?? false,
  }
}

// Los 14 casos del spec (C-2, C-3, … «nunca» = sin fecha de conteo).
const PIEZAS_INICIALES: BodegaMergedItem[] = [
  pieza({ nombre: 'BOJINETE 2001401003', sap: '3300037850', ubic: 'C-2', equipo: 'BAADER 200', stock: 2, minimo: 0, conteo: new Date(2026, 9, 2) }),
  pieza({ nombre: 'Abrazadera 2" INOX', sap: '3300029112', ubic: 'C-3', equipo: 'KNURO N1', stock: 2, minimo: 1, conteo: new Date(2026, 8, 25) }),
  pieza({ nombre: 'Abrazadera 3" INOX', sap: '3300029110', ubic: 'B-4-44', equipo: null, stock: 0, minimo: 0 }),
  pieza({ nombre: 'Abrazadera 34752009', sap: '3300120607', ubic: 'C-13', equipo: 'BAADER 142', stock: 40, minimo: 0, conteo: new Date(2026, 8, 25) }),
  pieza({ nombre: 'Abrazadera 38030218', sap: '3300011873', ubic: 'C-5', equipo: 'BAADER 142', stock: 0, minimo: 1, conteo: new Date(2026, 8, 25) }),
  pieza({ nombre: 'Abrazadera caddy 1 1/2', sap: '3300106831', ubic: 'B-4-10', equipo: 'Sin equipo', stock: 0, minimo: 0 }),
  pieza({ nombre: 'Abrazadera caddy 16 mm.', sap: '3300114319', ubic: 'A-4-11', equipo: null, stock: 31, minimo: 0, conteo: new Date(2026, 9, 14) }),
  pieza({ nombre: 'Baliza 220 V.', sap: '3100027291', ubic: 'B-1-4', equipo: null, stock: 3, minimo: 1, conteo: new Date(2025, 8, 25) }),
  pieza({ nombre: 'Bomba dosificadora DDA', sap: '3300041207', ubic: 'A-2-3', equipo: 'Planta de aguas', stock: 1, minimo: 2, favorita: true }),
  pieza({ nombre: 'Buje bronce 25 mm', sap: '3300028844', ubic: 'C-7', equipo: 'BAADER 200', stock: 6, minimo: 4, conteo: new Date(2026, 8, 25) }),
  pieza({ nombre: 'Cadena 08B-1 simple', sap: '3300019950', ubic: 'D-1-2', equipo: 'Grader GEA 184', stock: 4, minimo: 2, conteo: new Date(2026, 8, 25) }),
  pieza({ nombre: 'Cinta modular 1100', sap: '3300052281', ubic: 'Patio', equipo: 'Línea 1', stock: 0, minimo: 0 }),
  pieza({ nombre: 'Sensor inductivo M12', sap: '3300099001', equipo: 'BAADER 142', stock: 0, minimo: 0, sinBodega: true }),
  pieza({ nombre: 'Rodamiento 6204', sap: '3300099002', equipo: null, stock: 0, minimo: 0, sinBodega: true }),
]

type OpcionPedidos = 'cero' | 'por-aprobar' | 'mixtos'
type OpcionInventario = 'ninguno' | 'uno' | 'dos'

const SAP_BUJE = '3300028844'
const SAP_CADENA = '3300019950'
const SAP_CINTA = '3300052281'
const SAP_ABRAZADERA = '3300120607'

function solicitud(id: string, codigoSAP: string, textoBreve: string, cantidad: number, estado: 'pendiente' | 'aprobada'): SolicitudRepuesto {
  return {
    id, codigoSAP, textoBreve, cantidad, estado,
    solicitadoPor: 'vitrina', solicitadoPorNombre: NOMBRE_TECNICO,
    createdAt: new Date(Date.now() - 3 * 3_600_000),
    ...(estado === 'aprobada' ? { aprobadaAt: new Date(), aprobadaPor: 'Bodega (vitrina)' } : {}),
  }
}

function pedidosDe(op: OpcionPedidos): SolicitudRepuesto[] {
  if (op === 'cero') return []
  if (op === 'por-aprobar') return [
    solicitud('p1', SAP_BUJE, 'Buje bronce 25 mm', 2, 'pendiente'),
    solicitud('p2', SAP_CADENA, 'Cadena 08B-1 simple', 1, 'pendiente'),
    solicitud('p3', SAP_CINTA, 'Cinta modular 1100', 4, 'pendiente'),
  ]
  return [
    solicitud('m1', SAP_BUJE, 'Buje bronce 25 mm', 2, 'pendiente'),
    solicitud('m2', SAP_CADENA, 'Cadena 08B-1 simple', 1, 'pendiente'),
    solicitud('m3', SAP_ABRAZADERA, 'Abrazadera 34752009', 3, 'aprobada'),
  ]
}

function inventariosDe(op: OpcionInventario): InventarioSesion[] {
  const sesion = (id: string, dias: number): InventarioSesion => ({
    id, nombre: `Inventario de vitrina ${id}`, estado: 'en_curso', creadoPor: 'vitrina', creadoPorNombre: NOMBRE_TECNICO,
    totalItems: 12, contados: 4, conDiferencia: 1, createdAt: new Date(Date.now() - dias * DIA), tipo: 'periodico',
  })
  if (op === 'ninguno') return []
  if (op === 'uno') return [sesion('a', 54)]
  return [sesion('a', 54), sesion('b', 3)]
}

const OPCIONES_PEDIDOS: { v: OpcionPedidos; t: string }[] = [
  { v: 'cero', t: '0' },
  { v: 'por-aprobar', t: '3 por aprobar' },
  { v: 'mixtos', t: 'mixtos (2 por aprobar, 1 por entregar)' },
]
const OPCIONES_INVENTARIO: { v: OpcionInventario; t: string }[] = [
  { v: 'ninguno', t: 'ninguno' },
  { v: 'uno', t: '1 (hace 54 días)' },
  { v: 'dos', t: '2' },
]

export function BodegaStockDevPage() {
  const esPC = useEsPC()
  const apple = usePielApple()
  const { theme, toggleTheme } = useTheme()
  const { toast } = useToast()

  const [items, setItems] = useState<BodegaMergedItem[]>(PIEZAS_INICIALES)
  const [pedidosOp, setPedidosOp] = useState<OpcionPedidos>('cero')
  const [inventarioOp, setInventarioOp] = useState<OpcionInventario>('uno')
  const [solicitudes, setSolicitudes] = useState<SolicitudRepuesto[]>(() => pedidosDe('cero'))
  const [editando, setEditando] = useState<BodegaMergedItem | null>(null)
  const [movimiento, setMovimiento] = useState<BodegaMergedItem | null>(null)
  const [filtro, setFiltro] = useState<StockFilterKey>('configurados')
  const [busca, setBusca] = useState('')
  const [limite, setLimite] = useState(60)
  const [ordenCampo, setOrdenCampo] = useState<CampoOrden>('nombre')

  const cambiarPedidos = (op: OpcionPedidos) => { setPedidosOp(op); setSolicitudes(pedidosDe(op)) }
  const cambiarInventario = (op: OpcionInventario) => setInventarioOp(op)
  const inventariosVista = inventariosDe(inventarioOp)

  const actualizar = (codigoSAP: string, cambio: (p: BodegaMergedItem) => BodegaMergedItem) =>
    setItems(lista => lista.map(p => (p.codigoSAP === codigoSAP ? cambio(p) : p)))

  const toggleFavorito = (p: BodegaMergedItem) => actualizar(p.codigoSAP, x => ({ ...x, isWatched: !x.isWatched }))

  const guardarEdicion = async (d: BodegaStockData) => {
    if (!editando) return
    const sap = editando.codigoSAP
    actualizar(sap, x => ({ ...x, ...d, stockActual: x.bodegaId ? x.stockActual : d.stockActual }))
    setEditando(null)
    toast({ title: 'Guardado en la vitrina', description: 'Cambio solo en la copia local.', variant: 'success' })
  }

  // Movimiento: entrada suma, salida resta (sin bajar de cero), ajuste o conteo fijan la cifra.
  const registrarLocal = async (t: 'entrada' | 'salida' | 'ajuste', c: number, esConteo: boolean) => {
    if (!movimiento) return
    const sap = movimiento.codigoSAP
    actualizar(sap, x => {
      const nuevo = esConteo || t === 'ajuste' ? c : t === 'entrada' ? x.stockActual + c : Math.max(0, x.stockActual - c)
      return { ...x, stockActual: nuevo, ultimoConteoAt: esConteo ? new Date() : x.ultimoConteoAt }
    })
    setMovimiento(null)
  }

  const avanzar = async (id: string, next: SolicitudEstado) => {
    setSolicitudes(lista => lista.map(s => (s.id === id ? { ...s, estado: next } : s)))
  }

  const piezaDeSap = (sap: string) => items.find(p => p.codigoSAP === sap)
  const nombreDe = (sap: string, texto?: string) => nombreVisible(piezaDeSap(sap) ?? { textoBreve: texto ?? '', codigoSAP: sap, codigoFabricante: '' } as BodegaMergedItem)
  const stockDe = (sap: string) => {
    const p = piezaDeSap(sap)
    return p ? { configurado: !!p.bodegaId, stockActual: p.stockActual, unidad: p.unidad, ubicacionBodega: p.ubicacionBodega } : undefined
  }

  const pedidos = (
    <PedidosPorAtender
      solicitudes={solicitudes}
      esPC={esPC}
      stockDe={stockDe}
      nombreDe={nombreDe}
      onAvanzar={avanzar}
      onVerTodos={() => toast({ title: 'Vitrina', description: 'Ver todos: solo estado local.' })}
      onAbrirPieza={sap => { const p = piezaDeSap(sap); if (p) setEditando(p) }}
    />
  )

  const inventarioLinea = <LineaInventarioEnCurso compacta enCurso={inventariosVista} onVer={() => toast({ title: 'Vitrina', description: 'Ver inventario: solo estado local.' })} />

  const filtradas = aplicarFiltroDeStock(items, filtro).filter(p => {
    const q = busca.trim().toLowerCase()
    return !q || `${p.textoBreve} ${p.codigoSAP} ${p.ubicacionBodega}`.toLowerCase().includes(q)
  })

  const fila = (p: BodegaMergedItem) => (
    <BodegaRow
      item={p}
      apple={apple}
      orden={ordenCampo === 'nombre' ? 'nombre' : 'stock'}
      onEdit={() => setEditando(p)}
      onMovimiento={() => setMovimiento(p)}
      onToggleWatch={() => toggleFavorito(p)}
      onOpenDrawer={() => setEditando(p)}
    />
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div data-testid="vitrina-controles" className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-card p-3 text-footnote">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mr-2 font-semibold text-foreground">Pedidos</legend>
          {OPCIONES_PEDIDOS.map(o => (
            <button key={o.v} type="button" aria-pressed={pedidosOp === o.v} onClick={() => cambiarPedidos(o.v)}
              className={pedidosOp === o.v ? 'rounded-full bg-primary px-3 py-1 text-primary-foreground' : 'rounded-full bg-muted px-3 py-1 text-foreground'}>
              {o.t}
            </button>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mr-2 font-semibold text-foreground">Inventario</legend>
          {OPCIONES_INVENTARIO.map(o => (
            <button key={o.v} type="button" aria-pressed={inventarioOp === o.v} onClick={() => cambiarInventario(o.v)}
              className={inventarioOp === o.v ? 'rounded-full bg-primary px-3 py-1 text-primary-foreground' : 'rounded-full bg-muted px-3 py-1 text-foreground'}>
              {o.t}
            </button>
          ))}
        </fieldset>
        <button type="button" onClick={toggleTheme} className="ml-auto rounded-full bg-muted px-3 py-1 font-semibold text-foreground">
          Tema: {theme === 'dark' ? 'oscuro' : 'claro'} (cambiar)
        </button>
      </div>

      <CabeceraBodega
        subTab="stock"
        onSubTab={() => undefined}
        enCurso={inventariosVista}
        onVerInventario={() => toast({ title: 'Vitrina', description: 'Ver inventario: solo estado local.' })}
        fichaAbierta={false}
      />

      {esPC ? (
        <StockTablaPC
          items={items}
          acciones={null}
          pedidos={pedidos}
          onAbrir={p => setEditando(p)}
          onMovimiento={p => setMovimiento(p)}
          onFavorito={toggleFavorito}
        />
      ) : (
        <StockListaMovil
          items={items}
          filtradas={filtradas}
          filtro={filtro}
          onFiltro={setFiltro}
          busca={busca}
          onBusca={setBusca}
          limite={limite}
          onMas={() => setLimite(l => l + 60)}
          ordenCampo={ordenCampo}
          ordenDir="asc"
          onOrden={setOrdenCampo}
          titulo={`Por ${ordenCampo} · ${filtradas.length} de ${items.length}`}
          acciones={null}
          pedidos={pedidos}
          inventario={inventarioLinea}
          fila={fila}
        />
      )}

      {editando && <StockFormModal item={editando} onSave={guardarEdicion} onClose={() => setEditando(null)} />}
      {movimiento && (
        <MovimientoModal
          item={movimiento}
          onSave={(t, c, _m, esConteo) => registrarLocal(t, c, esConteo)}
          onClose={() => setMovimiento(null)}
        />
      )}
    </div>
  )
}
