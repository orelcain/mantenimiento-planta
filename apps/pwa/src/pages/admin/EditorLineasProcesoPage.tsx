import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  getBezierPath,
  applyEdgeChanges,
  applyNodeChanges,
  useConnection,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Boxes, ChevronDown, Droplets, ChevronLeft, ChevronRight, Expand, Loader2, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Plus, Redo2, RotateCcw, Search, Spline, Trash2, Undo2, X } from 'lucide-react'
import { Button, Sheet } from '@/components/piel'
import { ToastAction } from '@/components/ui/toast'
import { useHierarchyTree } from '@/hooks/useHierarchy'
import { useAuthStore } from '@/store'
import { useToast } from '@/hooks/useToast'
import {
  ENTRADA,
  NODO,
  PREFIJO_ENTRADA,
  PREFIJO_MANUAL,
  cajaNueva,
  caminoSuave,
  esEntrada,
  esManual,
  formatoPeso,
  idDeContenedor,
  limitesDeGrupo,
  limitesDeZonas,
  lineaDeEntrada,
  pesosPorLinea,
  relacionesDeServicios,
  serviciosDe,
  zonaDeNodo,
  type GrafoLineas,
  type CurvaFlecha,
  type GrupoParalelo,
  type LineaProceso,
  type PesoEnLinea,
} from '@/services/lineasProceso/modeloLineas'
import { DE_OTRA_PLANTA, propuestaChonchi } from '@/services/lineasProceso/propuestaChonchi'
import { RAIZ_SITIO_CHONCHI, guardarLineas, indiceArbol, leerLineas } from '@/services/lineasProceso/lineasProceso.service'

/**
 * Editor de líneas de proceso (panel admin, 19-09-2026; mockups aprobados
 * https://claude.ai/artifact/G4KbK1RAYafiJXabWQGFNf y
 * https://claude.ai/artifact/Xe7TNVjgcX3zHcjTz7hYYe). Las máquinas se unen con
 * flechas en el orden del flujo y el PESO de cada una en su línea se calcula solo
 * (`pesosPorLinea`): serie 100 %, paralelo 1/N, suelta = fuera de la línea. Debajo,
 * los SERVICIOS DE APOYO (agua, RILES, frío…): flechas «abastece a» / «recibe de»,
 * marcados indirectos, sin peso.
 *
 * HIG: inspector de la selección («Panels»), deshacer/rehacer y aviso con Deshacer
 * («Undo and redo», «Drag and drop»), destino resaltado solo mientras se arrastra
 * encima, varios a la vez con Mayús, foco y nombre para teclado y lector de pantalla.
 * Se edita en el PC; en el teléfono se ve (arrastrar nodos sobre un lienzo que
 * también se desplaza con el dedo es una trampa).
 */

const PLANTA = 'chonchi'
const MIME = 'application/x-equipo'
const GRILLA: [number, number] = [16, 16]
const APOYO = 'rgb(var(--cat-6-ink))'

type DatosMaquina = { nombre: string; peso: number | null; linea: string | null; contenedor: string | null; componentes: number; otraPlanta?: string; manual?: boolean; ciclo?: boolean; ramas: number }
type DatosServicio = { nombre: string; abastece: string[]; recibe: string[] }
type DatosEntrada = { linea: string }
type DatosZona = { nombre: string; w: number; h: number; apoyo: boolean; resaltada: boolean; onMover?: (ev: ReactPointerEvent) => void }
type Instantanea = { nodes: Node[]; edges: Edge[]; lineas: LineaProceso[] }
/** Pertenencia y nombre (manuales) que viajan en `data` de los nodos base. */
type DatosBase = { zona?: string; nombre?: string }
/** Una confirmación pendiente: entrar, salir o cambiar de contenedor (Orel, 19-09-2026). */
type Pedido = {
  titulo: string
  detalle: string
  confirmar: string
  hacer: () => void
  cancelar?: () => void
  /** Segunda salida de la misma pregunta (p. ej. borrar el contenedor CON sus equipos). */
  alterno?: { texto: string; hacer: () => void }
  /** Pinta la confirmación como destructiva (HIG «Alerts»: el borrado se ve rojo). */
  destructivo?: boolean
}

function tonoPeso(peso: number | null): 'serie' | 'paralelo' | 'fuera' {
  if (peso == null || peso === 0) return 'fuera'
  return Math.abs(peso - 1) < 1e-9 ? 'serie' : 'paralelo'
}
/**
 * La cuota NO se pinta con los colores de estado (verde/ámbar/rojo): en el resto de la app
 * esos tres significan «bien / ojo / crítico», y una BAADER sana al 33,3 % se leía como
 * máquina en falla (HIG color: «avoid using the same color to mean different things»).
 * La cuota se lee por LARGO: un chip con la cifra y una barra al pie de la tarjeta.
 */
const TINTA = { serie: 'text-ink-crit', paralelo: 'text-ink-warn', fuera: 'text-muted-foreground' } as const
/**
 * Puntos de unión fáciles de acertar (Orel, 19-09-2026: «no funcionan bien las uniones»).
 * A 37 % de zoom un punto de 14 px mide 4 px en pantalla. Por eso:
 * - el punto de SALIDA tiene un área de agarre de ≥ 28 px en pantalla a cualquier zoom
 *   (el punto visible sigue chico);
 * - mientras se arrastra una flecha, TODA la tarjeta recibe la unión (no hay que
 *   acertarle al punto de llegada). Fuera de ese momento el área no intercepta nada y la
 *   tarjeta se arrastra normal.
 */
function PuntosUnion({ claro }: { claro?: boolean }) {
  const zoom = useStore((st) => st.transform[2])
  // Unir arrastrando O con dos clics (clic en el punto de salida, clic en el destino).
  const arrastrando = useConnection((c) => c.inProgress)
  const conClic = useStore((st) => !!st.connectionClickStartHandle)
  const uniendo = arrastrando || conClic
  // Tope de 36 unidades: a zoom bajo el agarre no debe tapar media tarjeta ni a las vecinas
  // (se robaba los clics para arrastrar la tarjeta).
  const agarre = Math.min(36, Math.max(14, 28 / zoom))
  // El punto VISIBLE también crece al alejar el lienzo: a 33 % uno de 14 px se veía de 4 px y
  // Orel no encontraba de dónde agarrar (19-09-2026).
  const visible = Math.min(30, Math.max(12, 16 / zoom))
  const punto = claro ? 'border-2 border-primary bg-primary-foreground' : 'border-2 border-card bg-primary'
  return (
    <>
      {/* Toda la tarjeta recibe la unión mientras se une (id propio: el punto izquierdo es el de siempre). */}
      <Handle
        type="target"
        id="toda"
        position={Position.Left}
        isConnectableStart={false}
        className="!absolute !inset-0 !size-full !translate-x-0 !translate-y-0 !transform-none !rounded-card !border-0 !bg-transparent"
        style={{ pointerEvents: uniendo ? 'all' : 'none' }}
      />
      {/* Punto de llegada real (el que usan las flechas guardadas): también se le puede soltar o hacer clic. */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        className="!flex !items-center !justify-center !rounded-full !border-0 !bg-transparent"
        style={{ width: agarre, height: agarre }}
      >
        <span aria-hidden style={{ width: visible, height: visible }} className={`pointer-events-none rounded-full ${punto} ${uniendo ? 'ring-4 ring-primary/30' : ''}`} />
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        title="Arrastra desde aquí para unir"
        className="!flex !items-center !justify-center !rounded-full !border-0 !bg-transparent"
        style={{ width: agarre, height: agarre }}
      >
        <span aria-hidden style={{ width: visible, height: visible }} className={`pointer-events-none rounded-full ${punto}`} />
      </Handle>
    </>
  )
}
const SELECCION = 'ring-4 ring-primary/35'

function NodoMaquina({ data, selected }: NodeProps<Node<DatosMaquina>>) {
  const conFlujo = data.peso != null && data.peso > 0 && !data.ciclo && !data.otraPlanta
  const cifra = data.otraPlanta ? `de ${data.otraPlanta}` : data.ciclo ? 'en círculo' : data.peso == null ? '0 %' : formatoPeso(data.peso)
  const chip = data.ciclo
    ? 'bg-ink-warn/15 text-ink-warn'
    : conFlujo
      ? 'bg-[rgb(var(--brand)/0.14)] text-[rgb(var(--brand-ink))]'
      : 'bg-muted-foreground/12 text-muted-foreground'
  return (
    <div
      style={{ width: NODO.ancho, height: NODO.alto }}
      className={`relative flex flex-col justify-center gap-1 overflow-hidden rounded-ctl border bg-card px-2.5 py-2 shadow-[0_1px_2px_rgb(0_0_0/0.07)] ${
        conFlujo ? 'border-border' : 'border-dashed border-muted-foreground/55'
      } ${selected ? SELECCION : ''}`}
    >
      <p className="line-clamp-2 text-[11.5px] font-semibold leading-tight tracking-[-0.005em]">{data.nombre}</p>
      <p className="flex items-center gap-1.5 truncate text-[10px] leading-tight text-muted-foreground">
        <span className={`shrink-0 rounded-full px-1.5 py-px text-[11.5px] font-bold tabular-nums leading-tight ${chip}`}>{cifra}</span>
        <span className="truncate">
          {data.otraPlanta
            ? 'no cuenta en esta planta'
            : data.ciclo
              ? 'flecha de vuelta'
              : data.linea
                ? data.ramas > 1
                  ? `1 de ${data.ramas} · ${data.linea}`
                  : data.linea
                : `fuera de la línea${data.contenedor ? ` · ${data.contenedor}` : ''}`}
          {data.componentes ? ` · +${data.componentes} comp.` : ''}
          {data.manual ? ' · manual' : ''}
        </span>
      </p>
      {/* La cuota como LONGITUD, al pie de la tarjeta: se compara sin leer la cifra. */}
      {conFlujo && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-foreground/10">
          <span className="block h-full bg-[rgb(var(--brand))]" style={{ width: `${Math.round((data.peso ?? 0) * 100)}%` }} />
        </span>
      )}
      <PuntosUnion />
    </div>
  )
}

function NodoServicio({ data, selected }: NodeProps<Node<DatosServicio>>) {
  const texto = [data.abastece.length ? `abastece a ${data.abastece.join(', ')}` : '', data.recibe.length ? `recibe de ${data.recibe.join(', ')}` : '']
    .filter(Boolean)
    .join(' · ')
  return (
    <div
      style={{ width: NODO.ancho, borderColor: APOYO }}
      className={`rounded-card border-2 border-dashed bg-card px-3 py-2 shadow-[0_1px_4px_rgba(0,0,0,0.12)] ${selected ? SELECCION : ''}`}
    >
      <p className="break-words text-[12px] font-semibold leading-tight">{data.nombre}</p>
      <p className="text-[12px] font-bold leading-snug" style={{ color: APOYO }}>
        indirecto
      </p>
      <p className="text-[10.5px] leading-tight text-muted-foreground">{texto || 'sin unir: une con una flecha a la línea que abastece'}</p>
      <PuntosUnion />
    </div>
  )
}

function NodoEntrada({ data, selected }: NodeProps<Node<DatosEntrada>>) {
  return (
    <div className={`flex min-h-[44px] w-[124px] items-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground shadow-[0_1px_4px_rgba(0,0,0,0.15)] ${selected ? SELECCION : ''}`}>
      Entrada {data.linea}
      <PuntosUnion claro />
    </div>
  )
}

function NodoZona({ data }: NodeProps<Node<DatosZona>>) {
  return (
    <div
      style={{ width: data.w, height: data.h, ...(data.apoyo ? { borderColor: APOYO } : {}) }}
      className={`rounded-panel border transition-colors duration-150 motion-reduce:transition-none ${data.apoyo ? 'border-dashed' : 'border-muted-foreground/25'} ${
        data.resaltada ? 'bg-primary/10 ring-2 ring-primary' : 'bg-card/45'
      }`}
    >
      {/* Franja del título = asa: arrastra el contenedor con todo lo que tiene (Orel, 19-09-2026).
          Es la única parte que se agarra: el resto de la caja sigue desplazando el lienzo. */}
      <div
        onPointerDown={data.onMover}
        // React Flow deja los nodos no seleccionables sin eventos de puntero: la franja los recupera.
        style={data.onMover ? { pointerEvents: 'all' } : undefined}
        title={data.onMover ? 'Arrastra el título para mover el contenedor con todo lo que tiene' : undefined}
        className={`nodrag nopan absolute inset-x-0 top-0 flex h-[48px] items-center rounded-t-panel px-4 ${data.onMover ? 'cursor-grab hover:bg-muted-foreground/10 active:cursor-grabbing' : ''}`}
      >
        <span className="text-headline" style={{ color: data.apoyo ? APOYO : undefined }}>
          <span className={data.apoyo ? '' : 'text-muted-foreground'}>{data.nombre}</span>
        </span>
      </div>
    </div>
  )
}

