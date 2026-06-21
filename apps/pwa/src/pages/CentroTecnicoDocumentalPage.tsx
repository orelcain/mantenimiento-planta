import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Check,
  ChevronRight,
  Download,
  Edit2,
  FolderArchive,
  Image as ImageIcon,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import * as XLSX from 'xlsx'
import { Badge, Button, Card, CardContent, Input, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui'
import { addEquipmentPhoto, getEquipments, removeEquipmentPhoto } from '@/services/equipment'
import { getIncidents } from '@/services/incidents'
import { useAppStore, useAuthStore } from '@/store'
import { useEquipmentFavorites } from '@/hooks/useEquipmentFavorites'
import { useEquipmentNotes } from '@/hooks/useEquipmentNotes'
import type { EquipmentNote } from '@/hooks/useEquipmentNotes'
import { usePermissions } from '@/hooks/usePermissions'
import { EquipmentForm } from '@/components/equipment/EquipmentForm'
import { FichaTecnicaNFPA70B } from '@/components/equipment/FichaTecnicaNFPA70B'
import { TableroExpediente } from '@/components/equipment/TableroExpediente'
import { logger } from '@/lib/logger'
import type { Equipment, FichaTecnica, Incident } from '@/types'

/**
 * Centro Técnico Documental — portada / panel del programa (EMP · NFPA 70B).
 *
 * Vista a nivel programa sobre la colección `equipment`: KPIs, filtros y tabla.
 * El expediente del equipo (Información editable, Ficha NFPA 70B, Tablero,
 * Fotos con subida/borrado, Notas, QR) se abre EN SITIO en un panel del propio
 * CTD —reusando `EquipmentForm`, `FichaTecnicaNFPA70B` y `TableroExpediente`—,
 * sin saltar a la página de Equipos. Lee del store global. No duplica datos.
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
  const user = useAuthStore((s) => s.user)
  const { equipment, setEquipment } = useAppStore()
  const { canEditEquipment } = usePermissions()
  const { favorites, toggleFavorite } = useEquipmentFavorites(user?.id)
  const { notesFor, addNote, editNote, deleteNote } = useEquipmentNotes(user?.id)

  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(() => equipment.length === 0)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('all')
  const [q, setQ] = useState('')

  // Expediente en sitio (sin salto a Equipos). El equipo abierto y la pestaña
  // viven en la URL (?eq=<id>&tab=<tab>) → deep-link, refresh y botón atrás.
  const detailId = searchParams.get('eq')
  const detailTab = searchParams.get('tab') ?? 'info'
  const [detailIncidents, setDetailIncidents] = useState<Incident[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)

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

  const equipos = useMemo(() => equipment.filter((e) => !e.deleted), [equipment])

  const detailEquipment = useMemo(
    () => (detailId ? equipos.find((e) => e.id === detailId) ?? null : null),
    [detailId, equipos],
  )

  // Cargar incidencias del equipo abierto (para la timeline de la Ficha)
  useEffect(() => {
    if (!detailId) {
      setDetailIncidents([])
      return
    }
    let alive = true
    getIncidents({ equipmentId: detailId, limit: 50 })
      .then((rows) => {
        if (alive) setDetailIncidents(rows)
      })
      .catch((err) => {
        logger.error('Error cargando incidencias del expediente', err instanceof Error ? err : new Error(String(err)))
        if (alive) setDetailIncidents([])
      })
    return () => {
      alive = false
    }
  }, [detailId])

  function openExpediente(id: string, tab: string = 'info') {
    const p = new URLSearchParams(searchParams)
    p.set('eq', id)
    p.set('tab', tab)
    setSearchParams(p)
    setLightbox(null)
  }

  function setDetailTab(tab: string) {
    const p = new URLSearchParams(searchParams)
    p.set('tab', tab)
    setSearchParams(p, { replace: true })
  }

  function closeExpediente() {
    const p = new URLSearchParams(searchParams)
    p.delete('eq')
    p.delete('tab')
    setSearchParams(p)
  }

  // Bloquear scroll de fondo + cerrar con Esc mientras hay un panel abierto.
  useEffect(() => {
    if (!detailId && !lightbox && !editingEquipment) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || editingEquipment) return // el form (Radix) maneja su Esc
      if (lightbox) {
        setLightbox(null)
      } else if (detailId) {
        const p = new URLSearchParams(searchParams)
        p.delete('eq')
        p.delete('tab')
        setSearchParams(p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [detailId, lightbox, editingEquipment, searchParams, setSearchParams])

  async function reload() {
    const fresh = await getEquipments()
    setEquipment(fresh)
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0 || !detailEquipment || !canEditEquipment) return
    setPhotoUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file) await addEquipmentPhoto(detailEquipment.id, file)
      }
      await reload()
    } catch (e: unknown) {
      logger.error('Photo upload failed (CTD)', e instanceof Error ? e : new Error('Error al subir fotos'))
      alert('No se pudieron subir las fotos. Intenta de nuevo.')
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handlePhotoDelete(photoUrl: string) {
    if (!detailEquipment || !canEditEquipment) return
    if (!window.confirm('¿Eliminar esta foto?')) return
    try {
      await removeEquipmentPhoto(detailEquipment.id, photoUrl)
      await reload()
    } catch (e: unknown) {
      logger.error('Photo delete failed (CTD)', e instanceof Error ? e : new Error('Error al eliminar foto'))
      alert('No se pudo eliminar la foto. Intenta de nuevo.')
    }
  }

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

  const filtrosActivos = filtro !== 'todos' || estadoFiltro !== 'all' || q.trim() !== ''
  function limpiarFiltros() {
    setFiltro('todos')
    setEstadoFiltro('all')
    setQ('')
  }

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

      {/* Conteo + limpiar filtros */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {loading ? 'Cargando…' : `Mostrando ${visibles.length} de ${kpis.total} equipos`}
        </span>
        {filtrosActivos && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
            Limpiar filtros
          </Button>
        )}
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
                    onClick={() => openExpediente(e.id, 'info')}
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
                          openExpediente(e.id, 'info')
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
                          openExpediente(e.id, 'tablero')
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
                          openExpediente(e.id, 'qr')
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
        El expediente (Información, Ficha NFPA 70B, Tablero, Fotos, Notas, QR) se abre aquí mismo, sin salir del CTD. “Ficha
        %” = completitud de la placa. Favoritos y notas se comparten con la página de Equipos.
      </p>

      {/* Expediente en sitio */}
      {detailEquipment && (
        <ExpedienteDialog
          equipment={detailEquipment}
          incidents={detailIncidents}
          tab={detailTab}
          onTabChange={setDetailTab}
          isFavorite={favorites.has(detailEquipment.id)}
          onToggleFavorite={() => toggleFavorite(detailEquipment.id)}
          onClose={closeExpediente}
          onLightbox={setLightbox}
          canEdit={canEditEquipment}
          onEdit={() => setEditingEquipment(detailEquipment)}
          photoUploading={photoUploading}
          onPhotoUpload={handlePhotoUpload}
          onPhotoDelete={handlePhotoDelete}
          notes={notesFor(detailEquipment.id)}
          onAddNote={(text) => addNote(detailEquipment.id, text)}
          onEditNote={(noteId, text) => editNote(detailEquipment.id, noteId, text)}
          onDeleteNote={(noteId) => deleteNote(detailEquipment.id, noteId)}
        />
      )}

      {/* Editor de datos básicos (reusa el form de Equipos) */}
      {editingEquipment && (
        <EquipmentForm
          equipment={editingEquipment}
          onClose={() => setEditingEquipment(null)}
          onSuccess={async () => {
            await reload()
            setEditingEquipment(null)
          }}
        />
      )}

      {/* Lightbox de fotos (por encima del expediente) */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-full rounded" />
        </div>
      )}
    </div>
  )
}

