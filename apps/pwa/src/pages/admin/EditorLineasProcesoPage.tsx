import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronDown, ChevronLeft, ChevronRight, Expand, Loader2, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Plus, Redo2, RotateCcw, Search, Undo2, X } from 'lucide-react'
import { Button, Sheet } from '@/components/piel'
import { ToastAction } from '@/components/ui/toast'
import { useHierarchyTree } from '@/hooks/useHierarchy'
import { useAuthStore } from '@/store'
import { useToast } from '@/hooks/useToast'
import {
  NODO,
  PREFIJO_MANUAL,
  esEntrada,
  esManual,
  formatoPeso,
  limitesDeZonas,
  lineaDeEntrada,
  pesosPorLinea,
  relacionesDeServicios,
  serviciosDe,
  zonaDeNodo,
  type GrafoLineas,
  type LineaProceso,
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

type DatosMaquina = { nombre: string; peso: number | null; linea: string | null; contenedor: string | null; componentes: number; otraPlanta?: string; manual?: boolean }
type DatosServicio = { nombre: string; abastece: string[]; recibe: string[] }
type DatosEntrada = { linea: string }
type DatosZona = { nombre: string; w: number; h: number; apoyo: boolean; resaltada: boolean }
type Instantanea = { nodes: Node[]; edges: Edge[] }
/** Pertenencia y nombre (manuales) que viajan en `data` de los nodos base. */
type DatosBase = { zona?: string; nombre?: string }
/** Una confirmación pendiente: entrar, salir o cambiar de contenedor (Orel, 19-09-2026). */
type Pedido = { titulo: string; detalle: string; confirmar: string; hacer: () => void; cancelar?: () => void }

function tonoPeso(peso: number | null): 'serie' | 'paralelo' | 'fuera' {
  if (peso == null || peso === 0) return 'fuera'
  return Math.abs(peso - 1) < 1e-9 ? 'serie' : 'paralelo'
}
const BORDE = { serie: 'border-ink-crit', paralelo: 'border-ink-warn', fuera: 'border-dashed border-muted-foreground/50' } as const
const TINTA = { serie: 'text-ink-crit', paralelo: 'text-ink-warn', fuera: 'text-muted-foreground' } as const
const PUNTO = '!size-3.5 !border-2 !border-card !bg-primary'
const SELECCION = 'ring-4 ring-primary/35'

function NodoMaquina({ data, selected }: NodeProps<Node<DatosMaquina>>) {
  const tono = tonoPeso(data.peso)
  return (
    <div
      style={{ width: NODO.ancho }}
      className={`rounded-card border-2 bg-card px-3 py-2 shadow-[0_1px_4px_rgba(0,0,0,0.12)] ${BORDE[tono]} ${selected ? SELECCION : ''} ${tono === 'fuera' ? 'opacity-85' : ''}`}
    >
      <Handle type="target" position={Position.Left} className={PUNTO} />
      <p className="break-words text-[12px] font-semibold leading-tight">{data.nombre}</p>
      <p className={`text-[17px] font-bold tabular-nums leading-snug ${TINTA[tono]}`}>
        {data.otraPlanta ? `de ${data.otraPlanta}` : data.peso == null ? '0 %' : formatoPeso(data.peso)}
      </p>
      <p className="text-[10.5px] leading-tight text-muted-foreground">
        {data.otraPlanta ? 'no cuenta en esta planta' : data.linea ? `de ${data.linea}` : `fuera de la línea${data.contenedor ? ` · ${data.contenedor}` : ''}`}
        {data.componentes ? ` · +${data.componentes} comp.` : ''}
        {data.manual ? ' · manual' : ''}
      </p>
      <Handle type="source" position={Position.Right} className={PUNTO} />
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
      <Handle type="target" position={Position.Left} className={PUNTO} />
      <p className="break-words text-[12px] font-semibold leading-tight">{data.nombre}</p>
      <p className="text-[12px] font-bold leading-snug" style={{ color: APOYO }}>
        indirecto
      </p>
      <p className="text-[10.5px] leading-tight text-muted-foreground">{texto || 'sin unir: une con una flecha a la línea que abastece'}</p>
      <Handle type="source" position={Position.Right} className={PUNTO} />
    </div>
  )
}

function NodoEntrada({ data, selected }: NodeProps<Node<DatosEntrada>>) {
  return (
    <div className={`flex min-h-[44px] w-[124px] items-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground shadow-[0_1px_4px_rgba(0,0,0,0.15)] ${selected ? SELECCION : ''}`}>
      <Handle type="target" position={Position.Left} className="!size-3 !border-2 !border-primary !bg-primary-foreground" />
      Entrada {data.linea}
      <Handle type="source" position={Position.Right} className="!size-3.5 !border-2 !border-primary !bg-primary-foreground" />
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
      <span className="absolute left-4 top-3 text-headline" style={{ color: data.apoyo ? APOYO : undefined }}>
        <span className={data.apoyo ? '' : 'text-muted-foreground'}>{data.nombre}</span>
      </span>
    </div>
  )
}

const TIPOS = { maquina: NodoMaquina, servicio: NodoServicio, entrada: NodoEntrada, zona: NodoZona }

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
    zIndex: -1,
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

function alGrafo(lineas: LineaProceso[], nodes: Node[], edges: Edge[]): GrafoLineas {
  return {
    version: 1,
    lineas,
    nodos: nodes
      .filter((n) => n.type !== 'zona')
      .map((n) => {
        const d = n.data as DatosBase
        return { id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y), ...(d.zona !== undefined ? { zona: d.zona } : {}), ...(d.nombre ? { nombre: d.nombre } : {}) }
      }),
    aristas: edges.map((e) => [e.source, e.target] as [string, string]),
  }
}