/** Encuadre de un grupo en paralelo: se deriva del grafo, no se guarda. */
type DatosParalelo = { w: number; h: number; etiqueta: string; manual?: boolean; activo?: boolean; onEditar?: () => void }
function NodoParalelo({ data }: NodeProps<Node<DatosParalelo>>) {
  return (
    <div
      style={{ width: data.w, height: data.h, borderColor: 'rgb(var(--brand) / 0.55)', background: 'rgb(var(--brand) / 0.07)' }}
      className={`rounded-[18px] border ${data.manual ? 'border-solid' : 'border-dashed'} ${data.activo ? 'ring-4 ring-primary/35' : ''}`}
    >
      {/* La píldora es el asa del grupo: se toca para editarlo (el encuadre queda bajo las
          tarjetas, así que un clic en el medio no siempre le llega). */}
      <button
        type="button"
        disabled={!data.onEditar}
        onPointerDown={(ev) => {
          if (!data.onEditar) return
          ev.stopPropagation()
          data.onEditar()
        }}
        style={{ pointerEvents: 'all' }}
        title={data.manual ? 'Grupo marcado a mano: tócalo para editarlo' : 'Se dedujo de las flechas'}
        className="nodrag nopan absolute -top-3 left-4 rounded-full bg-[rgb(var(--brand)/0.14)] px-2 py-0.5 text-[10.5px] font-semibold text-[rgb(var(--brand-ink))] disabled:cursor-default"
      >
        {data.etiqueta}
      </button>
    </div>
  )
}

/** Barra donde el flujo se abre en ramas (convención de los P&ID: cabezal común). */
function NodoReparto({ data }: NodeProps<Node<{ h: number }>>) {
  return <div style={{ width: 6, height: data.h, background: 'rgb(var(--brand))' }} className="rounded-full" />
}

const TIPOS = { maquina: NodoMaquina, servicio: NodoServicio, entrada: NodoEntrada, zona: NodoZona, paralelo: NodoParalelo, reparto: NodoReparto }

/** Lo que la flecha necesita para dibujarse y para dejarse acomodar. */
type DatosFlecha = { puntos: { x: number; y: number }[]; editable: boolean; onPuntos: (p: { x: number; y: number }[]) => void }

/**
 * Flecha que pasa por los puntos que uno le ponga, con curva suave (Orel pidió «ordenar las
 * líneas como si fueran cuerdas», nunca ángulos rectos). Sin puntos es la curva de siempre.
 * Seleccionada: arrastrar su cuerpo agrega un punto y lo mueve; doble clic en un punto lo quita.
 */
function FlechaCurva({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, label, labelStyle, labelBgStyle, data }: EdgeProps) {
  const { screenToFlowPosition } = useReactFlow()
  // `selected` no llega por props en esta versión: se lee del estado de React Flow.
  const selected = useStore((st) => !!st.edgeLookup.get(id)?.selected)
  const d = data as DatosFlecha
  const puntos = d?.puntos ?? []
  const [bezier, mx, my] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const camino = puntos.length ? caminoSuave([{ x: sourceX, y: sourceY }, ...puntos, { x: targetX, y: targetY }]) : bezier

  // `base` es la lista de puntos vigente: al crear uno y arrastrarlo enseguida, el cierre
  // todavía tenía la lista anterior y el punto nuevo se borraba al primer movimiento.
  const arrastrar = (indice: number, ev: ReactPointerEvent, base: { x: number; y: number }[]) => {
    if (!d?.editable) return
    ev.stopPropagation()
    ev.preventDefault()
    const mover = (e: PointerEvent) => {
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      d.onPuntos(base.map((q, i) => (i === indice ? { x: Math.round(p.x), y: Math.round(p.y) } : q)))
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  // Al tomar el cuerpo de la flecha se crea un punto en el tramo más cercano y se arrastra.
  const tomarCuerpo = (ev: ReactPointerEvent) => {
    if (!d?.editable || !selected) return
    const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
    const tramos = [{ x: sourceX, y: sourceY }, ...puntos, { x: targetX, y: targetY }]
    let mejor = 0
    let dist = Infinity
    for (let i = 0; i < tramos.length - 1; i++) {
      const a = tramos[i]!
      const b = tramos[i + 1]!
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const dd = (c.x - p.x) ** 2 + (c.y - p.y) ** 2
      if (dd < dist) {
        dist = dd
        mejor = i
      }
    }
    const nuevos = [...puntos.slice(0, mejor), { x: Math.round(p.x), y: Math.round(p.y) }, ...puntos.slice(mejor)]
    d.onPuntos(nuevos)
    arrastrar(mejor, ev, nuevos)
  }

  return (
    <>
      <path id={id} className="react-flow__edge-path" d={camino} markerEnd={markerEnd} style={style} />
      <path className="react-flow__edge-interaction" d={camino} fill="none" strokeWidth={20} stroke="transparent" onPointerDown={tomarCuerpo} />
      {label ? (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)`, ...labelBgStyle }} className="pointer-events-none absolute rounded-ctl px-1 py-px">
            <span style={labelStyle}>{label}</span>
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {selected && d?.editable && (
        <EdgeLabelRenderer>
          {puntos.map((p, i) => (
            <div
              key={i}
              role="presentation"
              onPointerDown={(ev) => arrastrar(i, ev, puntos)}
              onDoubleClick={() => d.onPuntos(puntos.filter((_, j) => j !== i))}
              title="Arrastra para acomodar · doble clic para quitarlo"
              style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`, pointerEvents: 'all' }}
              className="nodrag nopan absolute size-3 cursor-grab rounded-full border-2 border-card bg-[rgb(var(--brand))] shadow-[0_1px_3px_rgba(0,0,0,0.3)] active:cursor-grabbing"
            />
          ))}
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const TIPOS_FLECHA = { curva: FlechaCurva }

const aNodos = (g: GrafoLineas): Node[] => [
  ...g.lineas.map((l) => ({
    id: `zona:${l.id}`,
    type: 'zona',
    position: { x: l.zona.x, y: l.zona.y },
    data: { nombre: l.nombre, w: l.zona.w, h: l.zona.h, apoyo: l.tipo === 'apoyo', resaltada: false },
    draggable: false,
    selectable: false,
    deletable: false,
    focusable: false,
    zIndex: -2,
  })),
  ...g.nodos.map((n) => ({
    id: n.id,
    type: esEntrada(n.id) ? 'entrada' : 'maquina',
    position: { x: n.x, y: n.y },
    data: { ...(n.zona !== undefined ? { zona: n.zona } : {}), ...(n.nombre ? { nombre: n.nombre } : {}) } satisfies DatosBase,
    deletable: !esEntrada(n.id),
  })),
]
const aAristas = (g: GrafoLineas): Edge[] => g.aristas.map(([a, b]) => ({ id: `${a}->${b}`, source: a, target: b }))

function alGrafo(lineas: LineaProceso[], nodes: Node[], edges: Edge[], grupos: GrupoParalelo[] = [], curvas: CurvaFlecha[] = []): GrafoLineas {
  // La esquina de cada contenedor vive en su nodo del lienzo: así mover la caja entra en deshacer.
  const esquina = new Map(nodes.filter((n) => n.type === 'zona').map((n) => [n.id.slice('zona:'.length), n.position]))
  return {
    version: 1,
    lineas: lineas.map((l) => {
      const p = esquina.get(l.id)
      return p && (p.x !== l.zona.x || p.y !== l.zona.y) ? { ...l, zona: { ...l.zona, x: Math.round(p.x), y: Math.round(p.y) } } : l
    }),
    nodos: nodes
      .filter((n) => n.type !== 'zona')
      .map((n) => {
        const d = n.data as DatosBase
        return { id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y), ...(d.zona !== undefined ? { zona: d.zona } : {}), ...(d.nombre ? { nombre: d.nombre } : {}) }
      }),
    aristas: edges.map((e) => [e.source, e.target] as [string, string]),
    // Un grupo con menos de dos miembros en el lienzo ya no es un grupo.
    grupos: grupos.map((g) => ({ ...g, miembros: g.miembros.filter((m) => nodes.some((n) => n.id === m)) })).filter((g) => g.miembros.length > 1),
    // Una curva sin su flecha ya no sirve.
    curvas: curvas.filter((c) => c.puntos.length > 0 && edges.some((e) => e.source === c.a && e.target === c.b)),
  }
}

const escribiendo = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

