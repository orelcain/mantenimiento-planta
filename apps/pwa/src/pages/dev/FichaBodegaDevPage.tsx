/**
 * Vitrina de desarrollo: la ficha de Bodega (`FichaPieza` real) con estado LOCAL.
 * Ruta `/dev/ficha-bodega`, solo en desarrollo. No lee ni escribe Firestore: las acciones
 * (contar, movimiento, editar, asignar, quitar) cambian una copia en memoria.
 */
import { useCallback, useState } from 'react'
import { FichaPieza } from '@/pages/repuestos/FichaPieza'
import { MovimientoModal, StockFormModal } from '@/pages/repuestos/BodegaView'
import { AsignarEquipoDialog, type CandidatoEquipo } from '@/components/repuestos/AsignarEquipoDialog'
import { agregarEquipoARepuesto } from '@/hooks/repuestos/asignarEquipo'
import type { BodegaMergedItem, BodegaStockData, MovimientoBodega } from '@/hooks/repuestos/useBodega'
import { useEsPC } from '@/hooks/useEsPC'
import { useToast } from '@/hooks/useToast'

const PIEZAS_INICIALES: BodegaMergedItem[] = [
  {
    // Marcador «Sin equipo» de useGlobalSearch: no es un equipo y no se cuenta.
    rowKey: '3100027291', codigoSAP: '3100027291', codigoFabricante: '', textoBreve: 'Baliza 220 V.',
    valorUnitario: 0, equipos: [{ machineId: '', machineName: 'Sin equipo' }],
    bodegaId: 'bod-1', stockActual: 3, stockMinimo: 0, ubicacionBodega: 'B-1-4', unidad: 'pzas',
  },
  {
    // KNURO N1 llega con dos machineId: la fila de «Quitar» debe quitar los dos.
    rowKey: '3300029112', codigoSAP: '3300029112', codigoFabricante: 'FAB-EJEMPLO-001', textoBreve: 'Abrazadera 2" INOX',
    valorUnitario: 106,
    equipos: [
      { machineId: 'kn1-a', machineName: 'KNURO N1' },
      { machineId: 'kn1-b', machineName: 'KNURO N1' },
      { machineId: 'kn2', machineName: 'KNURO N2' },
      { machineId: 'kn3', machineName: 'KNURO N3' },
    ],
    bodegaId: 'bod-2', stockActual: 2, stockMinimo: 1, ubicacionBodega: 'C-3', unidad: 'pzas',
  },
  {
    // Con SAP pero sin bodegaId: todavía no está configurada en bodega.
    rowKey: '3300050001', codigoSAP: '3300050001', codigoFabricante: '', textoBreve: 'Pieza de ejemplo sin configurar',
    valorUnitario: 0, equipos: [], stockActual: 0, stockMinimo: 0, ubicacionBodega: '', unidad: 'pzas',
  },
]

const CANDIDATOS: CandidatoEquipo[] = [
  { id: 'kn4', nombre: 'KNURO N4' },
  { id: 'det-metales', nombre: 'DETECTOR DE METALES' },
  { id: 'cinta-3', nombre: 'CINTA 3' },
  { id: 'baader-200', nombre: 'BAADER 200' },
  { id: 'vibrador-1', nombre: 'VIBRADOR 1' },
  { id: 'pasteur-2', nombre: 'PASTEURIZADOR 2' },
]

const NOMBRE_TECNICO = 'Técnico'

