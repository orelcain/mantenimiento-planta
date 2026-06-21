import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Download, FolderArchive, Image as ImageIcon, QrCode, Star, X, Zap } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import * as XLSX from 'xlsx'
import { Badge, Button, Card, CardContent, Input } from '@/components/ui'
import { getEquipments } from '@/services/equipment'
import { useAuthStore } from '@/store'
import { useEquipmentFavorites } from '@/hooks/useEquipmentFavorites'
import { logger } from '@/lib/logger'
import type { Equipment, FichaTecnica } from '@/types'

/**
 * Centro Técnico Documental — portada / panel del programa (EMP · NFPA 70B).
 *
 * Vista a nivel programa sobre la colección `equipment`: KPIs (criticidad,
 * condición, inspecciones vencidas, fichas incompletas), filtros (criticidad/
 * condición/vencida/incompleta, estado, favoritos) y tabla de equipos que entra
 * al expediente. Reúne lo útil de Equipos (favoritos compartidos, filtro por
 * estado, foto/QR, acceso directo a la pestaña Tablero) sin duplicar datos.
 * Ver `docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md`.
 */

const CRIT: Record<Equipment['criticidad'], { nivel: string; cls: string }> = {
  alta: { nivel: 'A', cls: 'border-red-500 text-red-600' },
  media: { nivel: 'B', cls: 'border-amber-500 text-amber-600' },
  baja: { nivel: 'C', cls: 'border-emerald-500 text-emerald-600' },
}

const ESTADO: Record<Equipment['estado'], { label: string; cls: string }> = {
  operativo: { label: 'Operativo', cls: 'border-emerald-500 text-emerald-600' },
  en_mantenimiento: { label: 'En mantención', cls: 'border-amber-500 text-amber-600' },
  fuera_servicio: { label: 'Fuera de servicio', cls: 'border-red-500 text-red-600' },
}

const COND_EMOJI: Record<1 | 2 | 3, string> = { 1: '🟢', 2: '🟡', 3: '🔴' }

const PLACA_FIELDS: (keyof FichaTecnica)[] = [
  'potenciaKw',
  'voltajeV',
  'corrienteA',
  'rpm',
  'factorServicio',
  'claseAislamiento',
  'gradoIP',
]

function completitud(eq: Equipment): number {
  const ft = eq.fichaTecnica
  if (!ft) return 0
  const filled = PLACA_FIELDS.filter((k) => {
    const v = ft[k]
    return v !== undefined && v !== null && v !== ''
  }).length
  return Math.round((filled / PLACA_FIELDS.length) * 100)
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function diasVencida(iso?: string): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const diff = startOfToday() - t
  return diff > 0 ? Math.floor(diff / 86400000) : null
}

/** URL pública del equipo para el código QR (misma convención que EquipmentPage). */
function qrUrl(equipmentId: string): string {
  return `${window.location.origin}/mantenimiento-planta/public/equipment/${equipmentId}`
}

type Filtro = 'todos' | 'A' | 'cond3' | 'vencida' | 'incompleta' | 'favoritos'
type EstadoFiltro = 'all' | Equipment['estado']

export function CentroTecnicoDocumentalPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { favorites, toggleFavorite } = useEquipmentFavorites(user?.id)

  const [equipos, setEquipos] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('all')
  const [q, setQ] = useState('')
  const [qrEquipo, setQrEquipo] = useState<Equipment | null>(null)

  useEffect(() => {
    let alive = true
    getEquipments()
      .then((rows) => {
        if (alive) setEquipos(rows.filter((e) => !e.deleted))
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
  }, [])

  const kpis = useMemo(() => {
    let critA = 0
    let cond3 = 0
    let vencidas = 0
    let incompletas = 0
    let favs = 0
    for (const e of equipos) {
      if (e.criticidad === 'alta') critA++
      if (e.fichaTecnica?.condicion === 3) cond3++
      if (diasVencida(e.fichaTecnica?.proximaInspeccion) !== null) vencidas++
      if (completitud(e) < 100) incompletas++
      if (favorites.has(e.id)) favs++
    }
    return { total: equipos.length, critA, cond3, vencidas, incompletas, favs }
  }, [equipos, favorites])

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase()
    const rows = equipos.filter((e) => {
      if (term && !`${e.nombre} ${e.codigo}`.toLowerCase().includes(term)) return false
      if (estadoFiltro !== 'all' && e.estado !== estadoFiltro) return false
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
        default:
          return true
      }
    })
    // Orden: criticidad (A>B>C), luego condición peor primero
    const critRank: Record<Equipment['criticidad'], number> = { alta: 0, media: 1, baja: 2 }
    return rows.sort((a, b) => {
      const c = critRank[a.criticidad] - critRank[b.criticidad]
      if (c !== 0) return c
      return (b.fichaTecnica?.condicion ?? 0) - (a.fichaTecnica?.condicion ?? 0)
    })
  }, [equipos, filtro, estadoFiltro, q, favorites])

  const chips: { key: Filtro; label: string }[] = [
    { key: 'todos', label: `Todos (${kpis.total})` },
    { key: 'favoritos', label: `★ Favoritos (${kpis.favs})` },
    { key: 'A', label: `Criticidad A (${kpis.critA})` },
    { key: 'cond3', label: `Condición 🔴 (${kpis.cond3})` },
    { key: 'vencida', label: `Inspección vencida (${kpis.vencidas})` },
    { key: 'incompleta', label: `Ficha incompleta (${kpis.incompletas})` },
  ]

  const estadoChips: { key: EstadoFiltro; label: string }[] = [
    { key: 'all', label: 'Todos los estados' },
    { key: 'operativo', label: ESTADO.operativo.label },
    { key: 'en_mantenimiento', label: ESTADO.en_mantenimiento.label },
    { key: 'fuera_servicio', label: ESTADO.fuera_servicio.label },
  ]

  // Exporta el programa (filtro actual) a Excel — handoff de auditoría NFPA 70B.
  function exportarExcel() {
    const rows = visibles.map((e) => {
      const dias = diasVencida(e.fichaTecnica?.proximaInspeccion)
      return {
        'Código': e.codigo,
        'Equipo': e.nombre,
        'Ubicación': e.hierarchyPath ?? e.zoneId ?? '',
        'Favorito': favorites.has(e.id) ? 'Sí' : 'No',
        'Criticidad': CRIT[e.criticidad].nivel,
        'Condición': e.fichaTecnica?.condicion ?? '',
        'Estado': ESTADO[e.estado].label,
        'Vida útil (años)': e.fichaTecnica?.vidaUtilAnios ?? '',
        'Frecuencia (días)': e.fichaTecnica?.frecuenciaInspeccionDias ?? '',
        'Próx. inspección': e.fichaTecnica?.proximaInspeccion ?? '',
        'Vencida': dias !== null ? 'Sí' : 'No',
        'Días vencida': dias ?? '',
        'Ficha (%)': completitud(e),
        'Marca': e.marca ?? '',
        'Modelo': e.modelo ?? '',
        'N° serie': e.numeroSerie ?? '',
        'Potencia (kW)': e.fichaTecnica?.potenciaKw ?? '',
        'Voltaje (V)': e.fichaTecnica?.voltajeV ?? '',
        'Corriente (A)': e.fichaTecnica?.corrienteA ?? '',
        'RPM': e.fichaTecnica?.rpm ?? '',
      }
    })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Programa NFPA 70B')
    XLSX.writeFile(wb, `centro-tecnico-documental-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FolderArchive className="h-5 w-5" /> Centro Técnico Documental
          </h1>
          <p className="text-sm text-muted-foreground">Programa de mantenimiento eléctrico · EMP · NFPA 70B</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportarExcel} disabled={loading || visibles.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar (Excel)
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { n: kpis.total, l: 'Equipos', cls: '' },
          { n: kpis.critA, l: 'Criticidad A', cls: 'text-red-600' },
          { n: kpis.cond3, l: 'Condición 🔴', cls: 'text-red-600' },
          { n: kpis.vencidas, l: 'Inspección vencida', cls: 'text-amber-600' },
          { n: kpis.incompletas, l: 'Ficha incompleta', cls: 'text-amber-600' },
        ].map((k) => (
          <Card key={k.l}>
            <CardContent className="p-3 text-center">
              <div className={`text-2xl font-extrabold leading-none ${k.cls}`}>{k.n}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{k.l}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Búsqueda */}
      <Input
        placeholder="Buscar equipo por nombre o código…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />

      {/* Filtros NFPA 70B + favoritos */}
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFiltro(c.key)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              filtro === c.key ? 'border-primary text-primary font-semibold' : 'border-border text-muted-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Estado</span>
        {estadoChips.map((c) => (
          <button
            key={c.key}
            onClick={() => setEstadoFiltro(c.key)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              estadoFiltro === c.key ? 'border-primary text-primary font-semibold' : 'border-border text-muted-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground italic">Cargando equipos…</p>
          ) : visibles.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground italic">No hay equipos para este filtro.</p>
          ) : (
            <div className="divide-y">
              {visibles.map((e) => {
                const crit = CRIT[e.criticidad]
                const est = ESTADO[e.estado]
                const cond = e.fichaTecnica?.condicion
                const dias = diasVencida(e.fichaTecnica?.proximaInspeccion)
                const prox = e.fichaTecnica?.proximaInspeccion
                const pct = completitud(e)
                const foto = e.photos?.[0]
                const isFav = favorites.has(e.id)
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-muted/40 cursor-pointer"
                    onClick={() => navigate(`/equipment?abrir=${e.id}&tab=ficha`)}
                  >
                    {/* Favorito */}
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation()
                        toggleFavorite(e.id)
                      }}
                      title={isFav ? 'Quitar de favoritos' : 'Marcar como favorito'}
                      aria-label={isFav ? 'Quitar de favoritos' : 'Marcar como favorito'}
                      className="shrink-0 p-1 -m-1"
                    >
                      <Star className={`h-4 w-4 ${isFav ? 'fill-current text-yellow-500' : 'text-muted-foreground'}`} />
                    </button>

                    {/* Foto */}
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center">
                      {foto ? (
                        <img src={foto} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* Nombre + código */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{e.nombre}</div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">{e.codigo}</div>
                      {/* Meta compacta en móvil */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs md:hidden">
                        <Badge variant="outline" className={`${crit.cls}`}>{crit.nivel}</Badge>
                        {cond ? <span>{COND_EMOJI[cond]}</span> : null}
                        <Badge variant="outline" className={`${est.cls}`}>{est.label}</Badge>
                        <span className={pct < 100 ? 'text-amber-600' : 'text-emerald-600'}>{pct > 0 ? `${pct}%` : '—'}</span>
                      </div>
                    </div>

                    {/* Meta en escritorio */}
                    <div className="hidden md:flex items-center gap-3 shrink-0 text-sm">
                      <Badge variant="outline" className={`${crit.cls} text-xs`}>{crit.nivel}</Badge>
                      <span className="w-6 text-center">{cond ? COND_EMOJI[cond] : <span className="text-muted-foreground">—</span>}</span>
                      <Badge variant="outline" className={`${est.cls} text-xs`}>{est.label}</Badge>
                      <span className={`w-28 text-right ${dias !== null ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                        {dias !== null ? `vencida ${dias} d` : prox ? new Date(prox).toLocaleDateString() : '—'}
                      </span>
                      <span className={`w-10 text-right ${pct < 100 ? 'text-amber-600' : 'text-emerald-600'}`}>{pct > 0 ? `${pct}%` : '—'}</span>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hidden sm:inline-flex"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          navigate(`/equipment?abrir=${e.id}&tab=ficha`)
                        }}
                      >
                        Abrir <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Abrir Tablero del equipo"
                        aria-label="Abrir Tablero del equipo"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          navigate(`/equipment?abrir=${e.id}&tab=tablero`)
                        }}
                      >
                        <Zap className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Ver código QR"
                        aria-label="Ver código QR"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setQrEquipo(e)
                        }}
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        “Abrir” lleva al expediente del equipo → pestaña <strong>Ficha NFPA 70B</strong>; el rayo abre la pestaña{' '}
        <strong>Tablero</strong>. “Ficha %” = completitud de la placa. Los favoritos se comparten con la página de Equipos.
      </p>

      {/* Modal QR */}
      {qrEquipo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setQrEquipo(null)}
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-xs" onClick={(ev) => ev.stopPropagation()}>
            <CardContent className="p-5 space-y-3 text-center">
              <div className="flex items-start justify-between gap-2">
                <div className="text-left">
                  <div className="text-sm font-semibold">Código QR</div>
                  <div className="text-xs text-muted-foreground">{qrEquipo.nombre}</div>
                </div>
                <button onClick={() => setQrEquipo(null)} aria-label="Cerrar" className="p-1 -m-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex justify-center">
                <QRCodeSVG value={qrUrl(qrEquipo.id)} size={196} data-qr={qrEquipo.id} />
              </div>
              <div className="text-[11px] text-muted-foreground font-mono break-all">{qrEquipo.codigo}</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
