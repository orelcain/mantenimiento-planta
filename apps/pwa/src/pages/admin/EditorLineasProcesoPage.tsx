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
import { ChevronLeft, Expand, Loader2, RotateCcw, Search } from 'lucide-react'
import { Button } from '@/components/piel'
import { useHierarchyTree } from '@/hooks/useHierarchy'
import { useAuthStore } from '@/store'
import { useToast } from '@/hooks/useToast'
import {
  esEntrada,
  formatoPeso,
  lineaDeEntrada,
  lineaEnPunto,
  pesosPorLinea,
  type GrafoLineas,
  type LineaProceso,
} from '@/services/lineasProceso/modeloLineas'
import { propuestaChonchi } from '@/services/lineasProceso/propuestaChonchi'
import {
  RAICES_CHONCHI,
  guardarLineas,
  leerLineas,
  seccionesDeProceso,
  type EquipoDeSeccion,
} from '@/services/lineasProceso/lineasProceso.service'

/**
 * Editor de líneas de proceso (panel admin, 19-09-2026; prototipo aprobado
 * https://claude.ai/artifact/G4KbK1RAYafiJXabWQGFNf). Las máquinas se unen con
 * flechas en el orden del flujo y el PESO de cada una en su línea se calcula
 * solo (`pesosPorLinea`): serie 100 %, paralelo 1/N, suelta = fuera de la línea.
 * Se edita en el PC; en el teléfono se ve (arrastrar nodos con el dedo sobre un
 * lienzo que también se desplaza con el dedo es una trampa).
 */

const PLANTA = 'chonchi'
const MIME = 'application/x-equipo'

type DatosMaquina = { nombre: string; codigo: string; componentes: number; conjunto: boolean; peso: number | null; linea: string | null; zona: string | null }
type DatosEntrada = { linea: string }
type DatosZona = { nombre: string; w: number; h: number }

function tonoPeso(peso: number | null): 'serie' | 'paralelo' | 'fuera' {
  if (peso == null || peso === 0) return 'fuera'
  return Math.abs(peso - 1) < 1e-9 ? 'serie' : 'paralelo'
}
const BORDE = { serie: 'border-ink-crit', paralelo: 'border-ink-warn', fuera: 'border-dashed border-muted-foreground/50' } as const
const TINTA = { serie: 'text-ink-crit', paralelo: 'text-ink-warn', fuera: 'text-muted-foreground' } as const
const PUNTO = '!size-3.5 !border-2 !border-card !bg-primary'

function NodoMaquina({ data, selected }: NodeProps<Node<DatosMaquina>>) {
  const tono = tonoPeso(data.peso)
  return (
    <div
      className={`w-[176px] rounded-card border-2 bg-card px-3 py-2 shadow-[0_1px_4px_rgba(0,0,0,0.12)] ${BORDE[tono]} ${selected ? 'ring-4 ring-primary/35' : ''} ${tono === 'fuera' ? 'opacity-85' : ''}`}
    >
      <Handle type="target" position={Position.Left} className={PUNTO} />
      <p className="break-words text-[12px] font-semibold leading-tight">{data.nombre}</p>
      <p className={`text-[17px] font-bold tabular-nums leading-snug ${TINTA[tono]}`}>{data.peso == null ? '0 %' : formatoPeso(data.peso)}</p>
      <p className="text-[10.5px] leading-tight text-muted-foreground">
        {data.linea ? `de ${data.linea}` : `fuera de la línea${data.zona ? ` · ${data.zona}` : ''}`}
        {data.componentes ? ` · +${data.componentes} comp.` : ''}
      </p>
      <Handle type="source" position={Position.Right} className={PUNTO} />
    </div>
  )
}

