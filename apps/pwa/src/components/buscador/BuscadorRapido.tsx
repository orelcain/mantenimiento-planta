/**
 * Buscador rápido de la PWA (Ctrl+K / ⌘K en PC, lupa del menú en el celular).
 *
 * Opción B del lienzo (11-11-2026): en PC, lista a la izquierda y el expediente
 * del resultado seleccionado a la derecha (código, ubicación y accesos), para
 * elegir entre «Baader 142 N1/N2/N3» sin abrir nada. En el celular, pantalla
 * completa con la lista sola; la segunda línea de cada fila dice dónde está.
 *
 * Costo de Firestore: equipos, fichas, turnos y páginas = 0 lecturas. Repuestos
 * = 1 lectura del índice `repuestosIndice/sap` la primera vez que se abre (con caché).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Search, X } from 'lucide-react'
import { useAppStore } from '@/store'
import { usePermissions } from '@/hooks/usePermissions'
import { useEsPC } from '@/hooks/useEsPC'
import { LEARNING_MACHINES } from '@/data/learningMachines'
import { SPECIAL_MODULES } from '@/data/learningSpecialModules'
import { fuenteRepuestosFirestore } from '@/services/bitacora/repuestosFirestore'
import type { RepuestoDelCatalogo } from '@/services/bitacora/repuestosBitacora'
import {
  buscar,
  indexar,
  itemsEquipos,
  itemsFichas,
  itemsPaginas,
  itemsRepuestos,
  NOMBRE_GRUPO,
  resaltar,
  turnosDeFecha,
  turnosRecientes,
  type GrupoResultados,
  type ItemBuscador,
  type PaginaFuente,
} from '@/services/buscador/buscador'
import { cn } from '@/lib/utils'

const CLAVE_RECIENTES = 'buscador.recientes.v1'
const MAX_RECIENTES = 6

function leerRecientes(): ItemBuscador[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]')
    return Array.isArray(v) ? (v as ItemBuscador[]).filter((x) => x && typeof x.id === 'string' && typeof x.href === 'string') : []
  } catch {
    return []
  }
}

function guardarReciente(item: ItemBuscador): void {
  // Los turnos ya salen arriba y su título («ayer») caduca: no se guardan.
  if (item.tipo === 'turno') return
  try {
    const lista = [item, ...leerRecientes().filter((x) => x.id !== item.id)].slice(0, MAX_RECIENTES)
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista))
  } catch {
    /* sin almacenamiento: el buscador funciona igual */
  }
}

const NOMBRE_TIPO: Record<ItemBuscador['tipo'], string> = {
  equipo: 'Equipo',
  repuesto: 'Repuesto',
  ficha: 'Centro de Aprendizaje',
  turno: 'Turno de la Bitácora',
  pagina: 'Página',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Las páginas del menú que el usuario ya puede ver (mismo filtro que la barra lateral). */
  paginas: PaginaFuente[]
  /** Fuente del índice SAP. Por defecto, `repuestosIndice/sap` con caché; la vitrina de desarrollo inyecta datos exportados. */
  cargarRepuestos?: () => Promise<RepuestoDelCatalogo[]>
}

type EstadoRepuestos = 'sin-cargar' | 'cargando' | 'listo' | 'error'

const cargarIndiceSap = () => fuenteRepuestosFirestore.todos()

