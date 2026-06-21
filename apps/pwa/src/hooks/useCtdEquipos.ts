import { useEffect, useMemo, useState } from 'react'
import { getEquipments } from '@/services/equipment'
import { getOpenWorkOrders } from '@/services/workOrders'
import { useAppStore } from '@/store'
import { logger } from '@/lib/logger'
import {
  ESTADO,
  ITEMS_PER_PAGE,
  bucketDe,
  completitud,
  contarOtPorEquipo,
  diasVencida,
  lineaDe,
  proximaMs,
  seccionDe,
} from '@/lib/ctd'
import type { Bucket, EstadoFiltro, Filtro, OrdenCampo, OtCount, Vista } from '@/lib/ctd'
import { FAMILIAS, familiaDe } from '@/lib/nfpa70b'
import type { Familia } from '@/lib/nfpa70b'
import type { Equipment } from '@/types'

/**
 * Estado y derivaciones del listado del Centro Técnico Documental (a nivel
 * programa): carga de equipos, filtros, KPIs, búsqueda con debounce, orden,
 * paginación y agenda. Mantiene fuera el expediente (panel del equipo abierto),
 * que vive en la página. Extraído de `CentroTecnicoDocumentalPage` para acotar
 * el componente (~1900 líneas).
 *
 * `favorites` se recibe por parámetro (la dueña del set es la página, que lo
 * comparte con Equipos vía `useEquipmentFavorites`).
 */