function NodoEntrada({ data, selected }: NodeProps<Node<DatosEntrada>>) {
  return (
    <div className={`flex min-h-[44px] w-[124px] items-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground shadow-[0_1px_4px_rgba(0,0,0,0.15)] ${selected ? 'ring-4 ring-primary/35' : ''}`}>
      <Handle type="target" position={Position.Left} className="!size-3 !border-2 !border-primary !bg-primary-foreground" />
      Entrada {data.linea}
      <Handle type="source" position={Position.Right} className="!size-3.5 !border-2 !border-primary !bg-primary-foreground" />
    </div>
  )
}

function NodoZona({ data }: NodeProps<Node<DatosZona>>) {
  return (
    <div style={{ width: data.w, height: data.h }} className="rounded-[22px] border border-muted-foreground/25 bg-card/45">
      <span className="absolute left-4 top-3 text-headline text-muted-foreground">{data.nombre}</span>
    </div>
  )
}

const TIPOS = { maquina: NodoMaquina, entrada: NodoEntrada, zona: NodoZona }

const aNodos = (g: GrafoLineas): Node[] => [
  ...g.lineas.map((l) => ({
    id: `zona:${l.id}`,
    type: 'zona',
    position: { x: l.zona.x, y: l.zona.y },
    data: { nombre: l.nombre, w: l.zona.w, h: l.zona.h },
    draggable: false,
    selectable: false,
    deletable: false,
    zIndex: -1,
  })),
  ...g.nodos.map((n) => ({
    id: n.id,
    type: esEntrada(n.id) ? 'entrada' : 'maquina',
    position: { x: n.x, y: n.y },
    data: {},
    deletable: !esEntrada(n.id),
  })),
]
const aAristas = (g: GrafoLineas): Edge[] => g.aristas.map(([a, b]) => ({ id: `${a}->${b}`, source: a, target: b }))

function alGrafo(lineas: LineaProceso[], nodes: Node[], edges: Edge[]): GrafoLineas {
  return {
    version: 1,
    lineas,
    nodos: nodes.filter((n) => n.type !== 'zona').map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
    aristas: edges.map((e) => [e.source, e.target] as [string, string]),
  }
}