export function BuscadorRapido({ open, onOpenChange, paginas, cargarRepuestos = cargarIndiceSap }: Props) {
  const pc = useEsPC()
  const navigate = useNavigate()
  const equipos = useAppStore((s) => s.equipment)
  const { isAdmin } = usePermissions()

  const [consulta, setConsulta] = useState('')
  const [sel, setSel] = useState(0)
  const [repuestos, setRepuestos] = useState<RepuestoDelCatalogo[]>([])
  const [estadoRep, setEstadoRep] = useState<EstadoRepuestos>('sin-cargar')
  const [recientes, setRecientes] = useState<ItemBuscador[]>([])
  const [ahora, setAhora] = useState(() => new Date())
  const listaRef = useRef<HTMLDivElement>(null)

  // Al abrir: limpiar, refrescar el reloj y los recientes, y leer el índice SAP una vez.
  useEffect(() => {
    if (!open) return
    setConsulta('')
    setSel(0)
    setAhora(new Date())
    setRecientes(leerRecientes())
    if (estadoRep === 'sin-cargar' || estadoRep === 'error') {
      setEstadoRep('cargando')
      cargarRepuestos()
        .then((r) => {
          setRepuestos(r)
          setEstadoRep('listo')
        })
        .catch(() => setEstadoRep('error'))
    }
    // estadoRep solo decide la primera carga; no debe volver a disparar el efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const indiceBase = useMemo(
    () =>
      indexar([
        ...itemsEquipos(equipos, LEARNING_MACHINES),
        ...itemsFichas(LEARNING_MACHINES, SPECIAL_MODULES, isAdmin),
        ...itemsPaginas(paginas),
      ]),
    [equipos, isAdmin, paginas],
  )
  const indiceRepuestos = useMemo(() => indexar(itemsRepuestos(repuestos)), [repuestos])
  const turnos = useMemo(() => turnosRecientes(ahora), [ahora])

  const grupos: GrupoResultados[] = useMemo(() => {
    const q = consulta.trim()
    const idsRec = recientes.map((r) => r.id)
    if (!q) {
      const inicio: GrupoResultados[] = [{ tipo: 'turno', items: turnos.slice(0, 3), total: 3 }]
      if (recientes.length) inicio.push({ tipo: 'equipo', items: recientes, total: recientes.length })
      inicio.push({ tipo: 'pagina', items: itemsPaginas(paginas).slice(0, 6), total: paginas.length })
      return inicio
    }
    const extraTurnos = turnosDeFecha(q, ahora).filter((t) => !turnos.some((x) => x.id === t.id))
    const indiceTurnos = indexar([...turnos, ...extraTurnos])
    return buscar([...indiceBase, ...indiceRepuestos, ...indiceTurnos], q, { recientes: idsRec })
  }, [consulta, recientes, turnos, paginas, ahora, indiceBase, indiceRepuestos])

  const filas = useMemo(() => grupos.flatMap((g) => g.items), [grupos])
  const actual = filas[Math.min(sel, filas.length - 1)]

  useEffect(() => setSel(0), [consulta])
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-fila="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const abrir = useCallback(
    (item: ItemBuscador | undefined, href?: string) => {
      if (!item) return
      guardarReciente(item)
      onOpenChange(false)
      navigate(href ?? item.href)
    },
    [navigate, onOpenChange],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, filas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const segundo = (e.ctrlKey || e.metaKey) && actual?.accesos?.[1]
      abrir(actual, segundo ? segundo.href : undefined)
    }
  }

  const sinTexto = !consulta.trim()
  const sinResultados = !sinTexto && filas.length === 0

  // Nombre del grupo: sin texto, el bloque de recientes se llama «Recientes».
  const tituloGrupo = (g: GrupoResultados, i: number) =>
    sinTexto && i > 0 && g.tipo === 'equipo' ? 'Recientes' : NOMBRE_GRUPO[g.tipo]

  let n = -1
  const lista = (
    <div ref={listaRef} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
      {grupos.map((g, gi) => (
        <div key={`${g.tipo}-${gi}`} role="group" aria-label={tituloGrupo(g, gi)}>
          <div className={cn('flex justify-between text-footnote text-muted-foreground', pc ? 'px-5 pb-1 pt-3' : 'px-4 pb-1 pt-4')}>
            <span>{tituloGrupo(g, gi)}</span>
            {!sinTexto && g.total > g.items.length && <span className="tabular-nums">{g.items.length} de {g.total}</span>}
          </div>
          {g.items.map((item) => {
            n += 1
            const i = n
            const activo = i === sel && (pc || !sinTexto)
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={activo}
                data-fila={i}
                onMouseMove={() => pc && setSel(i)}
                onClick={() => abrir(item)}
                className={cn(
                  'grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 text-left',
                  'border-b border-border last:border-b-0',
                  pc ? 'px-5 py-2' : 'min-h-11 px-4 py-2.5',
                  activo && 'border-transparent bg-[var(--sidebar-active)]',
                )}
              >
                <span className={cn('min-w-0 truncate', pc ? 'text-subhead' : 'text-body', activo && 'text-[var(--sidebar-active-foreground)]')}>
                  {resaltar(item.titulo, consulta).map((t, k) =>
                    t.marca ? <strong key={k} className="font-semibold">{t.texto}</strong> : <span key={k}>{t.texto}</span>,
                  )}
                </span>
                <span className="whitespace-nowrap text-footnote tabular-nums text-muted-foreground">
                  {item.codigo ?? ''}
                </span>
                {(!pc || sinTexto) && item.detalle && (
                  <span className="col-span-2 truncate text-footnote text-muted-foreground">{item.detalle}</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
      {sinResultados && (
        <p className={cn('text-subhead text-muted-foreground', pc ? 'px-5 py-6' : 'px-4 py-6')}>
          Nada coincide con «{consulta.trim()}». Prueba con el código SAP o una parte del nombre.
        </p>
      )}
      {!sinTexto && estadoRep === 'cargando' && (
        <p className={cn('text-footnote text-muted-foreground', pc ? 'px-5 py-2' : 'px-4 py-2')}>Cargando el índice de repuestos…</p>
      )}
      {!sinTexto && estadoRep === 'error' && (
        <p className={cn('text-footnote text-muted-foreground', pc ? 'px-5 py-2' : 'px-4 py-2')}>
          No se pudo leer el índice de repuestos. Revisa la conexión y vuelve a abrir el buscador.
        </p>
      )}
    </div>
  )

  const expediente = actual && (
    <div className="min-h-0 overflow-y-auto px-6 py-5" aria-live="polite">
      <div className="text-footnote text-muted-foreground">
        {NOMBRE_TIPO[actual.tipo]}
      </div>
      <h3 className="mt-0.5 text-title2 font-bold [text-wrap:balance]">{actual.titulo}</h3>
      <dl className="mt-4 grid grid-cols-[120px_1fr] border-t border-border text-subhead">
        {actual.codigo && (
          <>
            <dt className="border-b border-border py-2 text-footnote text-muted-foreground">Código SAP</dt>
            <dd className="border-b border-border py-2 font-mono tabular-nums">{actual.codigo}</dd>
          </>
        )}
        {actual.detalle && (
          <>
            <dt className="border-b border-border py-2 text-footnote text-muted-foreground">
              {actual.tipo === 'equipo' ? 'Ubicación' : actual.tipo === 'turno' ? 'Horario' : 'Detalle'}
            </dt>
            <dd className="border-b border-border py-2">{actual.detalle}</dd>
          </>
        )}
      </dl>
      <div className="mt-4 grid border-t border-border">
        {(actual.accesos ?? [{ etiqueta: 'Abrir', href: actual.href }]).map((a, i) => (
          <button
            key={a.href + a.etiqueta}
            type="button"
            onClick={() => abrir(actual, a.href)}
            className="flex items-baseline justify-between border-b border-border py-2 text-left text-subhead text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>{a.etiqueta}</span>
            {i < 2 && <span className="text-footnote text-muted-foreground">{i === 0 ? '↵' : 'Ctrl ↵'}</span>}
          </button>
        ))}
      </div>
    </div>
  )

  const campo = (
    <input
      autoFocus
      value={consulta}
      onChange={(e) => setConsulta(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={pc ? 'Equipo, repuesto, código SAP, ficha o turno' : 'Equipo, repuesto o SAP'}
      aria-label="Buscar en la app"
      role="combobox"
      aria-expanded
      aria-autocomplete="list"
      enterKeyHint="go"
      autoComplete="off"
      spellCheck={false}
      className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
    />
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn('fixed inset-0 z-[110]', pc ? 'bg-black/30' : 'bg-card')} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'fixed z-[110] flex flex-col overflow-hidden bg-card text-foreground focus:outline-none',
            pc
              ? 'left-1/2 top-[10vh] h-[min(560px,80vh)] w-[min(960px,calc(100vw-48px))] -translate-x-1/2 rounded-[16px] border border-card-edge shadow-2xl'
              : 'inset-0 pt-[env(safe-area-inset-top,0px)]',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Buscador rápido</DialogPrimitive.Title>
          {pc ? (
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
              <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
              {campo}
              <kbd className="rounded-[5px] border border-border px-1.5 font-sans text-footnote text-muted-foreground">Esc</kbd>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2.5 px-4 pb-3 pt-2">
              <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-muted px-2.5">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {campo}
                {consulta && (
                  <button type="button" onClick={() => setConsulta('')} aria-label="Borrar" className="-mr-1 grid size-7 place-items-center text-muted-foreground">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <DialogPrimitive.Close className="min-h-11 text-body text-primary">Cancelar</DialogPrimitive.Close>
            </div>
          )}

          {pc ? (
            <div className="grid min-h-0 flex-1 grid-cols-[420px_1fr]">
              <div className="flex min-h-0 flex-col border-r border-border">{lista}</div>
              {expediente ?? <div />}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">{lista}</div>
          )}

          {pc && (
            <div className="flex shrink-0 gap-4 border-t border-border px-5 py-2.5 text-footnote text-muted-foreground">
              <span>↑ ↓ mover</span>
              <span>↵ abrir</span>
              <span>Ctrl ↵ segundo acceso</span>
              <span>Esc cerrar</span>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