export function FichaBodegaDevPage() {
  const esPC = useEsPC()
  const { toast } = useToast()
  const [piezas, setPiezas] = useState<BodegaMergedItem[]>(PIEZAS_INICIALES)
  const [indice, setIndice] = useState(0)
  const [movs, setMovs] = useState<Record<string, MovimientoBodega[]>>({})
  const [admin, setAdmin] = useState(true)
  const [soloLectura, setSoloLectura] = useState(false)
  const [modal, setModal] = useState<'movimiento' | 'editar' | 'asignar' | null>(null)

  const pieza = piezas[indice]!

  const actualizarPieza = (p: BodegaMergedItem, cambios: Partial<BodegaMergedItem>) =>
    setPiezas((prev) => prev.map((x) => (x.rowKey === p.rowKey ? { ...x, ...cambios } : x)))

  // Movimiento local: mismo cálculo de stock que registrarMovimiento; un conteo sella la fecha.
  const registrarLocal = (p: BodegaMergedItem, tipo: MovimientoBodega['tipo'], cantidad: number, motivo: string, esConteo: boolean) => {
    const bodegaId = p.bodegaId ?? `local-${p.codigoSAP}`
    const anterior = p.stockActual
    const nuevo = tipo === 'entrada' ? anterior + cantidad : tipo === 'salida' ? Math.max(0, anterior - cantidad) : cantidad
    const mov: MovimientoBodega = {
      id: `mov-${Date.now()}`, bodegaItemId: bodegaId, tipo, cantidad, stockResultante: nuevo, motivo,
      realizadoPor: 'vitrina', realizadoPorNombre: NOMBRE_TECNICO, createdAt: new Date(),
    }
    setMovs((prev) => ({ ...prev, [bodegaId]: [mov, ...(prev[bodegaId] ?? [])] }))
    actualizarPieza(p, {
      bodegaId, stockActual: nuevo,
      ...(esConteo && tipo === 'ajuste' ? { ultimoConteoAt: new Date(), ultimoConteoPor: NOMBRE_TECNICO } : {}),
    })
  }

  const loadMovimientos = useCallback(async (id: string) => movs[id] ?? [], [movs])

  const contar = async (n: number) => {
    registrarLocal(pieza, 'ajuste', n, `Conteo físico (antes: ${pieza.stockActual})`, true)
    toast({ title: 'Conteo guardado', description: `Hay ${n}.`, variant: 'success' })
  }

  const elegirEquipo = (node: CandidatoEquipo) => {
    const reales = pieza.equipos.filter((e) => e.machineId)
    const patch = agregarEquipoARepuesto({ equipos: reales.map((e) => e.machineId) }, node)
    setModal(null)
    if (!patch) { toast({ title: 'Ya está asignado a ese equipo' }); return }
    const nombre = node.alias || node.nombre
    actualizarPieza(pieza, { equipos: [...reales, { machineId: node.id, machineName: nombre }] })
    toast({ title: 'Equipo asignado', description: nombre, variant: 'success' })
  }

  // Quita de la copia local todos los machineId recibidos (la fila completa).
  const quitarEquipos = (machineIds: string[]) => {
    actualizarPieza(pieza, { equipos: pieza.equipos.filter((e) => !machineIds.includes(e.machineId)) })
    return Promise.resolve()
  }

  const guardarEdicion = (d: BodegaStockData) => {
    actualizarPieza(pieza, { ...d, bodegaId: pieza.bodegaId ?? `local-${pieza.codigoSAP}` })
    setModal(null)
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 p-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-title2 font-semibold">Vitrina · ficha de Bodega (estado local, sin Firestore)</h1>
        <div className="flex flex-wrap items-center gap-2">
          {piezas.map((p, n) => (
            <button
              key={p.rowKey}
              type="button"
              onClick={() => setIndice(n)}
              aria-pressed={n === indice}
              className={`rounded-ctl border px-3 py-1.5 text-footnote ${n === indice ? 'border-primary bg-primary/10' : 'border-border'}`}
            >
              {p.textoBreve}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-footnote">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
            Admin (quitar equipo)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={soloLectura} onChange={(e) => setSoloLectura(e.target.checked)} />
            Solo lectura
          </label>
        </div>
      </header>

      <FichaPieza
        key={pieza.rowKey}
        item={pieza}
        esPC={esPC}
        origen="Vitrina"
        onVolver={() => undefined}
        loadMovimientos={loadMovimientos}
        dibujo={null}
        pedidos={[]}
        onSolicitar={soloLectura ? undefined : () => toast({ title: 'Solicitar (vitrina)', description: 'En la app abre el formulario de solicitud.' })}
        onViewInEquipo={(id) => toast({ title: 'Ver en Áreas (vitrina)', description: id })}
        onMovimiento={soloLectura ? undefined : () => setModal('movimiento')}
        onEditar={soloLectura ? undefined : () => setModal('editar')}
        onAsignarEquipo={soloLectura ? undefined : () => setModal('asignar')}
        onQuitarEquipo={soloLectura || !admin ? undefined : quitarEquipos}
        onContar={soloLectura || !pieza.codigoSAP ? undefined : contar}
      />

      {modal === 'movimiento' && (
        <MovimientoModal
          item={pieza}
          onClose={() => setModal(null)}
          onSave={async (t, c, m, esConteo) => {
            registrarLocal(pieza, t, c, m, esConteo)
            setModal(null)
          }}
        />
      )}
      {modal === 'editar' && <StockFormModal item={pieza} onClose={() => setModal(null)} onSave={async (d) => guardarEdicion(d)} />}
      <AsignarEquipoDialog
        open={modal === 'asignar'}
        onOpenChange={(o) => !o && setModal(null)}
        yaAsignados={pieza.equipos.map((e) => e.machineId)}
        guardando={false}
        candidatos={CANDIDATOS}
        onElegir={elegirEquipo}
      />
    </div>
  )
}