function Editor() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const usuario = useAuthStore((s) => s.user)
  const { tree, loading: cargandoArbol } = useHierarchyTree()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const lienzo = useRef<HTMLDivElement>(null)

  const [lineas, setLineas] = useState<LineaProceso[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [guardado, setGuardado] = useState<string>('')
  const [meta, setMeta] = useState<string>('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [oscuro, setOscuro] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const raiz = document.documentElement
    const obs = new MutationObserver(() => setOscuro(raiz.classList.contains('dark')))
    obs.observe(raiz, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  const [editable, setEditable] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 768px) and (pointer: fine)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (pointer: fine)')
    const cambio = () => setEditable(mq.matches)
    mq.addEventListener('change', cambio)
    return () => mq.removeEventListener('change', cambio)
  }, [])

  const secciones = useMemo(() => seccionesDeProceso(tree, RAICES_CHONCHI), [tree])
  const equipos = useMemo(() => {
    const m = new Map<string, EquipoDeSeccion & { seccion: string }>()
    for (const s of secciones) for (const e of s.equipos) m.set(e.id, { ...e, seccion: s.nombre })
    return m
  }, [secciones])

  const cargarGrafo = useCallback((g: GrafoLineas) => {
    setLineas(g.lineas)
    setNodes(aNodos(g))
    setEdges(aAristas(g))
  }, [])

  const propuesta = useCallback(() => {
    const porNombre = new Map([...equipos.values()].map((e) => [e.nombre.toUpperCase(), e.id]))
    return propuestaChonchi((n) => porNombre.get(n.trim().toUpperCase()))
  }, [equipos])

  // Carga: lo guardado o, si no hay nada, la propuesta deducida del árbol.
  useEffect(() => {
    if (cargandoArbol || !equipos.size) return
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
  }, [cargandoArbol, equipos, propuesta, cargarGrafo, toast])

  // Pesos calculados con las flechas, en cada cambio.
  const grafo = useMemo(() => alGrafo(lineas, nodes, edges), [lineas, nodes, edges])
  const pesos = useMemo(() => pesosPorLinea(grafo), [grafo])
  const nombreLinea = useMemo(() => new Map(lineas.map((l) => [l.id, l.nombre])), [lineas])
  const vista = useMemo(
    () =>
      nodes.map((n) => {
        if (n.type === 'zona') return n
        if (n.type === 'entrada') return { ...n, data: { linea: nombreLinea.get(lineaDeEntrada(n.id)) ?? lineaDeEntrada(n.id) } }
        const e = equipos.get(n.id)
        const p = pesos.get(n.id)
        return {
          ...n,
          data: {
            nombre: e?.nombre ?? 'Equipo que ya no está en el árbol',
            codigo: e?.codigo ?? '',
            componentes: e?.componentes ?? 0,
            conjunto: e?.conjunto ?? false,
            peso: p?.peso ?? null,
            linea: p ? (nombreLinea.get(p.lineaId) ?? null) : null,
            zona: lineaEnPunto(lineas, n.position.x + 88, n.position.y + 30)?.nombre ?? null,
          } satisfies DatosMaquina,
        }
      }),
    [nodes, equipos, pesos, nombreLinea, lineas],
  )
  const vistaAristas = useMemo(
    () =>
      edges.map((e) => {
        const entre = esEntrada(e.target)
        return {
          ...e,
          type: 'default',
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: entre ? 'rgb(var(--muted-foreground))' : 'rgb(var(--primary))' },
          style: entre
            ? { stroke: 'rgb(var(--muted-foreground))', strokeWidth: 2, strokeDasharray: '6 5' }
            : { stroke: 'rgb(var(--primary))', strokeWidth: 2.5 },
        }
      }),
    [edges],
  )

  const sucio = !cargando && JSON.stringify(grafo) !== guardado
  const enLienzo = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes((ns) => applyNodeChanges(c, ns)), [])
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((es) => applyEdgeChanges(c, es)), [])
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: `${c.source}->${c.target}` }, es)), [])
  const esValida = useCallback(
    (c: Connection | Edge) => c.source !== c.target && !edges.some((e) => e.source === c.source && e.target === c.target),
    [edges],
  )

  const agregar = useCallback(
    (id: string, x: number, y: number) => {
      if (enLienzo.has(id)) return
      setNodes((ns) => [...ns, { id, type: 'maquina', position: { x: x - 88, y: y - 30 }, data: {} }])
    },
    [enLienzo],
  )
  const alSoltar = (ev: DragEvent) => {
    ev.preventDefault()
    const id = ev.dataTransfer.getData(MIME)
    if (!id) return
    const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
    agregar(id, p.x, p.y)
  }
  const alTocar = (id: string) => {
    const r = lienzo.current?.getBoundingClientRect()
    if (!r) return
    const p = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    agregar(id, p.x, p.y)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      await guardarLineas(PLANTA, grafo, usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() : 'Admin')
      setGuardado(JSON.stringify(grafo))
      setMeta(`Guardado por ${usuario?.nombre ?? 'admin'} · recién`)
    } catch {
      toast({ title: 'No se pudo guardar', description: 'Revisa la conexión o tus permisos de administrador.', variant: 'destructive' })
    } finally {
      setGuardando(false)
    }
  }

  const resumen = useMemo(
    () =>
      lineas.map((l) => {
        const miembros = [...pesos.entries()].filter(([, p]) => p.lineaId === l.id)
        return { l, maquinas: miembros.length, serie: miembros.filter(([, p]) => Math.abs(p.peso - 1) < 1e-9).length }
      }),
    [lineas, pesos],
  )

  const q = consulta.trim().toLowerCase()

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[520px] flex-col md:h-[calc(100dvh-1rem)]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/admin')}
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
          <div className="flex flex-wrap gap-2">
            <Button variant="tinted" onClick={() => cargarGrafo(propuesta())} disabled={cargando || guardando}>
              <RotateCcw /> Volver a la propuesta
            </Button>
            <Button onClick={() => void guardar()} disabled={!sucio || guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : null} Guardar
            </Button>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {editable && (
          <aside aria-label="Equipos de Acopio y Proceso" className="flex w-[280px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-card p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Equipo o código"
                aria-label="Buscar equipo o código"
                className="h-[44px] w-full rounded-ctl bg-muted-foreground/10 pl-9 pr-3 text-campo outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <p className="text-caption text-muted-foreground">
              Arrastra un equipo al lienzo (o tócalo). Para unir, arrastra desde el punto azul de la derecha hasta otro equipo. Supr quita lo seleccionado.
            </p>
            {secciones.map((s) => {
              const lista = s.equipos.filter((e) => !q || e.nombre.toLowerCase().includes(q) || e.codigo.includes(q))
              if (!lista.length) return null
              const fuera = lista.filter((e) => !enLienzo.has(e.id)).length
              return (
                <details key={s.nombre} open={Boolean(q)} className="border-t border-border pt-1 first:border-t-0">
                  <summary className="flex min-h-[36px] cursor-pointer items-center justify-between text-footnote font-semibold text-muted-foreground">
                    <span>{s.nombre}</span>
                    <span className="font-normal tabular-nums">{fuera} fuera</span>
                  </summary>
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {lista.map((e) => {
                      const puesto = enLienzo.has(e.id)
                      return (
                        <button
                          key={e.id}
                          type="button"
                          draggable={!puesto}
                          disabled={puesto}
                          onDragStart={(ev) => ev.dataTransfer.setData(MIME, e.id)}
                          onClick={() => alTocar(e.id)}
                          title={`${e.nombre}${e.codigo ? ` · ${e.codigo}` : ''}`}
                          className="max-w-full cursor-grab rounded-ctl bg-muted-foreground/10 px-2 py-1.5 text-left text-[11.5px] leading-tight disabled:cursor-default disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {e.nombre}
                          {e.conjunto ? ' (conjunto)' : ''}
                        </button>
                      )
                    })}
                  </div>
                </details>
              )
            })}
          </aside>
        )}

        <div ref={lienzo} className="relative min-w-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={alSoltar}>
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
              isValidConnection={esValida}
              nodesDraggable={editable}
              nodesConnectable={editable}
              elementsSelectable={editable}
              deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
              colorMode={oscuro ? 'dark' : 'light'}
              fitView
              fitViewOptions={{ padding: 0.06, nodes: [{ id: 'zona:acopio' }, { id: 'zona:eviscerado' }] }}
              minZoom={0.2}
              maxZoom={1.6}
              proOptions={{ hideAttribution: true }}
              className="bg-background"
            >
              <Background gap={24} size={1.2} color="rgb(var(--muted-foreground) / 0.25)" />
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
                  if (n.type === 'zona') return 'rgb(var(--muted-foreground) / 0.12)'
                  if (n.type === 'entrada') return 'rgb(var(--primary))'
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
                <span className="text-muted-foreground">– – entre líneas</span>
              </Panel>
              <Panel position="top-right" className="!m-3 hidden rounded-ctl bg-card/90 px-3 py-2 text-caption shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur lg:block">
                {resumen.map(({ l, maquinas, serie }) => (
                  <p key={l.id} className="tabular-nums">
                    <b>{l.nombre}</b> · {maquinas} {maquinas === 1 ? 'máquina' : 'máquinas'} · {serie} en serie
                  </p>
                ))}
              </Panel>
              {!editable && (
                <Panel position="bottom-center" className="!mb-16 rounded-full bg-card px-4 py-2 text-footnote shadow-[0_1px_4px_rgba(0,0,0,0.12)]">
                  Solo lectura. Para editar, abre esta herramienta en un PC.
                </Panel>
              )}
            </ReactFlow>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EditorLineasProcesoPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  )
}