function ExpedienteDialog({
  equipment,
  incidents,
  tab,
  onTabChange,
  isFavorite,
  onToggleFavorite,
  onClose,
  onLightbox,
  canEdit,
  onEdit,
  photoUploading,
  onPhotoUpload,
  onPhotoDelete,
  notes,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: {
  equipment: Equipment
  incidents: Incident[]
  tab: string
  onTabChange: (tab: string) => void
  isFavorite: boolean
  onToggleFavorite: () => void
  onClose: () => void
  onLightbox: (url: string) => void
  canEdit: boolean
  onEdit: () => void
  photoUploading: boolean
  onPhotoUpload: (files: FileList | null) => void
  onPhotoDelete: (photoUrl: string) => void
  notes: EquipmentNote[]
  onAddNote: (text: string) => void
  onEditNote: (noteId: string, text: string) => void
  onDeleteNote: (noteId: string) => void
}) {
  const crit = CRIT[equipment.criticidad]
  const est = ESTADO[equipment.estado]
  const ubicacion = equipment.hierarchyPath || equipment.zoneId
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [newNoteText, setNewNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <Card className="my-4 w-full max-w-3xl" onClick={(ev) => ev.stopPropagation()}>
        <CardContent className="p-4 md:p-5 space-y-4">
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleFavorite}
                  title={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                  aria-label={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                  className="shrink-0 p-0.5"
                >
                  <Star className={`h-4 w-4 ${isFavorite ? 'fill-current text-yellow-500' : 'text-muted-foreground'}`} />
                </button>
                <h2 className="text-lg font-bold truncate">{equipment.nombre}</h2>
              </div>
              <div className="text-xs text-muted-foreground font-mono">{equipment.codigo}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`${crit.cls} text-xs`}>Criticidad {crit.nivel}</Badge>
                <Badge variant="outline" className={`${est.cls} text-xs`}>{est.label}</Badge>
                {ubicacion && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> <span className="line-clamp-1">{ubicacion}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Editar
                </Button>
              )}
              <button onClick={onClose} aria-label="Cerrar" className="p-1 -m-1 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <Tabs value={tab} onValueChange={onTabChange}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="info">Información</TabsTrigger>
              <TabsTrigger value="ficha">Ficha NFPA 70B</TabsTrigger>
              <TabsTrigger value="tablero">Tablero</TabsTrigger>
              <TabsTrigger value="fotos">Fotos ({equipment.photos?.length || 0})</TabsTrigger>
              <TabsTrigger value="notas">Notas ({notes.length})</TabsTrigger>
              <TabsTrigger value="qr">QR</TabsTrigger>
            </TabsList>

            <TabsContent value="info">
              <Card>
                <CardContent className="p-4 grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Marca</div>
                    <div className="font-medium">{equipment.marca || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Modelo</div>
                    <div className="font-medium">{equipment.modelo || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Número de serie</div>
                    <div className="font-medium">{equipment.numeroSerie || '—'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Estado</div>
                    <div className="font-medium">{est.label}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-sm text-muted-foreground">Descripción</div>
                    <div className="font-medium whitespace-pre-wrap">{equipment.descripcion || '—'}</div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ficha">
              <FichaTecnicaNFPA70B equipment={equipment} incidents={incidents} />
            </TabsContent>

            <TabsContent value="tablero">
              <TableroExpediente equipment={equipment} />
            </TabsContent>

            <TabsContent value="fotos">
              <Card>
                <CardContent className="p-4 space-y-4">
                  {canEdit && (
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Galería de fotos</h3>
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => onPhotoUpload(e.target.files)}
                          disabled={photoUploading}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={photoUploading}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {photoUploading ? 'Subiendo…' : 'Agregar fotos'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {equipment.photos && equipment.photos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {equipment.photos.map((url, idx) => (
                        <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border">
                          <img
                            src={url}
                            alt={`Foto ${idx + 1}`}
                            className="h-full w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => onLightbox(url)}
                            loading="lazy"
                          />
                          {canEdit && (
                            <button
                              className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Eliminar foto"
                              aria-label="Eliminar foto"
                              onClick={(ev) => {
                                ev.stopPropagation()
                                onPhotoDelete(url)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Sin fotos</p>
                      {!canEdit && <p className="text-sm">Las fotos se agregan con permisos de edición.</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notas">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start gap-2">
                    <Textarea
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Agregar una nota…"
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        onAddNote(newNoteText)
                        setNewNoteText('')
                      }}
                      disabled={!newNoteText.trim()}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Agregar
                    </Button>
                  </div>

                  {notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Sin notas todavía.</p>
                  ) : (
                    <div className="space-y-2">
                      {notes.map((n) => (
                        <div key={n.id} className="rounded-lg border p-3">
                          {editingNoteId === n.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                rows={2}
                              />
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setEditingNoteId(null)}>
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    onEditNote(n.id, editingNoteText)
                                    setEditingNoteId(null)
                                  }}
                                  disabled={!editingNoteText.trim()}
                                >
                                  <Check className="h-4 w-4 mr-1" /> Guardar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm whitespace-pre-wrap break-words">{n.text}</div>
                                <div className="text-[11px] text-muted-foreground mt-1">
                                  {new Date(n.createdAt).toLocaleString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  className="p-1 text-muted-foreground hover:text-foreground"
                                  title="Editar nota"
                                  aria-label="Editar nota"
                                  onClick={() => {
                                    setEditingNoteId(n.id)
                                    setEditingNoteText(n.text)
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  className="p-1 text-muted-foreground hover:text-destructive"
                                  title="Eliminar nota"
                                  aria-label="Eliminar nota"
                                  onClick={() => onDeleteNote(n.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Las notas se guardan en este dispositivo (por usuario) y se comparten con la página de Equipos.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="qr">
              <Card>
                <CardContent className="p-6 flex flex-col items-center gap-3">
                  <div className="text-sm font-medium">Código QR del equipo</div>
                  <QRCodeSVG value={qrUrl(equipment.id)} size={200} data-qr={equipment.id} />
                  <div className="text-xs text-muted-foreground font-mono break-all text-center">{equipment.codigo}</div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