export function useCtdEquipos(favorites: Set<string>) {
  const { equipment, setEquipment } = useAppStore()

  const [loading, setLoading] = useState(() => equipment.length === 0)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('all')
  const [seccionFiltro, setSeccionFiltro] = useState<string>('all')
  const [lineaFiltro, setLineaFiltro] = useState<string>('all')
  const [tipoFiltro, setTipoFiltro] = useState<string>('all')
  const [familiaFiltro, setFamiliaFiltro] = useState<Familia | 'all'>('all')
  const [orden, setOrden] = useState<OrdenCampo>('criticidad')
  const [compact, setCompact] = useState(false)
  const [vista, setVista] = useState<Vista>('lista')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  // OT abiertas/vencidas por equipo (nivel programa) — para KPIs, filtros y badges.
  const [otByEquipo, setOtByEquipo] = useState<Map<string, OtCount>>(() => new Map())

  useEffect(() => {
    let alive = true
    getEquipments()
      .then((rows) => {
        if (alive) setEquipment(rows)
      })
      .catch((err) =>
        logger.error('Error cargando equipos (Centro Técnico Documental)', err instanceof Error ? err : new Error(String(err))),
      )
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [setEquipment])

  // Carga las OT abiertas de toda la planta (1 query) → conteo por equipo.
  useEffect(() => {
    let alive = true
    getOpenWorkOrders()
      .then((rows) => {
        if (alive) setOtByEquipo(contarOtPorEquipo(rows))
      })
      .catch((err) => {
        logger.error('Error cargando OT abiertas (CTD)', err instanceof Error ? err : new Error(String(err)))
        if (alive) setOtByEquipo(new Map())
      })
    return () => {
      alive = false
    }
  }, [])

  async function reload() {
    const fresh = await getEquipments()
    setEquipment(fresh)
  }

  const equipos = useMemo(() => equipment.filter((e) => !e.deleted), [equipment])

  const kpis = useMemo(() => {
    let critA = 0
    let cond3 = 0
    let vencidas = 0
    let incompletas = 0
    let favs = 0
    let otAbiertas = 0
    let otVencidas = 0
    for (const e of equipos) {
      if (e.criticidad === 'alta') critA++
      if (e.fichaTecnica?.condicion === 3) cond3++
      if (diasVencida(e.fichaTecnica?.proximaInspeccion) !== null) vencidas++
      if (completitud(e) < 100) incompletas++
      if (favorites.has(e.id)) favs++
      const ot = otByEquipo.get(e.id)
      if (ot && ot.abiertas > 0) otAbiertas++
      if (ot && ot.vencidas > 0) otVencidas++
    }
    return { total: equipos.length, critA, cond3, vencidas, incompletas, favs, otAbiertas, otVencidas }
  }, [equipos, favorites, otByEquipo])

  const secciones = useMemo(() => {
    const set = new Set<string>()
    for (const e of equipos) {
      const s = seccionDe(e)
      if (s) set.add(s)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [equipos])

  // Líneas dependientes de la sección elegida (cascada).
  const lineas = useMemo(() => {
    const set = new Set<string>()
    for (const e of equipos) {
      if (seccionFiltro !== 'all' && seccionDe(e) !== seccionFiltro) continue
      const l = lineaDe(e)
      if (l) set.add(l)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [equipos, seccionFiltro])

  const tipos = useMemo(() => {
    const set = new Set<string>()
    for (const e of equipos) {
      const t = e.tipo?.trim()
      if (t) set.add(t)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [equipos])

  // Familias eléctricas (NFPA 70B) presentes, con conteo, en orden normativo.
  const familias = useMemo(() => {
    const counts = new Map<Familia, number>()
    for (const e of equipos) {
      const f = familiaDe(e)
      counts.set(f, (counts.get(f) ?? 0) + 1)
    }
    return FAMILIAS.filter((f) => counts.has(f)).map((f) => ({ key: f, n: counts.get(f) ?? 0 }))
  }, [equipos])

  const visibles = useMemo(() => {
    const term = debouncedQ.trim().toLowerCase()
    const rows = equipos.filter((e) => {
      if (term && !`${e.nombre} ${e.codigo}`.toLowerCase().includes(term)) return false
      if (estadoFiltro !== 'all' && e.estado !== estadoFiltro) return false
      if (seccionFiltro !== 'all' && seccionDe(e) !== seccionFiltro) return false
      if (lineaFiltro !== 'all' && lineaDe(e) !== lineaFiltro) return false
      if (tipoFiltro !== 'all' && (e.tipo ?? '') !== tipoFiltro) return false
      if (familiaFiltro !== 'all' && familiaDe(e) !== familiaFiltro) return false
      switch (filtro) {
        case 'A':
          return e.criticidad === 'alta'
        case 'cond3':
          return e.fichaTecnica?.condicion === 3
        case 'vencida':
          return diasVencida(e.fichaTecnica?.proximaInspeccion) !== null
        case 'incompleta':
          return completitud(e) < 100
        case 'favoritos':
          return favorites.has(e.id)
        case 'otAbiertas':
          return (otByEquipo.get(e.id)?.abiertas ?? 0) > 0
        case 'otVencidas':
          return (otByEquipo.get(e.id)?.vencidas ?? 0) > 0
        default:
          return true
      }
    })
    const critRank: Record<Equipment['criticidad'], number> = { alta: 0, media: 1, baja: 2 }
    const sorted = [...rows]
    switch (orden) {
      case 'proxima':
        sorted.sort((a, b) => proximaMs(a) - proximaMs(b))
        break
      case 'ficha':
        sorted.sort((a, b) => completitud(a) - completitud(b))
        break
      case 'area':
        sorted.sort(
          (a, b) =>
            (seccionDe(a) ?? '').localeCompare(seccionDe(b) ?? '', 'es') ||
            (lineaDe(a) ?? '').localeCompare(lineaDe(b) ?? '', 'es') ||
            a.nombre.localeCompare(b.nombre, 'es'),
        )
        break
      case 'nombre':
        sorted.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        break
      default:
        // criticidad (A>B>C), luego condición peor primero
        sorted.sort((a, b) => {
          const c = critRank[a.criticidad] - critRank[b.criticidad]
          if (c !== 0) return c
          return (b.fichaTecnica?.condicion ?? 0) - (a.fichaTecnica?.condicion ?? 0)
        })
    }
    return sorted
  }, [equipos, filtro, estadoFiltro, seccionFiltro, lineaFiltro, tipoFiltro, familiaFiltro, orden, debouncedQ, favorites, otByEquipo])

  const totalPages = Math.max(1, Math.ceil(visibles.length / ITEMS_PER_PAGE))
  const pageSafe = Math.min(page, totalPages)
  const paginated = useMemo(
    () => visibles.slice((pageSafe - 1) * ITEMS_PER_PAGE, pageSafe * ITEMS_PER_PAGE),
    [visibles, pageSafe],
  )

  // Debounce de la búsqueda (evita refiltrar en cada tecla)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(id)
  }, [q])

  // Volver a la página 1 cuando cambian filtros/orden/búsqueda
  useEffect(() => {
    setPage(1)
  }, [filtro, estadoFiltro, seccionFiltro, lineaFiltro, tipoFiltro, familiaFiltro, orden, debouncedQ])

  // Al cambiar de sección, la línea elegida deja de aplicar (cascada)
  useEffect(() => {
    setLineaFiltro('all')
  }, [seccionFiltro])

  // Agenda: agrupa los equipos filtrados por ventana de próxima inspección.
  const agenda = useMemo(() => {
    const groups: Record<Bucket, Equipment[]> = { vencidas: [], d30: [], d60: [], d90: [], futuro: [], sin: [] }
    for (const e of visibles) groups[bucketDe(e)].push(e)
    for (const k of Object.keys(groups) as Bucket[]) groups[k].sort((a, b) => proximaMs(a) - proximaMs(b))
    return groups
  }, [visibles])

  // KPIs enfocados en el ALMACÉN documental (foco: qué hay y qué falta documentar).
  // Las superficies de programa —condición 🔴, inspección vencida, OT— quedan
  // acalladas; su lógica (kpis.cond3/vencidas/otAbiertas/otVencidas, filtros) sigue
  // disponible en el hook por si se reactiva en los críticos.
  const kpiFiltros: { key: Filtro; label: string; n: number; cls?: string }[] = [
    { key: 'todos', label: 'Equipos', n: kpis.total },
    { key: 'A', label: 'Criticidad A', n: kpis.critA, cls: 'text-red-600' },
    { key: 'incompleta', label: 'Ficha incompleta', n: kpis.incompletas, cls: 'text-amber-600' },
    { key: 'favoritos', label: '★ Favoritos', n: kpis.favs, cls: 'text-yellow-600' },
  ]

  const estadoChips: { key: EstadoFiltro; label: string }[] = [
    { key: 'all', label: 'Todos los estados' },
    { key: 'operativo', label: ESTADO.operativo.label },
    { key: 'en_mantenimiento', label: ESTADO.en_mantenimiento.label },
    { key: 'fuera_servicio', label: ESTADO.fuera_servicio.label },
  ]

  const filtrosActivos =
    filtro !== 'todos' ||
    estadoFiltro !== 'all' ||
    seccionFiltro !== 'all' ||
    lineaFiltro !== 'all' ||
    tipoFiltro !== 'all' ||
    familiaFiltro !== 'all' ||
    q.trim() !== ''
  function limpiarFiltros() {
    setFiltro('todos')
    setEstadoFiltro('all')
    setSeccionFiltro('all')
    setLineaFiltro('all')
    setTipoFiltro('all')
    setFamiliaFiltro('all')
    setQ('')
  }

  return {
    loading,
    // filtros (estado + setters)
    filtro,
    setFiltro,
    estadoFiltro,
    setEstadoFiltro,
    seccionFiltro,
    setSeccionFiltro,
    lineaFiltro,
    setLineaFiltro,
    tipoFiltro,
    setTipoFiltro,
    familiaFiltro,
    setFamiliaFiltro,
    orden,
    setOrden,
    compact,
    setCompact,
    vista,
    setVista,
    page,
    setPage,
    q,
    setQ,
    // derivados
    equipos,
    kpis,
    otByEquipo,
    secciones,
    lineas,
    tipos,
    familias,
    visibles,
    totalPages,
    pageSafe,
    paginated,
    agenda,
    kpiFiltros,
    estadoChips,
    filtrosActivos,
    limpiarFiltros,
    reload,
  }
}