function Editor() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const usuario = useAuthStore((s) => s.user)
  const { tree, loading: cargandoArbol } = useHierarchyTree()
  const { screenToFlowPosition, fitView, getZoom } = useReactFlow()
  // Mover un contenedor entero por su título (se define más abajo, cuando ya existe la pertenencia).
  const moverZona = useRef<(zonaId: string, ev: ReactPointerEvent) => void>(() => undefined)
  const lienzo = useRef<HTMLDivElement>(null)
  // Espacio de trabajo (Orel, 19-09-2026): pantalla completa y lista de equipos plegable.
  const [amplio, setAmplio] = useState(false)
  const [conLista, setConLista] = useState(true)

  const [lineas, setLineas] = useState<LineaProceso[]>([])
  const [grupos, setGrupos] = useState<GrupoParalelo[]>([])
  const [curvas, setCurvas] = useState<CurvaFlecha[]>([])
  const [grupoSel, setGrupoSel] = useState<string | null>(null)
  // Modo «Agrupar»: tocar los equipos que trabajan en paralelo, sin depender de teclas
  // (Ctrl/Mayús + clic no es descubrible, y Orel ya entendió el modo «Unir»).
  const [modoGrupo, setModoGrupo] = useState<string[] | null>(null)
  // Las punteadas de los servicios cruzan todo el lienzo: se pueden esconder para mirar la
  // línea en limpio (es solo visual: los pesos no cambian).
  const [verApoyo, setVerApoyo] = useState(true)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [guardado, setGuardado] = useState<string>('')
  const [meta, setMeta] = useState<string>('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [zonaResaltada, setZonaResaltada] = useState<string | null>(null)
  // Modo «Unir»: se toca el equipo de origen y después el de destino, sin apuntarle a los
  // puntos (Orel, 19-09-2026: «sigo sin entender cómo poner las líneas de un elemento a otro»).
  const [modoUnir, setModoUnir] = useState(false)
  const [origenUnir, setOrigenUnir] = useState<string | null>(null)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set())
  const [manual, setManual] = useState<{ nombre: string; zona: string } | null>(null)
  // Contenedor elegido (las zonas no son seleccionables de React Flow: se tocan por su título).
  const [zonaSel, setZonaSel] = useState<string | null>(null)
  const [nuevaLinea, setNuevaLinea] = useState<{ nombre: string; tipo: 'linea' | 'apoyo' } | null>(null)
  // Renombrar: UNA entrada de deshacer por tanda de tecleo, no una por letra.
  const renombrando = useRef<string | null>(null)
  const [oscuro, setOscuro] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  const [editable, setEditable] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 768px) and (pointer: fine)').matches)
  // Deshacer / rehacer: instantáneas antes de cada cambio que importa (HIG «Undo and redo»).
  const pilaDeshacer = useRef<Instantanea[]>([])
  const pilaRehacer = useRef<Instantanea[]>([])
  const [, setVersionPilas] = useState(0)
  const actual = useRef<Instantanea>({ nodes: [], edges: [], lineas: [] })
  actual.current = { nodes, edges, lineas }

  useEffect(() => {
    const raiz = document.documentElement
    const obs = new MutationObserver(() => setOscuro(raiz.classList.contains('dark')))
    obs.observe(raiz, { attributes: true, attributeFilter: ['class'] })
    const mq = window.matchMedia('(min-width: 768px) and (pointer: fine)')
    const cambio = () => setEditable(mq.matches)
    mq.addEventListener('change', cambio)
    return () => {
      obs.disconnect()
      mq.removeEventListener('change', cambio)
    }
  }, [])

  // La lista es el árbol COMPLETO del sitio (Orel: «todos los elementos de la jerarquía,
  // no solo los que tienen código»): Planta Chonchi, Planta Yal, Acopio, Exteriores.
  const { raiz, indice } = useMemo(() => indiceArbol(tree, RAIZ_SITIO_CHONCHI), [tree])
  const deOtraPlanta = useMemo(() => {
    const m = new Map<string, string>()
    for (const [id, e] of indice) if (DE_OTRA_PLANTA[e.nombre]) m.set(id, DE_OTRA_PLANTA[e.nombre]!)
    return m
  }, [indice])

  const cargarGrafo = useCallback((g: GrafoLineas) => {
    setLineas(g.lineas)
    setGrupos(g.grupos ?? [])
    setCurvas(g.curvas ?? [])
    setNodes(aNodos(g))
    setEdges(aAristas(g))
  }, [])

  const propuesta = useCallback(() => {
    const porNombre = new Map<string, string>()
    // Los nombres se repiten entre plantas (KNURO N1 hay en Chonchi y en Yal): la propuesta es de Chonchi.
    for (const [id, e] of indice) if (!e.ruta.includes('PLANTA YAL') && !porNombre.has(e.nombre.toUpperCase())) porNombre.set(e.nombre.toUpperCase(), id)
    return propuestaChonchi((n) => porNombre.get(n.trim().toUpperCase()))
  }, [indice])

  // Carga: lo guardado o, si no hay nada, la propuesta deducida del árbol.
  useEffect(() => {
    if (cargandoArbol || !indice.size) return
    let vivo = true
    leerLineas(PLANTA)
      .then((g) => {
        if (!vivo) return
        const base = g ?? propuesta()
        cargarGrafo(base)
        setGuardado(g ? JSON.stringify(alGrafo(base.lineas, aNodos(base), aAristas(base), base.grupos ?? [], base.curvas ?? [])) : '')
        setMeta(g?.actualizadoPor ? `Guardado por ${g.actualizadoPor}${g.actualizadoEn ? ` · ${g.actualizadoEn.toDate().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}` : ''}` : 'Propuesta sin guardar')
      })
      .catch(() => {
        if (!vivo) return
        // Sin lectura (señal, o regla aún no publicada): la propuesta, con aviso — nunca un lienzo vacío.
        cargarGrafo(propuesta())
        setGuardado('')
        setMeta('No se pudo leer lo guardado: se muestra la propuesta')
        toast({ title: 'No se pudieron leer las líneas guardadas', description: 'Se muestra la propuesta. Revisa la conexión.', variant: 'destructive' })
      })
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [cargandoArbol, indice, propuesta, cargarGrafo, toast])

  // Pesos calculados con las flechas, en cada cambio.
  const grafo = useMemo(() => alGrafo(lineas, nodes, edges, grupos, curvas), [lineas, nodes, edges, grupos, curvas])
  const pesos = useMemo(() => pesosPorLinea(grafo), [grafo])
  const servicios = useMemo(() => serviciosDe(grafo), [grafo])
  const relaciones = useMemo(() => relacionesDeServicios(grafo, pesos), [grafo, pesos])
  const nombreLinea = useMemo(() => new Map(lineas.map((l) => [l.id, l.nombre])), [lineas])
  const nombresManuales = useMemo(() => new Map(grafo.nodos.filter((n) => esManual(n.id)).map((n) => [n.id, n.nombre ?? 'Elemento manual'])), [grafo])
  const nombreDe = useCallback(
    (id: string) =>
      esEntrada(id)
        ? `Entrada ${nombreLinea.get(lineaDeEntrada(id)) ?? ''}`
        : esManual(id)
          ? (nombresManuales.get(id) ?? 'Elemento manual')
          : (indice.get(id)?.nombre ?? 'Equipo que ya no está en el árbol'),
    [indice, nombreLinea, nombresManuales],
  )
  // Contenedores: pertenencia explícita y límites que crecen con sus equipos.
  const limites = useMemo(() => limitesDeZonas(grafo), [grafo])
  const contenedorDe = useMemo(() => new Map(grafo.nodos.map((n) => [n.id, zonaDeNodo(lineas, n)])), [grafo, lineas])

  const yaUnidos = useMemo(() => new Set(origenUnir ? edges.filter((e) => e.source === origenUnir).map((e) => e.target) : []), [edges, origenUnir])
  // Ramas por equipo (de cuántas salidas del mismo padre es una) y flujo que lleva cada flecha:
  // el GROSOR de la flecha es el flujo, así se ve dónde reparte la línea sin leer un número.
  const reparto = useMemo(() => {
    const salidas = new Map<string, number>()
    for (const e of edges) if (!servicios.has(e.source) && !servicios.has(e.target)) salidas.set(e.source, (salidas.get(e.source) ?? 0) + 1)
    const ramas = new Map<string, number>()
    for (const e of edges) if (!servicios.has(e.source) && !servicios.has(e.target)) ramas.set(e.target, Math.max(ramas.get(e.target) ?? 1, salidas.get(e.source) ?? 1))
    return { salidas, ramas }
  }, [edges, servicios])
  const flujoDeFlecha = useCallback(
    (e: Edge) => {
      const desde = esEntrada(e.source) ? 1 : (pesos.get(e.source)?.peso ?? 0)
      return desde / Math.max(1, reparto.salidas.get(e.source) ?? 1)
    },
    [pesos, reparto],
  )

  // 2) Los evidentes, deducidos del grafo: un equipo del que salen 2+ flechas a ramas parejas.
  const auto = useCallback((excluir: Set<string>) => {
    const porOrigen = new Map<string, string[]>()
    for (const e of edges) {
      if (servicios.has(e.source) || servicios.has(e.target)) continue
      porOrigen.set(e.source, [...(porOrigen.get(e.source) ?? []), e.target])
    }
    const caja = new Map(nodes.filter((n) => n.type !== 'zona').map((n) => [n.id, n.position]))
    const out: Node[] = []
    for (const [origen, destinos] of porOrigen) {
      if (destinos.length < 2 || destinos.some((d) => excluir.has(d))) continue
      const cajas = destinos.map((d) => caja.get(d)).filter((p): p is { x: number; y: number } => !!p)
      if (cajas.length !== destinos.length) continue
      const cuotas = destinos.map((d) => pesos.get(d)?.peso ?? 0)
      if (cuotas.some((c) => c <= 0) || Math.max(...cuotas) - Math.min(...cuotas) > 1e-6) continue
      const x1 = Math.min(...cajas.map((c) => c.x))
      const y1 = Math.min(...cajas.map((c) => c.y))
      const x2 = Math.max(...cajas.map((c) => c.x)) + NODO.ancho
      const y2 = Math.max(...cajas.map((c) => c.y)) + NODO.alto
      out.push({
        id: `paralelo:${origen}`,
        type: 'paralelo',
        position: { x: x1 - 14, y: y1 - 14 },
        data: { w: x2 - x1 + 28, h: y2 - y1 + 28, etiqueta: `Paralelo · ${destinos.length} ramas · ${formatoPeso(cuotas[0] ?? 0)} c/u` },
        draggable: false,
        selectable: false,
        deletable: false,
        focusable: false,
        zIndex: -1,
      })
      const p = caja.get(origen)
      const alto = Math.max(24, y2 - y1 - NODO.alto)
      // A media distancia entre el equipo que reparte y el grupo: ahí se abre el flujo.
      if (p) out.push({ id: `reparto:${origen}`, type: 'reparto', position: { x: Math.max(p.x + NODO.ancho + 12, (p.x + NODO.ancho + x1) / 2 - 3), y: y1 + NODO.alto / 2 - 3 }, data: { h: alto }, draggable: false, selectable: false, deletable: false, focusable: false, zIndex: -1 })
    }
    return out
  }, [edges, nodes, pesos, servicios])

  /**
   * Grupos en paralelo: un equipo del que salen 2+ flechas a equipos que se reparten el
   * flujo por igual. Se dibuja la barra donde se abre y un encuadre con «Paralelo · N ramas».
   * Todo se deriva del grafo: no agrega datos al modelo ni se guarda.
   */
  const nodosParalelo = useMemo(() => {
    const out: Node[] = []
    const yaEnGrupo = new Set<string>()
    // 1) Los marcados a mano: mandan sobre lo deducido.
    for (const gr of grupos) {
      const caja = limitesDeGrupo(grafo.nodos, gr.miembros)
      if (!caja) continue
      gr.miembros.forEach((m) => yaEnGrupo.add(m))
      const cuotas = gr.miembros.map((m) => pesos.get(m)?.peso ?? 0)
      const parejo = cuotas.length > 0 && cuotas.every((c) => c > 0) && Math.max(...cuotas) - Math.min(...cuotas) < 1e-6
      out.push({
        id: `grupo:${gr.id}`,
        type: 'paralelo',
        position: { x: caja.x, y: caja.y },
        data: {
          w: caja.w,
          h: caja.h,
          manual: true,
          activo: grupoSel === gr.id,
          onEditar: () => setGrupoSel(gr.id),
          etiqueta: gr.nombre ? `${gr.nombre} · ${gr.miembros.length} ramas` : `Paralelo · ${gr.miembros.length} ramas${parejo ? ` · ${formatoPeso(cuotas[0] ?? 0)} c/u` : ''}`,
        },
        draggable: false,
        // Seleccionable para poder tocarlo y editarlo; sin `draggable` el lienzo se sigue desplazando.
        selectable: true,
        deletable: false,
        focusable: false,
        zIndex: -1,
      })
    }
    return [...out, ...auto(yaEnGrupo)]
  }, [grupos, grafo, pesos, grupoSel, auto])

  const vista = useMemo(
    () =>
      nodes.map((n): Node => {
        // En modo unir: el origen con anillo y, atenuados, los que YA están unidos a él.
        const marca =
          n.id === origenUnir || modoGrupo?.includes(n.id) ? 'rounded-ctl ring-4 ring-primary' : yaUnidos.has(n.id) ? 'opacity-40' : undefined
        if (n.type === 'zona') {
          const l = limites.get(n.id.slice('zona:'.length))
          return {
            ...n,
            position: l ? { x: l.x, y: l.y } : n.position,
            data: { ...n.data, ...(l ? { w: l.w, h: l.h } : {}), resaltada: n.id === zonaResaltada, ...(editable ? { onMover: (ev: ReactPointerEvent) => moverZona.current(n.id, ev) } : {}) },
          }
        }
        if (n.type === 'entrada') return { ...n, className: marca, ariaLabel: nombreDe(n.id), data: { linea: nombreLinea.get(lineaDeEntrada(n.id)) ?? lineaDeEntrada(n.id) } }
        const e = indice.get(n.id)
        if (servicios.has(n.id)) {
          const r = relaciones.get(n.id)
          const data: DatosServicio = {
            nombre: nombreDe(n.id),
            abastece: (r?.abastece ?? []).map((l) => nombreLinea.get(l) ?? l),
            recibe: (r?.recibe ?? []).map((l) => nombreLinea.get(l) ?? l),
          }
          return { ...n, type: 'servicio', className: marca, ariaLabel: `${data.nombre}, servicio de apoyo`, data }
        }
        const p = pesos.get(n.id)
        const cont = contenedorDe.get(n.id)
        const data: DatosMaquina = {
          nombre: nombreDe(n.id),
          componentes: e ? e.hijos.length : 0,
          otraPlanta: deOtraPlanta.get(n.id),
          peso: p?.peso ?? null,
          linea: p ? (nombreLinea.get(p.lineaId) ?? null) : null,
          contenedor: cont ? (nombreLinea.get(cont) ?? null) : null,
          manual: esManual(n.id),
          ciclo: p?.ciclo,
          ramas: reparto.ramas.get(n.id) ?? 1,
        }
        return {
          ...n,
          type: 'maquina',
          className: marca,
          ariaLabel: `${data.nombre}, ${data.linea ? `${formatoPeso(data.peso ?? 0)} de ${data.linea}` : 'fuera de la línea'}`,
          data,
        }
      }),
    [nodes, indice, pesos, servicios, relaciones, nombreLinea, zonaResaltada, deOtraPlanta, nombreDe, limites, contenedorDe, editable, origenUnir, yaUnidos, reparto, modoGrupo],
  )

  const conParalelos = useMemo(
    () =>
      verApoyo
        ? [...vista, ...nodosParalelo]
        : // Sin servicios, su contenedor queda vacío: también se esconde.
          [...vista.filter((n) => n.type !== 'servicio' && !(n.type === 'zona' && (n.data as DatosZona).apoyo)), ...nodosParalelo],
    [vista, nodosParalelo, verApoyo],
  )

  // Acomodar una flecha: sus puntos se guardan con las líneas.
  const ponerPuntos = useCallback((a: string, b: string, puntos: { x: number; y: number }[]) => {
    setCurvas((cs) => {
      const resto = cs.filter((c) => !(c.a === a && c.b === b))
      return puntos.length ? [...resto, { a, b, puntos }] : resto
    })
  }, [])

  const vistaAristas = useMemo(
    () =>
      edges.map((e): Edge => {
        const apoyo = servicios.has(e.source) || servicios.has(e.target)
        const entre = !apoyo && esEntrada(e.target)
        const f = flujoDeFlecha(e)
        const grosor = f >= 0.99 ? 2.5 : f >= 0.45 ? 1.8 : f >= 0.2 ? 1.4 : 1.2
        const opacidad = f >= 0.99 ? 1 : f >= 0.45 ? 0.9 : 0.8
        const color = apoyo ? APOYO : entre ? 'rgb(var(--muted-foreground))' : 'rgb(var(--brand))'
        return {
          ...e,
          type: 'curva',
          data: {
            puntos: curvas.find((c) => c.a === e.source && c.b === e.target)?.puntos ?? [],
            editable,
            onPuntos: (p: { x: number; y: number }[]) => ponerPuntos(e.source, e.target, p),
          } satisfies DatosFlecha,
          ariaLabel: `Flecha de ${nombreDe(e.source)} a ${nombreDe(e.target)}`,
          // Punta chica: a 20 px pesaba más que la línea y tapaba el borde de la tarjeta.
          markerEnd: { type: MarkerType.ArrowClosed, width: 7, height: 6, color },
          ...(apoyo
            ? {
                label: servicios.has(e.source) ? 'abastece' : 'recibe',
                labelStyle: { fill: APOYO, fontSize: 11, fontWeight: 600 },
                labelBgStyle: { fill: 'rgb(var(--card))' },
                labelBgPadding: [4, 2] as [number, number],
                labelBgBorderRadius: 6,
              }
            : {}),
          // `non-scaling-stroke`: el trazo mantiene su grosor en pantalla aunque el lienzo se
          // aleje (a 32 % una línea de 2,5 px se veía de 0,8 px).
          style: apoyo
            ? { stroke: color, strokeWidth: 2, strokeDasharray: '2 6', strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' }
            : entre
              ? { stroke: color, strokeWidth: 2, strokeDasharray: '6 5', vectorEffect: 'non-scaling-stroke' }
              : { stroke: color, strokeWidth: grosor, strokeOpacity: opacidad, vectorEffect: 'non-scaling-stroke' },
        }
      }),
    [edges, servicios, nombreDe, flujoDeFlecha, curvas, editable, ponerPuntos],
  )

  const sucio = !cargando && JSON.stringify(grafo) !== guardado
  const enLienzo = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])
  const seleccionados = nodes.filter((n) => n.selected && n.type !== 'zona' && !esEntrada(n.id))
  const seleccionado = seleccionados.length === 1 ? seleccionados[0] : undefined
  const grupoActivo = grupos.find((g) => g.id === grupoSel)
  const flechaSeleccionada = !seleccionado ? edges.find((e) => e.selected) : undefined

  // ── Deshacer / rehacer ──
  const registrar = useCallback(() => {
    pilaDeshacer.current = [...pilaDeshacer.current.slice(-99), actual.current]
    pilaRehacer.current = []
    setVersionPilas((v) => v + 1)
  }, [])
  const deshacer = useCallback(() => {
    const previa = pilaDeshacer.current.pop()
    if (!previa) return
    pilaRehacer.current.push(actual.current)
    setNodes(previa.nodes)
    setEdges(previa.edges)
    setLineas(previa.lineas)
    setVersionPilas((v) => v + 1)
  }, [])
  const rehacer = useCallback(() => {
    const siguiente = pilaRehacer.current.pop()
    if (!siguiente) return
    pilaDeshacer.current.push(actual.current)
    setNodes(siguiente.nodes)
    setEdges(siguiente.edges)
    setLineas(siguiente.lineas)
    setVersionPilas((v) => v + 1)
  }, [])
  useEffect(() => {
    if (!editable) return
    const tecla = (ev: KeyboardEvent) => {
      if (escribiendo(ev.target) || !(ev.ctrlKey || ev.metaKey)) return
      const k = ev.key.toLowerCase()
      if (k === 'z' && !ev.shiftKey) {
        ev.preventDefault()
        deshacer()
      } else if ((k === 'z' && ev.shiftKey) || k === 'y') {
        ev.preventDefault()
        rehacer()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [editable, deshacer, rehacer])

  // Salir con cambios sin guardar: se pregunta (HIG: mejor un paso extra que perder el trabajo en silencio).
  useEffect(() => {
    if (!sucio) return
    const aviso = (ev: BeforeUnloadEvent) => {
      ev.preventDefault()
      ev.returnValue = ''
    }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [sucio])
  // Pantalla completa: el editor tapa la app (capa fija) y, si el navegador lo permite, se
  // pide pantalla completa del DOCUMENTO — no del contenedor: los avisos con «Deshacer»
  // viven en un portal del body y quedarían ocultos. Esc sale y se sincroniza.
  const alternarAmplio = useCallback(() => {
    if (amplio) {
      setAmplio(false)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      return
    }
    setAmplio(true)
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
  }, [amplio])
  useEffect(() => {
    const cambio = () => {
      if (!document.fullscreenElement) setAmplio(false)
    }
    document.addEventListener('fullscreenchange', cambio)
    return () => document.removeEventListener('fullscreenchange', cambio)
  }, [])
  useEffect(() => {
    if (!amplio) return
    // Al cambiar de tamaño, que el lienzo reencuadre lo que se estaba viendo.
    const t = window.setTimeout(() => void fitView({ padding: 0.06, nodes: [{ id: 'zona:acopio' }, { id: 'zona:eviscerado' }], duration: 250 }), 120)
    return () => window.clearTimeout(t)
  }, [amplio, fitView])

  const volver = () => {
    if (sucio && !window.confirm('Hay cambios sin guardar en las líneas. ¿Salir igual y perderlos?')) return
    navigate('/admin')
  }

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes((ns) => applyNodeChanges(c, ns)), [])
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((es) => applyEdgeChanges(c, es)), [])
  const onConnect = useCallback(
    (c: Connection) => {
      registrar()
      // Sin ids de punto: las flechas se guardan solo como origen → destino.
      setEdges((es) => addEdge({ source: c.source, target: c.target, sourceHandle: null, targetHandle: null, id: `${c.source}->${c.target}` }, es))
    },
    [registrar],
  )
  // Unir tocando: primer toque = origen, segundo = destino.
  const tocarParaUnir = useCallback(
    (id: string) => {
      if (!origenUnir) {
        setOrigenUnir(id)
        return
      }
      if (id === origenUnir) {
        setOrigenUnir(null)
        return
      }
      if (edges.some((e) => e.source === origenUnir && e.target === id)) {
        toast({ title: `${nombreDe(origenUnir)} y ${nombreDe(id)} ya estaban unidos` })
        return
      }
      registrar()
      setEdges((es) => addEdge({ source: origenUnir, target: id, id: `${origenUnir}->${id}` }, es))
      // Encadenar: el destino queda listo para ser el origen del siguiente tramo.
      setOrigenUnir(id)
    },
    [origenUnir, edges, registrar, toast, nombreDe],
  )
  useEffect(() => {
    if (!modoGrupo) return
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setModoGrupo(null)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [modoGrupo])
  useEffect(() => {
    if (!modoUnir) return
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      if (origenUnir) setOrigenUnir(null)
      else setModoUnir(false)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [modoUnir, origenUnir])

  // Si la unión se rechaza, hay que DECIRLO: rechazar en silencio se siente como «no funciona»
  // (Orel, 19-09-2026: las dos bombas que intentaba unir ya estaban unidas al ducto).
  const alTerminarUnion = useCallback(
    (_ev: MouseEvent | TouchEvent, estado: FinalConnectionState) => {
      const de = estado.fromNode?.id
      const a = estado.toNode?.id
      if (estado.isValid || !de || !a) return
      if (de === a) return
      if (edges.some((e) => e.source === de && e.target === a)) toast({ title: `${nombreDe(de)} y ${nombreDe(a)} ya estaban unidos` })
      else if (edges.some((e) => e.source === a && e.target === de)) toast({ title: `Ya hay una flecha al revés: ${nombreDe(a)} → ${nombreDe(de)}` })
    },
    [edges, toast, nombreDe],
  )

  // La flecha de vuelta que arma el círculo (A → B y B → A), para poder nombrarla.
  const vueltaDe = useCallback(
    (id: string) => {
      const e = edges.find((x) => x.target === id && edges.some((y) => y.source === id && y.target === x.source))
      return e ? `${nombreDe(e.source)} → ${nombreDe(e.target)}` : undefined
    },
    [edges, nombreDe],
  )

  // Grupos en paralelo a mano: crear desde la selección, sacar miembros, deshacer.
  const agruparEnParalelo = useCallback(
    (miembros: string[]) => {
      if (miembros.length < 2) return
      const id = `g${Date.now().toString(36)}`
      // Un equipo pertenece a un solo grupo: sale de los anteriores.
      setGrupos((gs) => [...gs.map((g) => ({ ...g, miembros: g.miembros.filter((m) => !miembros.includes(m)) })).filter((g) => g.miembros.length > 1), { id, miembros }])
      setNodes((ns) => ns.map((n) => ({ ...n, selected: false })))
      setGrupoSel(id)
      toast({ title: `Grupo en paralelo de ${miembros.length} equipos` })
    },
    [toast],
  )
  const quitarDelGrupo = useCallback((id: string, miembro: string) => {
    setGrupos((gs) => gs.map((g) => (g.id === id ? { ...g, miembros: g.miembros.filter((m) => m !== miembro) } : g)).filter((g) => g.miembros.length > 1))
  }, [])
  const deshacerGrupo = useCallback((id: string) => {
    setGrupos((gs) => gs.filter((g) => g.id !== id))
    setGrupoSel(null)
  }, [])

  const esValida = useCallback((c: Connection | Edge) => c.source !== c.target && !edges.some((e) => e.source === c.source && e.target === c.target), [edges])

  const avisoQuitado = useCallback(
    (texto: string) =>
      toast({
        title: texto,
        action: (
          <ToastAction altText="Deshacer" onClick={deshacer}>
            Deshacer
          </ToastAction>
        ),
      }),
    [toast, deshacer],
  )
  const onDelete = useCallback(
    ({ nodes: ns, edges: es }: { nodes: Node[]; edges: Edge[] }) => {
      const quitados = ns.filter((n) => n.type !== 'zona')
      if (quitados.length === 1) avisoQuitado(`Se quitó ${nombreDe(quitados[0]!.id)}`)
      else if (quitados.length > 1) avisoQuitado(`Se quitaron ${quitados.length} equipos`)
      else if (es.length === 1) avisoQuitado(`Se quitó la flecha ${nombreDe(es[0]!.source)} → ${nombreDe(es[0]!.target)}`)
      else if (es.length > 1) avisoQuitado(`Se quitaron ${es.length} flechas`)
    },
    [avisoQuitado, nombreDe],
  )

  // Contenedor bajo un punto (el más chico, si se solapan), sin contar uno. Se resalta solo
  // mientras se arrastra encima (HIG «Drag and drop»).
  const zonaEn = useCallback(
    (x: number, y: number, excluir?: string) => {
      let mejor: { l: LineaProceso; area: number } | undefined
      for (const l of lineas) {
        if (l.id === excluir) continue
        const z = limites.get(l.id) ?? l.zona
        if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h && (!mejor || z.w * z.h < mejor.area)) mejor = { l, area: z.w * z.h }
      }
      return mejor?.l
    },
    [lineas, limites],
  )
  const alArrastrarEncima = (ev: DragEvent) => {
    ev.preventDefault()
    const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
    const z = zonaEn(p.x, p.y)
    setZonaResaltada(z ? `zona:${z.id}` : null)
  }

  // Entrar a un contenedor se confirma (Orel: «solicitar el ingreso o salida… cada vez»).
  const agregar = (id: string, x: number, y: number, datos: DatosBase = {}) => {
    if (enLienzo.has(id)) return
    const poner = (zona: string) => {
      registrar()
      setNodes((ns) => [...ns, { id, type: 'maquina', position: { x: x - NODO.ancho / 2, y: y - NODO.alto / 2 }, data: { ...datos, zona } satisfies DatosBase }])
    }
    const z = zonaEn(x, y)
    if (!z) {
      poner('')
      return
    }
    setPedido({
      titulo: `¿Agregar ${datos.nombre ?? nombreDe(id)} a ${z.nombre}?`,
      detalle: 'Pasa a ser parte de ese contenedor: si lo mueves, el contenedor crece con él.',
      confirmar: 'Agregar',
      hacer: () => poner(z.id),
    })
  }
  const alSoltar = (ev: DragEvent) => {
    ev.preventDefault()
    setZonaResaltada(null)
    const id = ev.dataTransfer.getData(MIME)
    if (!id) return
    const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
    agregar(id, p.x, p.y)
  }
  const centroVista = () => {
    const r = lienzo.current?.getBoundingClientRect()
    return r ? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 }
  }
  const alTocar = (id: string) => {
    const p = centroVista()
    agregar(id, p.x, p.y)
  }
  // La pertenencia se lee SIEMPRE del estado: los nodos de React Flow traen los datos de la vista.
  const contenedorDeNodo = (n: Node) => {
    const d = (nodes.find((x) => x.id === n.id)?.data ?? {}) as DatosBase
    return zonaDeNodo(lineas, { id: n.id, x: n.position.x, y: n.position.y, zona: d.zona })
  }

  // Mover la caja entera: el contenedor y TODO lo que le pertenece se desplazan juntos, a
  // pasos de la grilla. Deshacer lo devuelve de una vez (se registra al primer movimiento).
  moverZona.current = (zonaId: string, ev: ReactPointerEvent) => {
    if (!editable || ev.button !== 0) return
    ev.stopPropagation()
    ev.preventDefault()
    const lineaId = zonaId.slice('zona:'.length)
    const inicio = new Map<string, { x: number; y: number }>()
    for (const n of nodes) if (n.id === zonaId || (n.type !== 'zona' && contenedorDeNodo(n) === lineaId)) inicio.set(n.id, n.position)
    const zoom = getZoom()
    const x0 = ev.clientX
    const y0 = ev.clientY
    let movido = false
    const mover = (e: PointerEvent) => {
      const dx = Math.round((e.clientX - x0) / zoom / GRILLA[0]) * GRILLA[0]
      const dy = Math.round((e.clientY - y0) / zoom / GRILLA[1]) * GRILLA[1]
      if (!movido && !dx && !dy) return
      if (!movido) registrar()
      movido = true
      setNodes((ns) => ns.map((n) => {
        const p = inicio.get(n.id)
        return p ? { ...n, position: { x: p.x + dx, y: p.y + dy } } : n
      }))
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
      // Tocar el título sin arrastrarlo = elegir el contenedor (abre su ficha).
      if (!movido) {
        setNodes((ns) => ns.map((x) => ({ ...x, selected: false })))
        setEdges((es) => es.map((x) => ({ ...x, selected: false })))
        setGrupoSel(null)
        setZonaSel(lineaId)
      }
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
  }

  // Al soltar sobre OTRO contenedor: ¿salir de uno y entrar al otro? Cancelar lo devuelve.
  const alSoltarNodos = (movidos: Node[]) => {
    setZonaResaltada(null)
    const candidatos = movidos.filter((m) => m.type !== 'zona' && !esEntrada(m.id))
    const primero = candidatos[0]
    if (!primero) return
    const origen = contenedorDeNodo(primero)
    const destino = zonaEn(primero.position.x + NODO.ancho / 2, primero.position.y + NODO.alto / 2, origen)
    if (!destino) return
    const ids = new Set(candidatos.map((m) => m.id))
    const quien = ids.size === 1 ? nombreDe(primero.id) : `${ids.size} equipos`
    setPedido({
      titulo: `¿Mover ${quien} ${origen ? `de ${nombreLinea.get(origen) ?? origen} ` : ''}a ${destino.nombre}?`,
      detalle: origen ? `Sale de ${nombreLinea.get(origen) ?? origen} y entra a ${destino.nombre}.` : `Entra a ${destino.nombre}.`,
      confirmar: 'Mover',
      hacer: () => setNodes((ns) => ns.map((x) => (ids.has(x.id) ? { ...x, data: { ...(x.data as DatosBase), zona: destino.id } } : x))),
      cancelar: () => deshacer(),
    })
  }

  // Cambiar de contenedor desde el inspector: el equipo se lleva adentro del nuevo, o afuera del actual.
  const cambiarContenedor = (n: Node, destino: string) => {
    const origen = contenedorDeNodo(n)
    if ((origen ?? '') === destino) return
    // Al sacarlo queda ARRIBA de todos los contenedores (al costado caería encima del vecino).
    const lim = destino ? limites.get(destino) : undefined
    const techo = Math.min(...[...limites.values()].map((z) => z.y))
    const pos = lim ? { x: lim.x + 24, y: lim.y + lim.h } : destino ? n.position : { x: n.position.x, y: techo - NODO.alto - 32 }
    setPedido({
      titulo: destino
        ? `¿Mover ${nombreDe(n.id)} a ${nombreLinea.get(destino) ?? destino}?`
        : `¿Sacar ${nombreDe(n.id)} de ${nombreLinea.get(origen ?? '') ?? 'su contenedor'}?`,
      detalle: destino ? 'Queda dentro del nuevo contenedor; revisa sus flechas.' : 'Queda fuera de todo contenedor, al costado.',
      confirmar: destino ? 'Mover' : 'Sacar',
      hacer: () => {
        registrar()
        setNodes((ns) => ns.map((x) => (x.id === n.id ? { ...x, position: pos, data: { ...(x.data as DatosBase), zona: destino } } : x)))
      },
    })
  }


  // --- Contenedores: crearlos, renombrarlos y borrarlos desde el editor (Orel, 19-09-2026:
  // «aún no tenemos total autonomía para crear las líneas, editarlas y eliminar lo que estorbe»).
  // El contenedor vive en DOS lados: `lineas` (nombre, tipo, caja) y su nodo `zona:<id>` del
  // lienzo (lo que se dibuja). Todo cambio toca los dos, o el lienzo queda mintiendo.
  const lineaSel = useMemo(() => lineas.find((l) => l.id === zonaSel), [lineas, zonaSel])
  useEffect(() => {
    renombrando.current = null
  }, [zonaSel])
  const equiposDeZona = (id: string) => nodes.filter((n) => n.type !== 'zona' && !esEntrada(n.id) && contenedorDeNodo(n) === id)

  const nodoZona = (l: LineaProceso): Node => ({
    id: `zona:${l.id}`,
    type: 'zona',
    position: { x: l.zona.x, y: l.zona.y },
    data: { nombre: l.nombre, w: l.zona.w, h: l.zona.h, apoyo: l.tipo === 'apoyo', resaltada: false },
    draggable: false,
    selectable: false,
    deletable: false,
    focusable: false,
    zIndex: -2,
  })

  const crearLinea = () => {
    const nombre = nuevaLinea?.nombre.trim().replace(/\s+/g, ' ')
    if (!nuevaLinea || !nombre) return
    const id = idDeContenedor(nombre, lineas.map((l) => l.id))
    const zona = cajaNueva(limites.values())
    const l: LineaProceso = { id, nombre, ...(nuevaLinea.tipo === 'apoyo' ? { tipo: 'apoyo' as const } : {}), zona }
    registrar()
    setLineas((ls) => [...ls, l])
    setNodes((ns) => [
      nodoZona(l),
      ...ns,
      ...(nuevaLinea.tipo === 'apoyo'
        ? []
        : [
            {
              id: PREFIJO_ENTRADA + id,
              type: 'entrada',
              position: { x: zona.x + 24, y: Math.round(zona.y + zona.h / 2 - ENTRADA.alto / 2) },
              data: {} as DatosBase,
              deletable: false,
            },
          ]),
    ])
    setNuevaLinea(null)
    setZonaSel(id)
    toast({
      title: `${nombre} creada`,
      description:
        nuevaLinea.tipo === 'apoyo'
          ? 'Arrastra adentro los equipos que abastecen a las líneas.'
          : 'Arrastra adentro sus equipos y únelos desde la entrada.',
    })
  }

  /** Cambia el contenedor en `lineas` y en su nodo del lienzo, que es lo que se ve. */
  const editarLinea = (id: string, cambios: { nombre?: string; tipo?: 'linea' | 'apoyo' }) => {
    setLineas((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l
        const sig: LineaProceso = { ...l, ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}) }
        if (cambios.tipo === 'apoyo') sig.tipo = 'apoyo'
        else if (cambios.tipo === 'linea') delete sig.tipo
        return sig
      }),
    )
    setNodes((ns) =>
      ns.map((n) =>
        n.id === `zona:${id}`
          ? {
              ...n,
              data: {
                ...(n.data as DatosZona),
                ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
                ...(cambios.tipo !== undefined ? { apoyo: cambios.tipo === 'apoyo' } : {}),
              },
            }
          : n,
      ),
    )
  }

  // Línea ↔ servicio de apoyo: lo que cambia de verdad es la ENTRADA. Un servicio no tiene
  // entrada (no reparte flujo), así que pasar a apoyo la quita y volver a línea la repone.
  const cambiarTipoLinea = (l: LineaProceso, tipo: 'linea' | 'apoyo') => {
    if ((l.tipo ?? 'linea') === tipo) return
    const entrada = PREFIJO_ENTRADA + l.id
    setPedido({
      titulo: tipo === 'apoyo' ? `¿${l.nombre} pasa a servicio de apoyo?` : `¿${l.nombre} pasa a línea de proceso?`,
      detalle:
        tipo === 'apoyo'
          ? 'Se quita su entrada y sus equipos dejan de tener % de parada: sus flechas pasan a ser «abastece a» / «recibe de».'
          : 'Se le pone una entrada al 100 %. Únela con el primer equipo para que el flujo se reparta.',
      confirmar: 'Cambiar',
      hacer: () => {
        registrar()
        editarLinea(l.id, { tipo })
        if (tipo === 'apoyo') {
          setNodes((ns) => ns.filter((n) => n.id !== entrada))
          setEdges((es) => es.filter((e) => e.source !== entrada && e.target !== entrada))
        } else {
          const z = limites.get(l.id) ?? l.zona
          setNodes((ns) =>
            ns.some((n) => n.id === entrada)
              ? ns
              : [
                  ...ns,
                  {
                    id: entrada,
                    type: 'entrada',
                    position: { x: z.x + 24, y: Math.round(z.y + z.h / 2 - ENTRADA.alto / 2) },
                    data: {} as DatosBase,
                    deletable: false,
                  },
                ],
          )
        }
      },
    })
  }

  /** Deja los equipos del contenedor afuera, en filas arriba de su caja (no los borra). */
  const sacarEquipos = (l: LineaProceso) => {
    const dentro = equiposDeZona(l.id)
    if (!dentro.length) return
    const z = limites.get(l.id) ?? l.zona
    const porFila = 6
    const filas = Math.ceil(dentro.length / porFila)
    const pos = new Map(
      dentro.map((n, i) => [
        n.id,
        {
          x: Math.round(z.x + (i % porFila) * (NODO.ancho + 24)),
          y: Math.round(z.y - 48 - (filas - Math.floor(i / porFila)) * (NODO.alto + 24)),
        },
      ]),
    )
    setPedido({
      titulo: `¿Sacar ${dentro.length === 1 ? 'el equipo' : `los ${dentro.length} equipos`} de ${l.nombre}?`,
      detalle: 'Quedan en el lienzo, arriba del contenedor, sin pertenecer a ninguno. Sus flechas no se tocan.',
      confirmar: 'Sacar',
      hacer: () => {
        registrar()
        setNodes((ns) => ns.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)!, data: { ...(n.data as DatosBase), zona: '' } } : n)))
      },
    })
  }

  const borrarLinea = (l: LineaProceso, conEquipos: boolean) => {
    const dentro = equiposDeZona(l.id).map((n) => n.id)
    const fuera = new Set(conEquipos ? [...dentro, PREFIJO_ENTRADA + l.id] : [PREFIJO_ENTRADA + l.id])
    registrar()
    setLineas((ls) => ls.filter((x) => x.id !== l.id))
    setNodes((ns) =>
      ns
        .filter((n) => n.id !== `zona:${l.id}` && !fuera.has(n.id))
        .map((n) => ((n.data as DatosBase).zona === l.id ? { ...n, data: { ...(n.data as DatosBase), zona: '' } } : n)),
    )
    setEdges((es) => es.filter((e) => !fuera.has(e.source) && !fuera.has(e.target)))
    setGrupos((gs) => gs.map((g) => ({ ...g, miembros: g.miembros.filter((m) => !fuera.has(m)) })).filter((g) => g.miembros.length > 1))
    setZonaSel(null)
    avisoQuitado(conEquipos && dentro.length ? `Se eliminó ${l.nombre} con sus ${dentro.length} equipos` : `Se eliminó ${l.nombre}`)
  }

  const pedirBorrarLinea = (l: LineaProceso) => {
    const dentro = equiposDeZona(l.id).length
    if (!dentro) {
      setPedido({
        titulo: `¿Eliminar ${l.nombre}?`,
        detalle: 'Está vacía. Se borra el contenedor y su entrada.',
        confirmar: 'Eliminar',
        destructivo: true,
        hacer: () => borrarLinea(l, false),
      })
      return
    }
    setPedido({
      titulo: `¿Eliminar ${l.nombre}?`,
      detalle: `Tiene ${dentro} ${dentro === 1 ? 'equipo' : 'equipos'} y su entrada. Elige qué pasa con ellos.`,
      // Rojo lleno solo para lo que borra equipos: el emparejado «Solo el contenedor» es el
      // camino seguro y va como primario normal (HIG «Alerts»: el rojo marca lo irreversible).
      confirmar: 'Solo el contenedor',
      hacer: () => borrarLinea(l, false),
      alterno: { texto: dentro === 1 ? 'Con su equipo' : `Con sus ${dentro} equipos`, hacer: () => borrarLinea(l, true) },
    })
  }

  // Elemento manual: algo que no está en el árbol, creado aquí (Orel, 19-09-2026).
  const crearManual = () => {
    if (!manual?.nombre.trim()) return
    const id = `${PREFIJO_MANUAL}${Date.now().toString(36)}`
    const lim = manual.zona ? limites.get(manual.zona) : undefined
    // Debajo de lo que ya tiene: el contenedor crece para recibirlo, sin encimarlo.
    const p = lim ? { x: lim.x + 24 + NODO.ancho / 2, y: lim.y + lim.h + NODO.alto / 2 } : centroVista()
    registrar()
    setNodes((ns) => [
      ...ns,
      { id, type: 'maquina', position: { x: p.x - NODO.ancho / 2, y: p.y - NODO.alto / 2 }, data: { zona: manual.zona, nombre: manual.nombre.trim().replace(/\s+/g, ' ') } satisfies DatosBase },
    ])
    setManual(null)
  }

  // Desplegar: los componentes directos del equipo quedan debajo, sin unir, para armarlos.
  const desplegar = (n: Node) => {
    const hijos = (indice.get(n.id)?.hijos ?? []).filter((h) => !enLienzo.has(h.id))
    if (!hijos.length) return
    registrar()
    setNodes((ns) => [
      ...ns.map((x) => ({ ...x, selected: false })),
      ...hijos.map((h, i) => ({
        id: h.id,
        type: 'maquina',
        position: { x: n.position.x + (i % 3) * (NODO.ancho + 16), y: n.position.y + NODO.alto + 40 + Math.floor(i / 3) * (NODO.alto + 24) },
        data: { zona: contenedorDeNodo(n) ?? '' } satisfies DatosBase,
        selected: true,
      })),
    ])
    toast({ title: hijos.length === 1 ? '1 componente agregado' : `${hijos.length} componentes agregados`, description: hijos.length === 1 ? 'Únelo con una flecha en el orden del flujo.' : 'Únelos con flechas en el orden del flujo.' })
  }
  const quitarSeleccion = () => {
    if (seleccionado && !esEntrada(seleccionado.id)) {
      registrar()
      setNodes((ns) => ns.filter((x) => x.id !== seleccionado.id))
      setEdges((es) => es.filter((e) => e.source !== seleccionado.id && e.target !== seleccionado.id))
      avisoQuitado(`Se quitó ${nombreDe(seleccionado.id)}`)
    } else if (flechaSeleccionada) {
      registrar()
      setEdges((es) => es.filter((e) => e.id !== flechaSeleccionada.id))
      avisoQuitado(`Se quitó la flecha ${nombreDe(flechaSeleccionada.source)} → ${nombreDe(flechaSeleccionada.target)}`)
    }
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const conLimites = lineas.map((l) => ({ ...l, zona: limites.get(l.id) ?? l.zona }))
      const g = { ...grafo, lineas: conLimites }
      await guardarLineas(PLANTA, g, usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() : 'Admin')
      setLineas(conLimites)
      // Los nodos de contenedor quedan en la esquina guardada (alGrafo la lee de ahí).
      setNodes((ns) =>
        ns.map((n) => {
          const z = n.type === 'zona' ? conLimites.find((l) => `zona:${l.id}` === n.id)?.zona : undefined
          return z ? { ...n, position: { x: z.x, y: z.y } } : n
        }),
      )
      setGuardado(JSON.stringify(g))
      setMeta(`Guardado por ${usuario?.nombre ?? 'admin'} · recién`)
    } catch {
      toast({ title: 'No se pudo guardar', description: 'Revisa la conexión o tus permisos de administrador.', variant: 'destructive' })
    } finally {
      setGuardando(false)
    }
  }

  const resumen = useMemo(
    () =>
      lineas
        .filter((l) => l.tipo !== 'apoyo')
        .map((l) => {
          const miembros = [...pesos.entries()].filter(([, p]) => p.lineaId === l.id)
          return { l, maquinas: miembros.length, serie: miembros.filter(([, p]) => Math.abs(p.peso - 1) < 1e-9).length }
        }),
    [lineas, pesos],
  )

  const inspector = editable && (seleccionado || flechaSeleccionada || seleccionados.length > 1 || grupoActivo || lineaSel)

  return (
    <div className={amplio ? 'fixed inset-0 z-[60] flex h-dvh flex-col bg-background' : 'flex h-[calc(100dvh-4rem)] min-h-[520px] flex-col md:h-[calc(100dvh-1rem)]'}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={volver}
          className="-ml-2 flex min-h-[44px] items-center gap-1 rounded-ctl px-2 text-body text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeft className="size-5" aria-hidden /> Admin
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-title3">Líneas de proceso · Chonchi</h1>
          <p className="text-footnote text-muted-foreground" role="status">
            {cargando ? 'Cargando…' : sucio ? <span className="font-semibold text-ink-warn">Cambios sin guardar</span> : meta}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setVerApoyo((v) => !v)}
              aria-pressed={verApoyo}
              title={verApoyo ? 'Esconder los servicios de apoyo' : 'Mostrar los servicios de apoyo'}
              className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-footnote font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4 ${
                verApoyo ? 'text-primary hover:bg-muted-foreground/10' : 'bg-muted-foreground/15 text-muted-foreground'
              }`}
            >
              <Droplets aria-hidden />
              {verApoyo ? 'Servicios' : 'Servicios ocultos'}
            </button>
            <button
              type="button"
              onClick={() => {
                setModoGrupo((v) => (v ? null : []))
                setModoUnir(false)
                setOrigenUnir(null)
              }}
              aria-pressed={!!modoGrupo}
              title="Marcar equipos que trabajan en paralelo"
              className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-footnote font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4 ${
                modoGrupo ? 'bg-primary text-primary-foreground' : 'text-primary hover:bg-muted-foreground/10'
              }`}
            >
              <Boxes aria-hidden />
              {modoGrupo ? 'Salir de agrupar' : 'Agrupar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setModoUnir((v) => !v)
                setModoGrupo(null)
                setOrigenUnir(null)
              }}
              aria-pressed={modoUnir}
              title="Unir equipos tocando uno y después el otro"
              className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-footnote font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4 ${
                modoUnir ? 'bg-primary text-primary-foreground' : 'text-primary hover:bg-muted-foreground/10'
              }`}
            >
              <Spline aria-hidden />
              {modoUnir ? 'Salir de unir' : 'Unir'}
            </button>
            <button
              type="button"
              onClick={() => setNuevaLinea({ nombre: '', tipo: 'linea' })}
              title="Crear una línea de proceso o una zona de servicios"
              className="flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-footnote font-semibold text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4"
            >
              <Plus aria-hidden />
              Nueva línea
            </button>
            <button
              type="button"
              onClick={() => setConLista((v) => !v)}
              aria-pressed={conLista}
              aria-label={conLista ? 'Ocultar la lista de equipos' : 'Mostrar la lista de equipos'}
              title={conLista ? 'Ocultar la lista de equipos' : 'Mostrar la lista de equipos'}
              className="flex size-11 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-5"
            >
              {conLista ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
            </button>
            <button
              type="button"
              onClick={alternarAmplio}
              aria-pressed={amplio}
              title={amplio ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
              className="flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-footnote font-semibold text-primary hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-4"
            >
              {amplio ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
              {amplio ? 'Salir de pantalla completa' : 'Pantalla completa'}
            </button>
            <button type="button" className="flex size-11 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-5" onClick={deshacer} disabled={!pilaDeshacer.current.length} aria-label="Deshacer (Ctrl+Z)" title="Deshacer (Ctrl+Z)">
              <Undo2 aria-hidden />
            </button>
            <button type="button" className="flex size-11 items-center justify-center rounded-full text-primary hover:bg-muted-foreground/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-5" onClick={rehacer} disabled={!pilaRehacer.current.length} aria-label="Rehacer (Ctrl+Mayús+Z)" title="Rehacer (Ctrl+Mayús+Z)">
              <Redo2 aria-hidden />
            </button>
            <Button
              variant="tinted"
              onClick={() => {
                registrar()
                cargarGrafo(propuesta())
              }}
              disabled={cargando || guardando}
            >
              <RotateCcw /> Volver a la propuesta
            </Button>
            <Button onClick={() => void guardar()} disabled={!sucio || guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : null} Guardar
            </Button>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {editable && conLista && (
          <aside aria-label="Jerarquía de equipos" className="flex w-[300px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-card p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Equipo, área o código"
                aria-label="Buscar en la jerarquía"
                className="h-[44px] w-full rounded-ctl bg-muted-foreground/10 pl-9 pr-3 text-campo outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <Button variant="tinted" onClick={() => setManual({ nombre: '', zona: '' })}>
              <Plus /> Elemento manual
            </Button>
            <p className="text-caption text-muted-foreground">
              Toda la jerarquía, con o sin código. Arrastra al lienzo (o toca). Para unir dos equipos, usa «Unir equipos» arriba: tocas uno y después el que sigue. Mayús + arrastre selecciona varios. Supr quita · Ctrl+Z deshace.
            </p>
            {consulta.trim() ? (
              <ul className="flex flex-col" aria-label="Resultados">
                {[...indice.entries()]
                  .filter(([, e]) => {
                    const t = consulta.trim().toLowerCase()
                    return e.nombre.toLowerCase().includes(t) || e.codigo.toLowerCase().includes(t)
                  })
                  .slice(0, 80)
                  .map(([id, e]) => (
                    <li key={id}>
                      <FilaEquipo id={id} nombre={e.nombre} codigo={e.codigo} area={e.area} ruta={e.ruta.join(' › ')} puesto={enLienzo.has(id)} otraPlanta={deOtraPlanta.get(id)} onTocar={alTocar} onDragEnd={() => setZonaResaltada(null)} />
                    </li>
                  ))}
              </ul>
            ) : (
              <ul className="flex flex-col" aria-label="Jerarquía">
                {(raiz?.children ?? []).map((h) => (
                  <RamaArbol
                    key={h.id}
                    id={h.id}
                    nivel={0}
                    indice={indice}
                    abiertos={abiertos}
                    onAlternar={(id) =>
                      setAbiertos((a) => {
                        const b = new Set(a)
                        if (b.has(id)) b.delete(id)
                        else b.add(id)
                        return b
                      })
                    }
                    enLienzo={enLienzo}
                    deOtraPlanta={deOtraPlanta}
                    onTocar={alTocar}
                    onDragEnd={() => setZonaResaltada(null)}
                  />
                ))}
              </ul>
            )}
          </aside>
        )}

        <div
          ref={lienzo}
          className="relative min-w-0 flex-1"
          onDragOver={alArrastrarEncima}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setZonaResaltada(null)
          }}
          onDrop={alSoltar}
        >
          {cargando ? (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> Cargando el árbol de equipos…
            </div>
          ) : (
            <ReactFlow
              nodes={conParalelos}
              edges={verApoyo ? vistaAristas : vistaAristas.filter((e) => !servicios.has(e.source) && !servicios.has(e.target))}
              nodeTypes={TIPOS}
              edgeTypes={TIPOS_FLECHA}
              onNodesChange={editable ? onNodesChange : undefined}
              onEdgesChange={editable ? onEdgesChange : undefined}
              onConnect={editable ? onConnect : undefined}
              onConnectEnd={editable ? alTerminarUnion : undefined}
              onBeforeDelete={async () => {
                registrar()
                return true
              }}
              onDelete={onDelete}
              onNodeClick={(_, n) => {
                setZonaSel(null)
                if (modoGrupo && n.type !== 'zona' && n.type !== 'paralelo' && !esEntrada(n.id)) {
                  setModoGrupo((ids) => (ids ?? []).includes(n.id) ? (ids ?? []).filter((x) => x !== n.id) : [...(ids ?? []), n.id])
                  return
                }
                if (n.type === 'paralelo') {
                  setGrupoSel(n.id.startsWith('grupo:') ? n.id.slice('grupo:'.length) : null)
                  return
                }
                if (modoUnir && n.type !== 'zona') tocarParaUnir(n.id)
              }}
              onPaneClick={() => {
                setZonaSel(null)
                if (modoUnir) setOrigenUnir(null)
              }}
              onNodeDragStart={() => registrar()}
              onNodeDrag={(_, n) => {
                const z = esEntrada(n.id) ? undefined : zonaEn(n.position.x + NODO.ancho / 2, n.position.y + NODO.alto / 2, contenedorDeNodo(n))
                setZonaResaltada(z ? `zona:${z.id}` : null)
              }}
              onNodeDragStop={(_, n, movidos) => alSoltarNodos(movidos.length ? movidos : [n])}
              isValidConnection={esValida}
              nodesDraggable={editable && !modoUnir && !modoGrupo}
              nodesConnectable={editable}
              elementsSelectable={editable}
              deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
              snapToGrid
              snapGrid={GRILLA}
              colorMode={oscuro ? 'dark' : 'light'}
              fitView
              fitViewOptions={{ padding: 0.06, nodes: [{ id: 'zona:acopio' }, { id: 'zona:eviscerado' }] }}
              minZoom={0.15}
              maxZoom={1.6}
              proOptions={{ hideAttribution: true }}
              className="bg-background"
            >
              <Background gap={GRILLA[0]} size={1.1} color="rgb(var(--muted-foreground) / 0.22)" />
              {modoGrupo && (
                <Panel position="top-center" className="!mt-[76px]">
                  <div className="flex min-h-[44px] items-center gap-3 rounded-full bg-primary px-4 text-footnote font-semibold text-primary-foreground shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
                    <Boxes className="size-4" aria-hidden />
                    <span className="whitespace-nowrap">
                      {modoGrupo.length < 2 ? 'Toca los equipos que trabajan en paralelo' : `${modoGrupo.length} equipos elegidos`}
                      <span className="font-normal opacity-80"> · Esc para salir</span>
                    </span>
                    <button
                      type="button"
                      disabled={modoGrupo.length < 2}
                      onClick={() => {
                        agruparEnParalelo(modoGrupo)
                        setModoGrupo(null)
                      }}
                      className="min-h-[36px] rounded-full bg-primary-foreground px-3 text-footnote font-semibold text-primary disabled:opacity-40"
                    >
                      Agrupar
                    </button>
                  </div>
                </Panel>
              )}
              {modoUnir && (
                <Panel position="top-center" className="!mt-[76px]">
                  <p className="flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-footnote font-semibold text-primary-foreground shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
                    <Spline className="size-4" aria-hidden />
                    {origenUnir ? `Desde ${nombreDe(origenUnir)}: toca el equipo que sigue` : 'Toca el equipo donde empieza la flecha'}
                    <span className="font-normal opacity-80">· Esc para {origenUnir ? 'soltarlo' : 'salir'}</span>
                  </p>
                </Panel>
              )}
              <Controls showInteractive={false} showFitView={false} position="bottom-right" />
              <Panel position="bottom-right" className="!mb-[118px] !mr-[15px]">
                <button
                  type="button"
                  onClick={() => void fitView({ padding: 0.05, duration: 300 })}
                  title="Ver la planta completa"
                  className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-card px-3 text-footnote font-semibold text-primary shadow-[0_1px_4px_rgba(0,0,0,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Expand className="size-4" aria-hidden /> Planta completa
                </button>
              </Panel>
              <MiniMap
                pannable
                zoomable
                position="bottom-left"
                bgColor="rgb(var(--card))"
                maskColor="rgb(var(--background) / 0.6)"
                nodeColor={(n) => {
                  if (n.type === 'zona') return (n.data as DatosZona).apoyo ? 'rgb(var(--cat-6-ink) / 0.12)' : 'rgb(var(--muted-foreground) / 0.12)'
                  if (n.type === 'entrada') return 'rgb(var(--brand))'
                  if (n.type === 'servicio') return APOYO
                  // El mapa sigue la misma regla que el lienzo: el tinte de marca es flujo, el gris es fuera de línea.
                  const p = (n.data as DatosMaquina).peso
                  return p ? `rgb(var(--brand) / ${0.45 + 0.55 * p})` : 'rgb(var(--muted-foreground) / 0.5)'
                }}
              />
              <Panel position="top-left" className="!m-3 flex flex-wrap gap-x-4 gap-y-1 rounded-ctl bg-card/90 px-3 py-2 text-caption shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur">
                <span className="flex items-center gap-1.5">
                  <svg width="26" height="8" aria-hidden className="shrink-0">
                    <line x1="0" y1="4" x2="26" y2="4" stroke="rgb(var(--brand))" strokeWidth="2.5" />
                  </svg>
                  <b>100 %</b> en serie: todo el flujo pasa
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="26" height="8" aria-hidden className="shrink-0">
                    <line x1="0" y1="4" x2="26" y2="4" stroke="rgb(var(--brand))" strokeWidth="1.4" strokeOpacity="0.8" />
                  </svg>
                  <b>1/N</b> en paralelo: más fina, menos flujo
                </span>
                <span>
                  <b className="text-muted-foreground">0 %</b> borde punteado: fuera de la línea
                </span>
                <span>
                  <b style={{ color: APOYO }}>indirecto</b> servicio de apoyo
                </span>
                <span className="text-muted-foreground">– – entre líneas</span>
                <span className="rounded-full bg-[rgb(var(--brand)/0.14)] px-2 text-[rgb(var(--brand-ink))]">grupo en paralelo</span>
              </Panel>
              {!inspector && (
                <Panel position="top-right" className="!m-3 hidden rounded-ctl bg-card/90 px-3 py-2 text-caption shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur lg:block">
                  {resumen.map(({ l, maquinas, serie }) => (
                    <p key={l.id} className="tabular-nums">
                      <b>{l.nombre}</b> · {maquinas} {maquinas === 1 ? 'máquina' : 'máquinas'} · {serie} en serie
                    </p>
                  ))}
                  <p className="tabular-nums">
                    <b style={{ color: APOYO }}>Servicios de apoyo</b> · {servicios.size}
                  </p>
                </Panel>
              )}
              {!editable && (
                <Panel position="bottom-center" className="!mb-16 rounded-full bg-card px-4 py-2 text-footnote shadow-[0_1px_4px_rgba(0,0,0,0.12)]">
                  Solo lectura. Para editar, abre esta herramienta en un PC.
                </Panel>
              )}
            </ReactFlow>
          )}
        </div>

        {inspector && (
          <aside aria-label="Inspector" className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-footnote text-muted-foreground">
                {flechaSeleccionada ? 'Flecha seleccionada' : grupoActivo && !seleccionados.length ? 'Grupo en paralelo' : seleccionados.length > 1 ? `${seleccionados.length} equipos seleccionados` : lineaSel && !seleccionado ? 'Contenedor' : 'Seleccionado'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setNodes((ns) => ns.map((x) => ({ ...x, selected: false })))
                  setEdges((es) => es.map((x) => ({ ...x, selected: false })))
                  setGrupoSel(null)
                  setZonaSel(null)
                }}
                aria-label="Cerrar el inspector"
                className="-mr-2 -mt-2 flex size-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" />
              </button>
            </div>
            {seleccionados.length > 1 ? (
              // Varios equipos elegidos: marcarlos como un grupo en paralelo, a mano.
              <div className="flex flex-col gap-3">
                <p className="text-footnote text-muted-foreground">
                  Márcalos como un grupo en paralelo para dejar dicho que se reparten el trabajo. Sirve en cualquier área, aunque el reparto no se deduzca de las flechas.
                </p>
                <ul className="flex flex-col gap-1">
                  {seleccionados.map((n) => (
                    <li key={n.id} className="truncate text-footnote">
                      {nombreDe(n.id)}
                    </li>
                  ))}
                </ul>
                <Button onClick={() => agruparEnParalelo(seleccionados.map((n) => n.id))}>Agrupar en paralelo</Button>
              </div>
            ) : grupoActivo ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-footnote text-muted-foreground">Nombre del grupo</span>
                  <input
                    value={grupoActivo.nombre ?? ''}
                    maxLength={60}
                    placeholder="Paralelo"
                    onChange={(e) => setGrupos((gs) => gs.map((g) => (g.id === grupoActivo.id ? { ...g, nombre: e.target.value.trimStart() } : g)))}
                    className="h-[44px] w-full rounded-ctl bg-muted-foreground/10 px-3 text-campo outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </label>
                <ul className="flex flex-col gap-1">
                  {grupoActivo.miembros.map((m) => (
                    <li key={m} className="flex min-h-[36px] items-center justify-between gap-2">
                      <span className="truncate text-footnote">{nombreDe(m)}</span>
                      <button
                        type="button"
                        onClick={() => quitarDelGrupo(grupoActivo.id, m)}
                        aria-label={`Sacar ${nombreDe(m)} del grupo`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-crit hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button variant="tinted" className="text-ink-crit" onClick={() => deshacerGrupo(grupoActivo.id)}>
                  Deshacer el grupo
                </Button>
              </div>
            ) : seleccionado ? (
              <FichaNodo
                nodo={seleccionado}
                nombre={nombreDe(seleccionado.id)}
                codigo={indice.get(seleccionado.id)?.codigo ?? ''}
                padre={indice.get(seleccionado.id)?.padre}
                hijos={indice.get(seleccionado.id)?.hijos ?? []}
                enLienzo={enLienzo}
                peso={pesos.get(seleccionado.id)}
                vuelta={vueltaDe(seleccionado.id)}
                lineaNombre={(id) => nombreLinea.get(id) ?? id}
                servicio={servicios.has(seleccionado.id) ? relaciones.get(seleccionado.id) : undefined}
                otraPlanta={deOtraPlanta.get(seleccionado.id)}
                manual={esManual(seleccionado.id)}
                contenedor={contenedorDeNodo(seleccionado) ?? ''}
                contenedores={lineas.map((l) => ({ id: l.id, nombre: l.nombre }))}
                onCambiarContenedor={(z) => cambiarContenedor(seleccionado, z)}
                onDesplegar={() => desplegar(seleccionado)}
                onQuitar={quitarSeleccion}
              />
            ) : flechaSeleccionada ? (
              <>
                <h2 className="text-headline">
                  {nombreDe(flechaSeleccionada.source)} → {nombreDe(flechaSeleccionada.target)}
                </h2>
                <p className="text-footnote text-muted-foreground">
                  {servicios.has(flechaSeleccionada.source)
                    ? 'El servicio abastece a la línea: influye, pero no suma % de parada.'
                    : servicios.has(flechaSeleccionada.target)
                      ? 'La línea entrega al servicio (p. ej. vísceras a RILES): influye, pero no suma % de parada.'
                      : esEntrada(flechaSeleccionada.target)
                        ? 'Une dos líneas: lo que sale de una entra a la otra.'
                        : 'Flujo del producto dentro de la línea.'}
                </p>
                <p className="rounded-ctl bg-muted-foreground/10 p-2 text-footnote text-muted-foreground">
                  Para acomodarla: arrastra la línea y se dobla por donde la lleves. Doble clic en un punto para quitarlo.
                </p>
                <Button variant="tinted" className="text-ink-crit" onClick={quitarSeleccion}>
                  Quitar la flecha
                </Button>
              </>
            ) : lineaSel ? (
              <FichaContenedor
                linea={lineaSel}
                equipos={equiposDeZona(lineaSel.id).length}
                entrada={nodes.some((n) => n.id === PREFIJO_ENTRADA + lineaSel.id)}
                onNombre={(v) => {
                  if (renombrando.current !== lineaSel.id) {
                    registrar()
                    renombrando.current = lineaSel.id
                  }
                  editarLinea(lineaSel.id, { nombre: v })
                }}
                onTipo={(t) => cambiarTipoLinea(lineaSel, t)}
                onSacar={() => sacarEquipos(lineaSel)}
                onEliminar={() => pedirBorrarLinea(lineaSel)}
              />
            ) : null}
          </aside>
        )}
      </div>

      {/* Entrar, salir o cambiar de contenedor: siempre se pregunta. Cancelar lo devuelve. */}
      <Sheet
        open={!!pedido}
        onClose={() => {
          pedido?.cancelar?.()
          setPedido(null)
        }}
        title={pedido?.titulo}
        description={pedido?.detalle}
        actions={
          <>
            <Button
              variant="tinted"
              onClick={() => {
                pedido?.cancelar?.()
                setPedido(null)
              }}
            >
              Cancelar
            </Button>
            {pedido?.alterno && (
              <Button
                variant="tinted"
                className="text-ink-crit"
                onClick={() => {
                  pedido.alterno?.hacer()
                  setPedido(null)
                }}
              >
                {pedido.alterno.texto}
              </Button>
            )}
            <Button
              className={pedido?.destructivo ? 'bg-ink-crit text-white' : undefined}
              onClick={() => {
                pedido?.hacer()
                setPedido(null)
              }}
            >
              {pedido?.confirmar}
            </Button>
          </>
        }
      />

      {/* Nueva línea de proceso o zona de servicios: nace vacía, a la derecha de todo. */}
      <Sheet
        open={!!nuevaLinea}
        onClose={() => setNuevaLinea(null)}
        title="Nueva línea"
        description="Un contenedor vacío al final del dibujo. Después le arrastras sus equipos adentro."
        actions={
          <>
            <Button variant="tinted" onClick={() => setNuevaLinea(null)}>
              Cancelar
            </Button>
            <Button onClick={crearLinea} disabled={!nuevaLinea?.nombre.trim()}>
              Crear
            </Button>
          </>
        }
      >
        {nuevaLinea && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-footnote text-muted-foreground">Nombre</span>
              <input
                autoFocus
                value={nuevaLinea.nombre}
                maxLength={60}
                onChange={(e) => setNuevaLinea({ ...nuevaLinea, nombre: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') crearLinea()
                }}
                placeholder="Ej.: Empaque secundario"
                className="h-[44px] w-full rounded-ctl bg-muted-foreground/10 px-3 text-campo outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-footnote text-muted-foreground">Tipo</span>
              <select
                value={nuevaLinea.tipo}
                onChange={(e) => setNuevaLinea({ ...nuevaLinea, tipo: e.target.value as 'linea' | 'apoyo' })}
                className="h-[44px] w-full cursor-pointer rounded-ctl bg-muted-foreground/10 px-3 text-campo outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="linea">Línea de proceso · reparte el flujo</option>
                <option value="apoyo">Servicio de apoyo · influye sin repartir</option>
              </select>
            </label>
            <p className="text-caption text-muted-foreground">
              {nuevaLinea.tipo === 'apoyo'
                ? 'Sus equipos no llevan % de parada: sus flechas dicen «abastece a» o «recibe de».'
                : 'Nace con su entrada al 100 %. Únela con el primer equipo para que el flujo se reparta.'}
            </p>
          </div>
        )}
      </Sheet>

      {/* Elemento manual: lo que no está en el árbol (un estanque, una cinta sin código…). */}
      <Sheet
        open={!!manual}
        onClose={() => setManual(null)}
        title="Nuevo elemento manual"
        description="Para lo que no está en la jerarquía. Queda guardado en las líneas, marcado como manual."
        actions={
          <>
            <Button variant="tinted" onClick={() => setManual(null)}>
              Cancelar
            </Button>
            <Button onClick={crearManual} disabled={!manual?.nombre.trim()}>
              Crear
            </Button>
          </>
        }
      >
        {manual && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-footnote text-muted-foreground">Nombre</span>
              <input
                autoFocus
                value={manual.nombre}
                maxLength={80}
                onChange={(e) => setManual({ ...manual, nombre: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') crearManual()
                }}
                placeholder="Ej.: Estanque de transferencia AM"
                className="h-[44px] w-full rounded-ctl bg-muted-foreground/10 px-3 text-campo outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-footnote text-muted-foreground">Contenedor</span>
              <select
                value={manual.zona}
                onChange={(e) => setManual({ ...manual, zona: e.target.value })}
                className="h-[44px] w-full cursor-pointer rounded-ctl bg-muted-foreground/10 px-3 text-campo outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="">Ninguno</option>
                {lineas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </Sheet>
    </div>
  )
}

/**
 * Ficha del contenedor: nombre, tipo y las dos salidas para «eliminar lo que estorba»
 * (sacar los equipos, o borrar la línea entera). Orel, 19-09-2026.
 */
function FichaContenedor({
  linea,
  equipos,
  entrada,
  onNombre,
  onTipo,
  onSacar,
  onEliminar,
}: {
  linea: LineaProceso
  equipos: number
  entrada: boolean
  onNombre: (v: string) => void
  onTipo: (t: 'linea' | 'apoyo') => void
  onSacar: () => void
  onEliminar: () => void
}) {
  const apoyo = linea.tipo === 'apoyo'
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-footnote text-muted-foreground">Nombre</span>
        <input
          value={linea.nombre}
          maxLength={60}
          onChange={(e) => onNombre(e.target.value.trimStart())}
          className="h-[44px] w-full rounded-ctl bg-muted-foreground/10 px-3 text-campo outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-footnote text-muted-foreground">Tipo</span>
        <select
          value={apoyo ? 'apoyo' : 'linea'}
          onChange={(e) => onTipo(e.target.value as 'linea' | 'apoyo')}
          className="h-[44px] w-full cursor-pointer rounded-ctl bg-muted-foreground/10 px-3 text-campo outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="linea">Línea de proceso</option>
          <option value="apoyo">Servicio de apoyo</option>
        </select>
      </label>
      <p className="text-footnote text-muted-foreground">
        {equipos === 0 ? 'Sin equipos adentro' : equipos === 1 ? '1 equipo adentro' : `${equipos} equipos adentro`}
        {apoyo ? ' · influye sin repartir flujo' : entrada ? ' · entrada al 100 %' : ' · le falta la entrada'}
      </p>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <Button variant="tinted" onClick={onSacar} disabled={!equipos}>
          Sacar los equipos
        </Button>
        <Button variant="tinted" className="text-ink-crit" onClick={onEliminar}>
          <Trash2 /> Eliminar {apoyo ? 'la zona' : 'la línea'}
        </Button>
      </div>
    </div>
  )
}

function FichaNodo({
  nodo,
  nombre,
  codigo,
  padre,
  hijos,
  enLienzo,
  peso,
  vuelta,
  lineaNombre,
  servicio,
  otraPlanta,
  manual,
  contenedor,
  contenedores,
  onCambiarContenedor,
  onDesplegar,
  onQuitar,
}: {
  nodo: Node
  vuelta?: string
  nombre: string
  codigo: string
  padre?: string
  hijos: { id: string; nombre: string }[]
  enLienzo: Set<string>
  peso?: PesoEnLinea
  lineaNombre: (id: string) => string
  servicio?: { abastece: string[]; recibe: string[] }
  otraPlanta?: string
  manual?: boolean
  contenedor: string
  contenedores: { id: string; nombre: string }[]
  onCambiarContenedor: (zona: string) => void
  onDesplegar: () => void
  onQuitar: () => void
}) {
  if (esEntrada(nodo.id)) {
    return (
      <>
        <h2 className="text-headline">{nombre}</h2>
        <p className="text-footnote text-muted-foreground">El flujo de la línea empieza aquí al 100 % y se reparte por las flechas. No se puede quitar.</p>
      </>
    )
  }
  const faltan = hijos.filter((h) => !enLienzo.has(h.id))
  return (
    <>
      <h2 className="text-headline">{nombre}</h2>
      <p className="text-footnote text-muted-foreground">
        {manual ? 'Elemento manual · no está en el árbol' : [codigo, padre ? `componente de ${padre}` : ''].filter(Boolean).join(' · ') || 'Sin código'}
      </p>
      {/* Contenedor: cambiarlo se confirma (entra al nuevo, o queda afuera, al costado). */}
      <label className="flex min-h-[44px] items-center justify-between gap-2 rounded-ctl bg-muted-foreground/10 pl-3 pr-1">
        <span className="text-footnote">Contenedor</span>
        <select
          value={contenedor}
          onChange={(e) => onCambiarContenedor(e.target.value)}
          className="min-h-[44px] min-w-0 max-w-[65%] cursor-pointer truncate rounded-ctl bg-transparent px-2 text-right text-footnote font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="">Ninguno</option>
          {contenedores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      {otraPlanta ? (
        <p className="rounded-ctl bg-ink-warn/10 px-3 py-2 text-footnote">Abastece a la planta {otraPlanta}: no cuenta en las líneas de Chonchi.</p>
      ) : servicio ? (
        <div>
          <p className="text-title3" style={{ color: APOYO }}>
            Indirecto
          </p>
          <p className="text-footnote text-muted-foreground">
            {servicio.abastece.length ? `Abastece a ${servicio.abastece.map(lineaNombre).join(', ')}. ` : ''}
            {servicio.recibe.length ? `Recibe de ${servicio.recibe.map(lineaNombre).join(', ')}. ` : ''}
            {!servicio.abastece.length && !servicio.recibe.length ? 'Sin unir: una flecha hacia una línea dice que la abastece; desde una línea, que recibe de ella. ' : ''}
            Si falla, la línea sigue un rato: influye, pero no suma % de parada.
          </p>
        </div>
      ) : peso?.ciclo ? (
        <div className="flex flex-col gap-2">
          <p className="text-title3 text-ink-warn">En un círculo de flechas</p>
          <p className="text-footnote text-muted-foreground">
            El flujo vuelve sobre sí mismo, así que no se puede repartir y este equipo queda sin porcentaje.
            {vuelta ? ` Sobra la flecha de vuelta: ${vuelta}.` : ''} Selecciónala en el lienzo y quítala.
          </p>
        </div>
      ) : peso ? (
        <div className="flex flex-col gap-2">
          <div>
            <p className={`text-title1 tabular-nums ${TINTA[tonoPeso(peso.peso)]}`}>{formatoPeso(peso.peso)}</p>
            <p className="text-footnote text-muted-foreground">de la línea {lineaNombre(peso.lineaId)}</p>
          </div>
          <div className="flex justify-between gap-2 border-t border-border pt-2 text-footnote">
            <span>Si se detiene 30 min</span>
            <b className="tabular-nums">= {Math.round(30 * peso.peso)} min de línea</b>
          </div>
        </div>
      ) : (
        <p className="text-footnote text-muted-foreground">Fuera de la línea (0 %): no está unido desde la entrada de ninguna línea.</p>
      )}
      {hijos.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <p className="text-footnote">
            <b>{hijos.length}</b> {hijos.length === 1 ? 'componente' : 'componentes'} en el árbol
            {faltan.length < hijos.length ? ` · ${hijos.length - faltan.length} en el lienzo` : ''}
          </p>
          <p className="text-caption text-muted-foreground">{hijos.slice(0, 6).map((h) => h.nombre).join(' · ')}{hijos.length > 6 ? '…' : ''}</p>
          {faltan.length > 0 && (
            <Button variant="tinted" onClick={onDesplegar}>
              Desplegar componentes
            </Button>
          )}
        </div>
      )}
      <Button variant="tinted" className="text-ink-crit" onClick={onQuitar}>
        Quitar del lienzo
      </Button>
    </>
  )
}

function FilaEquipo({
  id,
  nombre,
  codigo,
  area,
  ruta,
  puesto,
  otraPlanta,
  onTocar,
  onDragEnd,
}: {
  id: string
  nombre: string
  codigo: string
  area: boolean
  ruta?: string
  puesto: boolean
  otraPlanta?: string
  onTocar: (id: string) => void
  onDragEnd: () => void
}) {
  return (
    <button
      type="button"
      draggable={!puesto}
      disabled={puesto}
      onDragStart={(ev) => ev.dataTransfer.setData(MIME, id)}
      onDragEnd={onDragEnd}
      onClick={() => onTocar(id)}
      title={`${nombre}${codigo ? ` · ${codigo}` : ''}${puesto ? ' · ya está en el lienzo' : ''}`}
      className="flex min-h-[36px] w-full min-w-0 cursor-grab flex-col justify-center rounded-ctl px-2 py-1 text-left hover:bg-muted-foreground/10 disabled:cursor-default disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className={`break-words text-[12px] leading-tight ${area ? 'font-semibold' : ''}`}>
        {nombre}
        {otraPlanta ? <span className="font-semibold text-ink-warn"> · de {otraPlanta}</span> : null}
      </span>
      {(codigo || ruta) && <span className="truncate text-[10.5px] text-muted-foreground">{[codigo, ruta].filter(Boolean).join(' · ')}</span>}
    </button>
  )
}

function RamaArbol({
  id,
  nivel,
  indice,
  abiertos,
  onAlternar,
  enLienzo,
  deOtraPlanta,
  onTocar,
  onDragEnd,
}: {
  id: string
  nivel: number
  indice: Map<string, { nombre: string; codigo: string; area: boolean; hijos: { id: string; nombre: string }[] }>
  abiertos: Set<string>
  onAlternar: (id: string) => void
  enLienzo: Set<string>
  deOtraPlanta: Map<string, string>
  onTocar: (id: string) => void
  onDragEnd: () => void
}) {
  const e = indice.get(id)
  if (!e) return null
  const abierto = abiertos.has(id)
  return (
    <li>
      <div className="flex items-start" style={{ paddingLeft: nivel * 12 }}>
        {e.hijos.length ? (
          <button
            type="button"
            onClick={() => onAlternar(id)}
            aria-expanded={abierto}
            aria-label={`${abierto ? 'Contraer' : 'Desplegar'} ${e.nombre}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-ctl text-muted-foreground hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {abierto ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
          </button>
        ) : (
          <span className="size-9 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <FilaEquipo id={id} nombre={e.nombre} codigo={e.codigo} area={e.area} puesto={enLienzo.has(id)} otraPlanta={deOtraPlanta.get(id)} onTocar={onTocar} onDragEnd={onDragEnd} />
        </div>
      </div>
      {abierto && e.hijos.length > 0 && (
        <ul>
          {e.hijos.map((h) => (
            <RamaArbol
              key={h.id}
              id={h.id}
              nivel={nivel + 1}
              indice={indice}
              abiertos={abiertos}
              onAlternar={onAlternar}
              enLienzo={enLienzo}
              deOtraPlanta={deOtraPlanta}
              onTocar={onTocar}
              onDragEnd={onDragEnd}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function EditorLineasProcesoPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  )
}