const escribiendo = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

function Editor() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const usuario = useAuthStore((s) => s.user)
  const { tree, loading: cargandoArbol } = useHierarchyTree()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const lienzo = useRef<HTMLDivElement>(null)
  // Espacio de trabajo (Orel, 19-09-2026): pantalla completa y lista de equipos plegable.
  const [amplio, setAmplio] = useState(false)
  const [conLista, setConLista] = useState(true)

  const [lineas, setLineas] = useState<LineaProceso[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [guardado, setGuardado] = useState<string>('')
  const [meta, setMeta] = useState<string>('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [zonaResaltada, setZonaResaltada] = useState<string | null>(null)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set())
  const [manual, setManual] = useState<{ nombre: string; zona: string } | null>(null)
  const [oscuro, setOscuro] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  const [editable, setEditable] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 768px) and (pointer: fine)').matches)
  // Deshacer / rehacer: instantáneas antes de cada cambio que importa (HIG «Undo and redo»).
  const pilaDeshacer = useRef<Instantanea[]>([])
  const pilaRehacer = useRef<Instantanea[]>([])
  const [, setVersionPilas] = useState(0)
  const actual = useRef<Instantanea>({ nodes: [], edges: [] })
  actual.current = { nodes, edges }

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
        setGuardado(g ? JSON.stringify(alGrafo(base.lineas, aNodos(base), aAristas(base))) : '')
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
  const grafo = useMemo(() => alGrafo(lineas, nodes, edges), [lineas, nodes, edges])
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

  const vista = useMemo(
    () =>
      nodes.map((n): Node => {
        if (n.type === 'zona') {
          const l = limites.get(n.id.slice('zona:'.length))
          return { ...n, position: l ? { x: l.x, y: l.y } : n.position, data: { ...n.data, ...(l ? { w: l.w, h: l.h } : {}), resaltada: n.id === zonaResaltada } }
        }
        if (n.type === 'entrada') return { ...n, ariaLabel: nombreDe(n.id), data: { linea: nombreLinea.get(lineaDeEntrada(n.id)) ?? lineaDeEntrada(n.id) } }
        const e = indice.get(n.id)
        if (servicios.has(n.id)) {
          const r = relaciones.get(n.id)
          const data: DatosServicio = {
            nombre: nombreDe(n.id),
            abastece: (r?.abastece ?? []).map((l) => nombreLinea.get(l) ?? l),
            recibe: (r?.recibe ?? []).map((l) => nombreLinea.get(l) ?? l),
          }
          return { ...n, type: 'servicio', ariaLabel: `${data.nombre}, servicio de apoyo`, data }
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
        }
        return {
          ...n,
          type: 'maquina',
          ariaLabel: `${data.nombre}, ${data.linea ? `${formatoPeso(data.peso ?? 0)} de ${data.linea}` : 'fuera de la línea'}`,
          data,
        }
      }),
    [nodes, indice, pesos, servicios, relaciones, nombreLinea, zonaResaltada, deOtraPlanta, nombreDe, limites, contenedorDe],
  )

  const vistaAristas = useMemo(
    () =>
      edges.map((e): Edge => {
        const apoyo = servicios.has(e.source) || servicios.has(e.target)
        const entre = !apoyo && esEntrada(e.target)
        const color = apoyo ? APOYO : entre ? 'rgb(var(--muted-foreground))' : 'rgb(var(--primary))'
        return {
          ...e,
          type: 'default',
          ariaLabel: `Flecha de ${nombreDe(e.source)} a ${nombreDe(e.target)}`,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
          ...(apoyo
            ? {
                label: servicios.has(e.source) ? 'abastece' : 'recibe',
                labelStyle: { fill: APOYO, fontSize: 11, fontWeight: 600 },
                labelBgStyle: { fill: 'rgb(var(--card))' },
                labelBgPadding: [4, 2] as [number, number],
                labelBgBorderRadius: 6,
              }
            : {}),
          style: apoyo
            ? { stroke: color, strokeWidth: 2, strokeDasharray: '2 6', strokeLinecap: 'round' }
            : entre
              ? { stroke: color, strokeWidth: 2, strokeDasharray: '6 5' }
              : { stroke: color, strokeWidth: 2.5 },
        }
      }),
    [edges, servicios, nombreDe],
  )

  const sucio = !cargando && JSON.stringify(grafo) !== guardado
  const enLienzo = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])
  const seleccionado = nodes.find((n) => n.selected && n.type !== 'zona')
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
    setVersionPilas((v) => v + 1)
  }, [])
  const rehacer = useCallback(() => {
    const siguiente = pilaRehacer.current.pop()
    if (!siguiente) return
    pilaDeshacer.current.push(actual.current)
    setNodes(siguiente.nodes)
    setEdges(siguiente.edges)
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
      setEdges((es) => addEdge({ ...c, id: `${c.source}->${c.target}` }, es))
    },
    [registrar],
  )
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

  const inspector = editable && (seleccionado || flechaSeleccionada)

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
              {amplio ? 'Salir' : 'Pantalla completa'}
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
              Toda la jerarquía, con o sin código. Arrastra al lienzo (o toca). Para unir, arrastra desde el punto azul. Mayús + arrastre selecciona varios. Supr quita · Ctrl+Z deshace.
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
              nodes={vista}
              edges={vistaAristas}
              nodeTypes={TIPOS}
              onNodesChange={editable ? onNodesChange : undefined}
              onEdgesChange={editable ? onEdgesChange : undefined}
              onConnect={editable ? onConnect : undefined}
              onBeforeDelete={async () => {
                registrar()
                return true
              }}
              onDelete={onDelete}
              onNodeDragStart={() => registrar()}
              onNodeDrag={(_, n) => {
                const z = esEntrada(n.id) ? undefined : zonaEn(n.position.x + NODO.ancho / 2, n.position.y + NODO.alto / 2, contenedorDeNodo(n))
                setZonaResaltada(z ? `zona:${z.id}` : null)
              }}
              onNodeDragStop={(_, n, movidos) => alSoltarNodos(movidos.length ? movidos : [n])}
              isValidConnection={esValida}
              nodesDraggable={editable}
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
                  if (n.type === 'entrada') return 'rgb(var(--primary))'
                  if (n.type === 'servicio') return APOYO
                  const t = tonoPeso((n.data as DatosMaquina).peso)
                  return t === 'serie' ? 'rgb(var(--ink-crit))' : t === 'paralelo' ? 'rgb(var(--ink-warn))' : 'rgb(var(--muted-foreground) / 0.5)'
                }}
              />
              <Panel position="top-left" className="!m-3 flex flex-wrap gap-x-4 gap-y-1 rounded-ctl bg-card/90 px-3 py-2 text-caption shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur">
                <span>
                  <b className="text-ink-crit">100 %</b> todo el flujo pasa (en serie)
                </span>
                <span>
                  <b className="text-ink-warn">1/N</b> una de N ramas (en paralelo)
                </span>
                <span>
                  <b className="text-muted-foreground">0 %</b> suelta: fuera de la línea
                </span>
                <span>
                  <b style={{ color: APOYO }}>indirecto</b> servicio de apoyo
                </span>
                <span className="text-muted-foreground">– – entre líneas</span>
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
              <p className="text-footnote text-muted-foreground">{flechaSeleccionada ? 'Flecha seleccionada' : 'Seleccionado'}</p>
              <button
                type="button"
                onClick={() => {
                  setNodes((ns) => ns.map((x) => ({ ...x, selected: false })))
                  setEdges((es) => es.map((x) => ({ ...x, selected: false })))
                }}
                aria-label="Cerrar el inspector"
                className="-mr-2 -mt-2 flex size-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" />
              </button>
            </div>
            {seleccionado ? (
              <FichaNodo
                nodo={seleccionado}
                nombre={nombreDe(seleccionado.id)}
                codigo={indice.get(seleccionado.id)?.codigo ?? ''}
                padre={indice.get(seleccionado.id)?.padre}
                hijos={indice.get(seleccionado.id)?.hijos ?? []}
                enLienzo={enLienzo}
                peso={pesos.get(seleccionado.id)}
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
                <Button variant="tinted" className="text-ink-crit" onClick={quitarSeleccion}>
                  Quitar la flecha
                </Button>
              </>
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
            <Button
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

function FichaNodo({
  nodo,
  nombre,
  codigo,
  padre,
  hijos,
  enLienzo,
  peso,
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
  nombre: string
  codigo: string
  padre?: string
  hijos: { id: string; nombre: string }[]
  enLienzo: Set<string>
  peso?: { lineaId: string; peso: number }
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
