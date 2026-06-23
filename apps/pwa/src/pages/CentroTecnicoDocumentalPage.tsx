import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
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
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import * as XLSX from 'xlsx'
import { Badge, Button, Card, CardContent, Input, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui'
import { addEquipmentPhoto, removeEquipmentPhoto } from '@/services/equipment'
import { getIncidents } from '@/services/incidents'
import { getMaintenanceLog } from '@/services/maintenanceLog'
import { addMedicion, getMediciones } from '@/services/mediciones'
import { getRepuestosMaestro, linkRepuestoEquipo, unlinkRepuestoEquipo } from '@/services/repuestosLink'
import type { RepuestoMaestroItem } from '@/services/repuestosLink'
import { createWorkOrder, getWorkOrders, updateWorkOrder } from '@/services/workOrders'
import { descargarPlantillaPlaca, importarPlacaExcel } from '@/services/equipmentFichaExcel'
import { generarReporteEquipo } from '@/services/equipmentReportPdf'
import { useAuthStore } from '@/store'
import { useEquipmentFavorites } from '@/hooks/useEquipmentFavorites'
import { useEquipmentNotes } from '@/hooks/useEquipmentNotes'
import type { EquipmentNote } from '@/hooks/useEquipmentNotes'
import { usePermissions } from '@/hooks/usePermissions'
import { useCtdEquipos } from '@/hooks/useCtdEquipos'
import { EquipmentForm } from '@/components/equipment/EquipmentForm'
import { FichaTecnicaNFPA70B } from '@/components/equipment/FichaTecnicaNFPA70B'
import { TableroExpediente } from '@/components/equipment/TableroExpediente'
import { PhotoAnnotationEditor } from '@/components/PhotoAnnotationEditor'
import { useManualesDeEquipos } from '@/hooks/repuestos/useManualesDeEquipos'
import { useRepuestosDeEquipo } from '@/hooks/repuestos/useRepuestosDeEquipo'
import { logger } from '@/lib/logger'
import {
  BUCKETS,
  COND_EMOJI,
  CRIT,
  CRIT_INFO,
  ESTADO,
  ITEMS_PER_PAGE,
  WO_ESTADO,
  WO_PRIORIDAD,
  WO_TIPOS,
  aniosDesde,
  completitud,
  confiabilidad,
  diasVencida,
  formatCosto,
  lineaDe,
  qrUrl,
  seccionDe,
} from '@/lib/ctd'
import type { Bucket, EstadoFiltro, OrdenCampo, OtCount } from '@/lib/ctd'
import { FAMILIA_LABEL, checklistDe, familiaDe, medicionesDe } from '@/lib/nfpa70b'
import type { CampoMedicion } from '@/lib/nfpa70b'
import type { Equipment, Incident, MaintenanceLogEntry, Medicion, WorkOrder } from '@/types'

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

export function CentroTecnicoDocumentalPage() {
  const user = useAuthStore((s) => s.user)
  const { canEditEquipment } = usePermissions()
  const { favorites, toggleFavorite } = useEquipmentFavorites(user?.id)
  const { notesFor, addNote, editNote, deleteNote } = useEquipmentNotes(user?.id)

  // Estado y derivaciones del listado a nivel programa (carga, filtros, KPIs,
  // búsqueda, orden, paginación, agenda) viven en el hook; el expediente del
  // equipo abierto se queda en la página.
  const {
    loading,
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
    setPage,
    q,
    setQ,
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
  } = useCtdEquipos(favorites)

  const [searchParams, setSearchParams] = useSearchParams()

  // Expediente en sitio (sin salto a Equipos). El equipo abierto y la pestaña
  // viven en la URL (?eq=<id>&tab=<tab>) → deep-link, refresh y botón atrás.
  const detailId = searchParams.get('eq')
  const detailTab = searchParams.get('tab') ?? 'info'
  const [detailIncidents, setDetailIncidents] = useState<Incident[]>([])
  const [detailLog, setDetailLog] = useState<MaintenanceLogEntry[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
  const [importingPlaca, setImportingPlaca] = useState(false)
  const placaInputRef = useRef<HTMLInputElement>(null)
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null)
  const [datosMenu, setDatosMenu] = useState(false)

  const detailEquipment = useMemo(
    () => (detailId ? equipos.find((e) => e.id === detailId) ?? null : null),
    [detailId, equipos],
  )

  // Cargar incidencias + historial del equipo abierto (timeline de la Ficha y reporte PDF)
  useEffect(() => {
    if (!detailId) {
      setDetailIncidents([])
      setDetailLog([])
      return
    }
    let alive = true
    Promise.all([getIncidents({ equipmentId: detailId, limit: 50 }), getMaintenanceLog(detailId)])
      .then(([inc, log]) => {
        if (!alive) return
        setDetailIncidents(inc)
        setDetailLog(log)
      })
      .catch((err) => {
        logger.error('Error cargando expediente (incidencias/historial)', err instanceof Error ? err : new Error(String(err)))
        if (alive) {
          setDetailIncidents([])
          setDetailLog([])
        }
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

  async function handleImportPlaca(file: File | null) {
    if (!file) return
    setImportingPlaca(true)
    try {
      const r = await importarPlacaExcel(file, equipos)
      await reload()
      alert(
        `Placa importada: ${r.actualizados} actualizados · ${r.sinCambios} sin cambios · ${r.sinMatch.length} sin match (de ${r.total} filas).`,
      )
    } catch (e: unknown) {
      logger.error('Error importando placa (CTD)', e instanceof Error ? e : new Error('Error al importar placa'))
      alert('No se pudo importar el Excel de placa. Revisa que tenga la columna "Código" y el formato de la plantilla.')
    } finally {
      setImportingPlaca(false)
      if (placaInputRef.current) placaInputRef.current.value = ''
    }
  }

  // Exporta el programa (filtro actual) a Excel — handoff de auditoría NFPA 70B.
  function exportarExcel() {
    const rows = visibles.map((e) => {
      const dias = diasVencida(e.fichaTecnica?.proximaInspeccion)
      return {
        'Código': e.codigo,
        'Equipo': e.nombre,
        'Ubicación': e.hierarchyPath ?? e.zoneId ?? '',
        'Sección': seccionDe(e) ?? '',
        'Línea': lineaDe(e) ?? '',
        'Tipo': e.tipo ?? '',
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

  // Copia al portapapeles los códigos del set filtrado (planificación / compras).
  function copiarCodigos() {
    const codes = visibles.map((e) => e.codigo).join('\n')
    if (!codes) return
    navigator.clipboard
      .writeText(codes)
      .then(() => alert(`${visibles.length} código(s) copiados al portapapeles.`))
      .catch(() => alert('No se pudo copiar al portapapeles.'))
  }

  // Guarda la versión anotada de una foto (reemplaza la original o la agrega como nueva).
  async function handleAnnotatedSave(annotatedImageUrl: string) {
    if (!detailEquipment || !editingPhoto) return
    setPhotoUploading(true)
    try {
      const blob = await (await fetch(annotatedImageUrl)).blob()
      const file = new File([blob], `annotated-${Date.now()}.webp`, { type: 'image/webp' })
      const reemplazar = window.confirm(
        '¿Reemplazar la foto original con la versión anotada? Si cancelas, se agrega como foto nueva.',
      )
      if (reemplazar) await removeEquipmentPhoto(detailEquipment.id, editingPhoto)
      await addEquipmentPhoto(detailEquipment.id, file)
      await reload()
      setEditingPhoto(null)
    } catch (e: unknown) {
      logger.error('Error guardando foto anotada (CTD)', e instanceof Error ? e : new Error('Error foto anotada'))
      alert('No se pudo guardar la foto anotada. Intenta de nuevo.')
    } finally {
      setPhotoUploading(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FolderArchive className="h-5 w-5" /> Centro Técnico Documental
          </h1>
          <p className="text-sm text-muted-foreground">Expediente documental por equipo · placa, documentos y criticidad</p>
        </div>
        <div className="relative">
          <input
            ref={placaInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleImportPlaca(e.target.files?.[0] ?? null)}
          />
          <Button variant="outline" size="sm" onClick={() => setDatosMenu((v) => !v)} disabled={loading}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Datos <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
          {datosMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDatosMenu(false)} />
              <div className="absolute right-0 mt-1 z-20 w-56 rounded-md border bg-background shadow-md p-1 text-sm">
                <button
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-muted/60 disabled:opacity-50"
                  onClick={() => {
                    setDatosMenu(false)
                    exportarExcel()
                  }}
                  disabled={visibles.length === 0}
                >
                  Exportar listado (Excel)
                </button>
                {canEditEquipment && (
                  <>
                    <button
                      className="w-full text-left px-3 py-1.5 rounded hover:bg-muted/60"
                      onClick={() => {
                        setDatosMenu(false)
                        descargarPlantillaPlaca(equipos)
                      }}
                    >
                      Descargar plantilla de placa
                    </button>
                    <button
                      className="w-full text-left px-3 py-1.5 rounded hover:bg-muted/60 disabled:opacity-50"
                      onClick={() => {
                        setDatosMenu(false)
                        placaInputRef.current?.click()
                      }}
                      disabled={importingPlaca}
                    >
                      {importingPlaca ? 'Importando…' : 'Importar placa (Excel)'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* KPIs = filtros rápidos (click para filtrar) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {kpiFiltros.map((k) => {
          const active = filtro === k.key
          return (
            <button
              key={k.key}
              onClick={() => setFiltro(k.key)}
              title={`Filtrar: ${k.label}`}
              className={`rounded-lg border p-3 text-center transition-colors ${
                active ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border hover:bg-muted/40'
              }`}
            >
              <div className={`text-2xl font-extrabold leading-none ${k.cls ?? ''}`}>{k.n}</div>
              <div className="text-[11px] text-muted-foreground mt-1 truncate">{k.label}</div>
            </button>
          )
        })}
      </div>

      {/* Búsqueda */}
      <Input
        placeholder="Buscar equipo por nombre o código…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />

      {/* Vista · Estado · Sección · Línea · Tipo · Orden · Densidad */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border overflow-hidden mr-1">
          <button
            onClick={() => setVista('lista')}
            className={`text-xs px-3 py-1.5 ${vista === 'lista' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
          >
            Lista
          </button>
          <button
            onClick={() => setVista('tarjetas')}
            className={`text-xs px-3 py-1.5 border-l ${vista === 'tarjetas' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
          >
            Tarjetas
          </button>
        </div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Estado</label>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)}
          className="text-xs border rounded-md px-2 py-1.5 bg-background"
          aria-label="Filtrar por estado"
        >
          {estadoChips.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Sección</label>
        <select
          value={seccionFiltro}
          onChange={(e) => setSeccionFiltro(e.target.value)}
          className="text-xs border rounded-md px-2 py-1.5 bg-background max-w-[200px]"
          aria-label="Filtrar por sección"
        >
          <option value="all">Todas ({secciones.length})</option>
          {secciones.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Línea</label>
        <select
          value={lineaFiltro}
          onChange={(e) => setLineaFiltro(e.target.value)}
          className="text-xs border rounded-md px-2 py-1.5 bg-background max-w-[200px] disabled:opacity-50"
          aria-label="Filtrar por línea"
          disabled={lineas.length === 0}
        >
          <option value="all">Todas ({lineas.length})</option>
          {lineas.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</label>
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          className="text-xs border rounded-md px-2 py-1.5 bg-background max-w-[180px] disabled:opacity-50"
          aria-label="Filtrar por tipo"
          disabled={tipos.length === 0}
        >
          <option value="all">{tipos.length === 0 ? 'Sin tipos aún' : `Todos (${tipos.length})`}</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Familia</label>
        <select
          value={familiaFiltro}
          onChange={(e) => setFamiliaFiltro(e.target.value as typeof familiaFiltro)}
          className="text-xs border rounded-md px-2 py-1.5 bg-background max-w-[200px]"
          aria-label="Filtrar por familia eléctrica (NFPA 70B)"
          title="Familia eléctrica NFPA 70B (máquina rotativa incluye motores, motorreductores, mototambores y bombas)"
        >
          <option value="all">Todas ({familias.length})</option>
          {familias.map((f) => (
            <option key={f.key} value={f.key}>
              {FAMILIA_LABEL[f.key]} ({f.n})
            </option>
          ))}
        </select>

        <label className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">Ordenar</label>
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as OrdenCampo)}
          className="text-xs border rounded-md px-2 py-1.5 bg-background"
          aria-label="Ordenar por"
        >
          <option value="criticidad">Criticidad</option>
          <option value="ficha">Ficha (menos completa)</option>
          <option value="area">Sección y línea</option>
          <option value="nombre">Nombre</option>
        </select>

        <Button variant={compact ? 'default' : 'outline'} size="sm" className="ml-auto" onClick={() => setCompact((v) => !v)}>
          {compact ? 'Vista normal' : 'Vista compacta'}
        </Button>
      </div>

      {/* Conteo + limpiar filtros */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {loading
            ? 'Cargando…'
            : visibles.length === 0
              ? 'Sin resultados'
              : `Mostrando ${(pageSafe - 1) * ITEMS_PER_PAGE + 1}–${Math.min(pageSafe * ITEMS_PER_PAGE, visibles.length)} de ${visibles.length}${
                  visibles.length !== kpis.total ? ` (${kpis.total} en total)` : ''
                }`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={copiarCodigos}
            disabled={loading || visibles.length === 0}
            title="Copiar los códigos del set filtrado"
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar códigos
          </Button>
          {filtrosActivos && (
            <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Agenda de inspecciones (vista agenda) */}
      {vista === 'agenda' && (
        <AgendaInspecciones groups={agenda} otByEquipo={otByEquipo} onOpen={(id) => openExpediente(id, 'ficha')} />
      )}

      {/* Tarjetas (vista tarjetas) */}
      {vista === 'tarjetas' &&
        (loading ? (
          <p className="text-sm text-muted-foreground italic">Cargando equipos…</p>
        ) : paginated.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No hay equipos para este filtro.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {paginated.map((e) => (
              <CtdEquipoCard
                key={e.id}
                equipment={e}
                ot={otByEquipo.get(e.id)}
                isFavorite={favorites.has(e.id)}
                onToggleFavorite={() => toggleFavorite(e.id)}
                onOpen={(tab) => openExpediente(e.id, tab)}
              />
            ))}
          </div>
        ))}

      {/* Tabla (vista lista) */}
      {vista === 'lista' && (
        <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground italic">Cargando equipos…</p>
          ) : visibles.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground italic">No hay equipos para este filtro.</p>
          ) : (
            <div className="divide-y">
              {paginated.map((e) => (
                <CtdEquipoRow
                  key={e.id}
                  equipment={e}
                  ot={otByEquipo.get(e.id)}
                  compact={compact}
                  isFavorite={favorites.has(e.id)}
                  onToggleFavorite={() => toggleFavorite(e.id)}
                  onOpen={(tab) => openExpediente(e.id, tab)}
                />
              ))}
            </div>
          )}
        </CardContent>
        </Card>
      )}

      {vista !== 'agenda' && !loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {pageSafe} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </Button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        El expediente (Información, Ficha NFPA 70B, Tablero, Fotos, Notas, QR) se abre aquí mismo, sin salir del CTD. “Ficha
        %” = completitud de la placa. Favoritos y notas se comparten con la página de Equipos.
      </p>

      {/* Expediente en sitio */}
      {detailEquipment && (
        <ExpedienteDialog
          equipment={detailEquipment}
          incidents={detailIncidents}
          log={detailLog}
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
          onAnnotatePhoto={(url) => setEditingPhoto(url)}
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

      {/* Editor de anotación de fotos (marcar hallazgos) */}
      {editingPhoto && detailEquipment && (
        <PhotoAnnotationEditor photoUrl={editingPhoto} onSave={handleAnnotatedSave} onClose={() => setEditingPhoto(null)} />
      )}
    </div>
  )
}

const SEV_VAL: Record<MaintenanceLogEntry['severidad'], number> = { verde: 1, amarillo: 2, rojo: 3 }
const SEV_HEX: Record<MaintenanceLogEntry['severidad'], string> = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' }
const SEV_LABEL: Record<MaintenanceLogEntry['severidad'], string> = {
  verde: 'Condición 1',
  amarillo: 'Condición 2',
  rojo: 'Condición 3',
}

/** Tendencia de la condición (severidad del historial) + trazabilidad de cambios. */
function TendenciaCondicion({ log, equipment }: { log: MaintenanceLogEntry[]; equipment: Equipment }) {
  // Serie cronológica ascendente (el historial llega en orden descendente).
  const serie = useMemo(() => [...log].sort((a, b) => a.fecha.getTime() - b.fecha.getTime()), [log])

  // Trazabilidad: puntos donde la condición (severidad) cambia respecto al anterior.
  const cambios = useMemo(() => {
    const out: { fecha: Date; from: MaintenanceLogEntry['severidad']; to: MaintenanceLogEntry['severidad'] }[] = []
    for (let i = 1; i < serie.length; i++) {
      const prev = serie[i - 1]
      const cur = serie[i]
      if (prev && cur && prev.severidad !== cur.severidad) out.push({ fecha: cur.fecha, from: prev.severidad, to: cur.severidad })
    }
    return out.reverse()
  }, [serie])

  const W = 300
  const H = 60
  const P = 8
  const puntos = serie.map((e, i) => {
    const x = serie.length <= 1 ? W / 2 : P + (i / (serie.length - 1)) * (W - 2 * P)
    const y = H - P - ((SEV_VAL[e.severidad] - 1) / 2) * (H - 2 * P)
    return { x, y, sev: e.severidad, fecha: e.fecha }
  })
  const polyline = puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]
  const condActual = equipment.fichaTecnica?.condicion

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            Tendencia de condición{' '}
            <span className="text-[11px] font-normal text-muted-foreground">(historial NFPA 70B)</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Actual: {condActual ? `${COND_EMOJI[condActual]} Cond. ${condActual}` : '—'}
          </div>
        </div>

        {serie.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground italic">
            Sin historial para calcular la tendencia. Registra inspecciones en la Ficha NFPA 70B.
          </p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="mt-3 w-full h-16 text-muted-foreground"
              role="img"
              aria-label="Tendencia de condición"
            >
              {[1, 2, 3].map((v) => {
                const y = H - P - ((v - 1) / 2) * (H - 2 * P)
                return <line key={v} x1={0} x2={W} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />
              })}
              {puntos.length > 1 && (
                <polyline points={polyline} fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth={1.5} />
              )}
              {puntos.map((p, i) => (
                <circle key={`${p.fecha.getTime()}-${i}`} cx={p.x} cy={p.y} r={3} fill={SEV_HEX[p.sev]} />
              ))}
            </svg>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{primero ? primero.fecha.toLocaleDateString() : ''}</span>
              <span>🟢 mejor · 🔴 peor · {serie.length} registro(s)</span>
              <span>{ultimo ? ultimo.fecha.toLocaleDateString() : ''}</span>
            </div>
          </>
        )}

        <div className="mt-3 border-t pt-2">
          <div className="text-xs font-medium mb-1">Trazabilidad de cambios</div>
          {cambios.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sin cambios de condición registrados.</p>
          ) : (
            <ul className="space-y-0.5">
              {cambios.slice(0, 6).map((c, i) => (
                <li key={`${c.fecha.getTime()}-${i}`} className="text-[11px] text-muted-foreground">
                  {c.fecha.toLocaleDateString()} · {SEV_LABEL[c.from]} →{' '}
                  <span className="font-medium text-foreground">{SEV_LABEL[c.to]}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Última actualización de la ficha: {equipment.updatedAt ? new Date(equipment.updatedAt).toLocaleString() : '—'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

type MedicionDraft = {
  fecha: string
  contexto: Medicion['contexto']
  tecnico: string
  nota: string
  valores: Record<string, string>
}
function emptyMedicionDraft(): MedicionDraft {
  return { fecha: new Date().toISOString().slice(0, 10), contexto: 'proceso', tecnico: '', nota: '', valores: {} }
}
const CTX_COLOR: Record<Medicion['contexto'], string> = { proceso: '#2563eb', reposo: '#94a3b8' }

function fmtNum(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)
}

/** Gráfico de área grande de una métrica: área con gradiente (proceso) + línea reposo + ejes. */
function MetricChart({ rows, campo }: { rows: Medicion[]; campo: CampoMedicion }) {
  const pts = rows
    .map((r, i) => ({ i, v: r.valores[campo.id], ctx: r.contexto, fecha: r.fecha }))
    .filter((p) => typeof p.v === 'number') as { i: number; v: number; ctx: Medicion['contexto']; fecha: Date }[]
  if (pts.length === 0) {
    return <p className="py-6 text-center text-sm italic text-muted-foreground">Sin datos de {campo.label} todavía.</p>
  }
  const vals = pts.map((p) => p.v)
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (min === max) {
    min -= 1
    max += 1
  }
  const padV = (max - min) * 0.12
  min -= padV
  max += padV
  const W = 640
  const H = 200
  const L = 46
  const R = 14
  const T = 14
  const B = 26
  const baseY = H - B
  const n = rows.length
  const x = (i: number) => (n <= 1 ? L + (W - L - R) / 2 : L + (i / (n - 1)) * (W - L - R))
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B)
  const procesoPts = pts.filter((p) => p.ctx === 'proceso')
  const reposoPts = pts.filter((p) => p.ctx === 'reposo')
  const line = (ps: typeof pts) => ps.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area =
    procesoPts.length > 0
      ? `M ${x(procesoPts[0]!.i).toFixed(1)},${baseY} ` +
        procesoPts.map((p) => `L ${x(p.i).toFixed(1)},${y(p.v).toFixed(1)} `).join('') +
        `L ${x(procesoPts[procesoPts.length - 1]!.i).toFixed(1)},${baseY} Z`
      : ''
  const gid = `mc-grad-${campo.id}`
  const first = pts[0]
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-muted-foreground" role="img" aria-label={`Tendencia de ${campo.label}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CTX_COLOR.proceso} stopOpacity={0.35} />
          <stop offset="100%" stopColor={CTX_COLOR.proceso} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {[max - (max - min) * 0.12, (min + max) / 2, min + (max - min) * 0.12].map((v, idx) => {
        const yy = y(v)
        return (
          <g key={idx}>
            <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="currentColor" strokeOpacity={0.1} />
            <text x={L - 6} y={yy + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.7}>
              {fmtNum(v)}
            </text>
          </g>
        )
      })}
      {area && <path d={area} fill={`url(#${gid})`} />}
      {procesoPts.length > 1 && (
        <polyline points={line(procesoPts)} fill="none" stroke={CTX_COLOR.proceso} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {reposoPts.length > 1 && (
        <polyline points={line(reposoPts)} fill="none" stroke={CTX_COLOR.reposo} strokeWidth={1.5} strokeDasharray="4 3" />
      )}
      {pts.map((p) => (
        <circle key={`${p.ctx}-${p.i}`} cx={x(p.i)} cy={y(p.v)} r={2.5} fill={CTX_COLOR[p.ctx]} />
      ))}
      {first && (
        <text x={L} y={H - 8} fontSize={9} fill="currentColor" opacity={0.7}>
          {first.fecha.toLocaleDateString()}
        </text>
      )}
      {last && pts.length > 1 && (
        <text x={W - R} y={H - 8} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.7}>
          {last.fecha.toLocaleDateString()}
        </text>
      )}
    </svg>
  )
}

/** Sparkline de una serie (un campo) con líneas separadas por contexto proceso/reposo. */
function SerieCampo({ rows, campo }: { rows: Medicion[]; campo: CampoMedicion }) {
  const pts = rows
    .map((r, i) => ({ i, v: r.valores[campo.id], ctx: r.contexto }))
    .filter((p) => typeof p.v === 'number') as { i: number; v: number; ctx: Medicion['contexto'] }[]
  if (pts.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <span className="w-32 shrink-0 truncate">{campo.label}</span>
        <span className="flex-1 italic">sin datos</span>
      </div>
    )
  }
  const vals = pts.map((p) => p.v)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const W = 160
  const H = 32
  const P = 4
  const n = rows.length
  const x = (i: number) => (n <= 1 ? W / 2 : P + (i / (n - 1)) * (W - 2 * P))
  const y = (v: number) => (max === min ? H / 2 : H - P - ((v - min) / (max - min)) * (H - 2 * P))
  const lineFor = (ctx: Medicion['contexto']) =>
    pts.filter((p) => p.ctx === ctx).map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-32 shrink-0 text-xs truncate" title={campo.label}>
        {campo.label}
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="flex-1 h-8" role="img" aria-label={campo.label}>
        {(['proceso', 'reposo'] as const).map((ctx) => {
          const pl = lineFor(ctx)
          return pl.includes(' ') ? (
            <polyline key={ctx} points={pl} fill="none" stroke={CTX_COLOR[ctx]} strokeOpacity={0.7} strokeWidth={1.5} />
          ) : null
        })}
        {pts.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2.5} fill={CTX_COLOR[p.ctx]} />
        ))}
      </svg>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums">
        {last?.v} <span className="text-muted-foreground">{campo.unidad}</span>
      </span>
    </div>
  )
}

/** Pestaña Mediciones — bitácora de comportamiento + tendencias (solo favoritos). */
function MedicionesTab({ equipment, canEdit }: { equipment: Equipment; canEdit: boolean }) {
  const campos = medicionesDe(equipment)
  const [rows, setRows] = useState<Medicion[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<MedicionDraft>(emptyMedicionDraft)
  const [metricId, setMetricId] = useState<string>('')

  // Campos que ya tienen al menos un dato (para el gráfico y el selector).
  const camposConDatos = campos.filter((c) => rows.some((r) => typeof r.valores[c.id] === 'number'))
  const metricSel = camposConDatos.find((c) => c.id === metricId) ?? camposConDatos[0]

  useEffect(() => {
    let alive = true
    setLoading(true)
    getMediciones(equipment.id)
      .then((r) => {
        if (alive) setRows(r)
      })
      .catch((err) => {
        if (alive) setRows([])
        logger.error('Error cargando mediciones', err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [equipment.id])

  async function guardar() {
    const valores: Record<string, number> = {}
    for (const c of campos) {
      const raw = draft.valores[c.id]
      const num = raw == null || raw.trim() === '' ? NaN : Number(raw)
      if (Number.isFinite(num)) valores[c.id] = num
    }
    if (Object.keys(valores).length === 0) {
      alert('Anota al menos un valor.')
      return
    }
    setSaving(true)
    try {
      await addMedicion({
        equipmentId: equipment.id,
        hierarchyNodeId: equipment.hierarchyNodeId,
        fecha: new Date(draft.fecha),
        contexto: draft.contexto,
        tecnico: draft.tecnico.trim() || undefined,
        valores,
        nota: draft.nota.trim() || undefined,
      })
      setRows(await getMediciones(equipment.id))
      setAdding(false)
      setDraft(emptyMedicionDraft())
    } catch (err) {
      logger.error('Error guardando medición', err instanceof Error ? err : new Error(String(err)))
      alert('No se pudo guardar la medición.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            Tendencias de comportamiento{' '}
            <span className="text-[11px] font-normal text-muted-foreground">· {FAMILIA_LABEL[familiaDe(equipment)]}</span>
          </div>
          {canEdit && !adding && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Registrar medición
            </Button>
          )}
        </div>

        {adding && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="grid md:grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Fecha</label>
                <Input type="date" value={draft.fecha} onChange={(e) => setDraft((d) => ({ ...d, fecha: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Contexto</label>
                <div className="inline-flex rounded-md border overflow-hidden mt-1">
                  {(['proceso', 'reposo'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, contexto: c }))}
                      className={`px-3 py-1.5 text-xs capitalize ${draft.contexto === c ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Técnico</label>
                <Input value={draft.tecnico} onChange={(e) => setDraft((d) => ({ ...d, tecnico: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {campos.map((c) => (
                <div key={c.id}>
                  <label className="text-xs text-muted-foreground">
                    {c.label} ({c.unidad})
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.valores[c.id] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, valores: { ...d.valores, [c.id]: e.target.value } }))}
                  />
                </div>
              ))}
            </div>
            <Input
              placeholder="Nota (opcional)…"
              value={draft.nota}
              onChange={(e) => setDraft((d) => ({ ...d, nota: e.target.value }))}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={guardar} disabled={saving}>
                <Check className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Guardando…' : 'Guardar medición'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false)
                  setDraft(emptyMedicionDraft())
                }}
                disabled={saving}
              >
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground italic">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Sin mediciones todavía. Registra corriente por fase, temperatura (proceso/reposo), vibración… y se arma la
            tendencia de comportamiento.
          </p>
        ) : (
          <>
            {metricSel && (
              <div className="rounded-lg border bg-muted/20 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="text-xs font-medium">
                    {metricSel.label} <span className="text-muted-foreground">({metricSel.unidad})</span>
                  </div>
                  <select
                    value={metricSel.id}
                    onChange={(e) => setMetricId(e.target.value)}
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                    aria-label="Métrica a graficar"
                  >
                    {camposConDatos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <MetricChart rows={rows} campo={metricSel} />
              </div>
            )}
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Todas las series</div>
            <div className="divide-y">
              {campos.map((c) => (
                <SerieCampo key={c.id} rows={rows} campo={c} />
              ))}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: CTX_COLOR.proceso }} /> proceso
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: CTX_COLOR.reposo }} /> reposo
              </span>
              <span>· {rows.length} medición(es)</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Chip de órdenes de trabajo abiertas del equipo (rojo si hay vencidas). */
function OtBadge({ ot }: { ot?: OtCount }) {
  if (!ot || ot.abiertas === 0) return null
  const danger = ot.vencidas > 0
  return (
    <span
      title={`${ot.abiertas} OT abierta(s)${ot.vencidas > 0 ? ` · ${ot.vencidas} vencida(s)` : ''}`}
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${danger ? 'text-red-600' : 'text-blue-600'}`}
    >
      <Wrench className="h-3 w-3" />
      {ot.abiertas}
      {ot.vencidas > 0 ? `·${ot.vencidas}!` : ''}
    </span>
  )
}

/** Recursos · repuestos del equipo (N:M) + buscador embebido para vincular/desvincular. */
function RecursosRepuestos({ equipment, canEdit }: { equipment: Equipment; canEdit: boolean }) {
  const nodeId = equipment.hierarchyNodeId
  const [reloadKey, setReloadKey] = useState(0)
  const { repuestos, loading } = useRepuestosDeEquipo(nodeId, reloadKey)
  const [adding, setAdding] = useState(false)
  const [maestro, setMaestro] = useState<RepuestoMaestroItem[] | null>(null)
  const [loadingMaestro, setLoadingMaestro] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  async function openAdd() {
    setAdding(true)
    if (!maestro && !loadingMaestro) {
      setLoadingMaestro(true)
      try {
        setMaestro(await getRepuestosMaestro())
      } catch (e) {
        logger.error('Error cargando maestro de repuestos', e instanceof Error ? e : new Error(String(e)))
      } finally {
        setLoadingMaestro(false)
      }
    }
  }

  const term = q.trim().toLowerCase()
  const linkedIds = new Set(repuestos.map((r) => r.id))
  const resultados = (maestro ?? [])
    .filter((m) => !m.equipos.includes(nodeId ?? '') && !linkedIds.has(m.id))
    .filter((m) => term.length >= 2 && `${m.nombre} ${m.codigoSAP}`.toLowerCase().includes(term))
    .slice(0, 20)

  async function vincular(m: RepuestoMaestroItem) {
    if (!nodeId) return
    setBusy(true)
    try {
      await linkRepuestoEquipo(m.id, nodeId, equipment.codigo)
      setReloadKey((k) => k + 1)
      setQ('')
    } catch (e) {
      logger.error('Error vinculando repuesto', e instanceof Error ? e : new Error(String(e)))
      alert('No se pudo vincular el repuesto.')
    } finally {
      setBusy(false)
    }
  }

  async function desvincular(id: string) {
    if (!nodeId || !window.confirm('¿Quitar este repuesto del equipo?')) return
    setBusy(true)
    try {
      await unlinkRepuestoEquipo(id, nodeId)
      setReloadKey((k) => k + 1)
    } catch (e) {
      logger.error('Error desvinculando repuesto', e instanceof Error ? e : new Error(String(e)))
      alert('No se pudo quitar el repuesto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            Repuestos del equipo{' '}
            {repuestos.length > 0 && <span className="text-xs font-normal text-muted-foreground">({repuestos.length})</span>}
          </div>
          {canEdit && nodeId && !adding && (
            <Button variant="outline" size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Vincular
            </Button>
          )}
        </div>

        {adding && (
          <div className="space-y-2 rounded-lg border p-2">
            <Input placeholder="Buscar repuesto por nombre o SAP…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {loadingMaestro ? (
              <p className="text-xs italic text-muted-foreground">Cargando maestro…</p>
            ) : term.length < 2 ? (
              <p className="text-xs italic text-muted-foreground">Escribe al menos 2 caracteres.</p>
            ) : resultados.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Sin coincidencias (o ya vinculados).</p>
            ) : (
              <div className="max-h-56 divide-y overflow-y-auto">
                {resultados.map((m) => (
                  <button
                    key={m.id}
                    disabled={busy}
                    onClick={() => vincular(m)}
                    className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:bg-muted/40 disabled:opacity-50"
                  >
                    <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{m.codigoSAP || '—'}</span>
                    <span className="min-w-0 flex-1 truncate">{m.nombre}</span>
                    <Plus className="h-4 w-4 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false)
                  setQ('')
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm italic text-muted-foreground">Cargando…</p>
        ) : repuestos.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            Sin repuestos vinculados{nodeId ? '' : ' (equipo sin nodo de jerarquía)'}.
          </p>
        ) : (
          <div className="divide-y">
            {repuestos.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{r.codigoSAP || '—'}</span>
                <span className="min-w-0 flex-1 truncate">
                  {r.nombre}
                  {r.tipo ? <span className="text-[11px] text-muted-foreground"> · {r.tipo}</span> : null}
                </span>
                {typeof r.stockFisico === 'number' && (
                  <span className="shrink-0 text-xs text-muted-foreground">stock {r.stockFisico}</span>
                )}
                {canEdit && nodeId && (
                  <button
                    disabled={busy}
                    onClick={() => desvincular(r.id)}
                    className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                    title="Quitar del equipo"
                    aria-label="Quitar repuesto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Los repuestos se comparten N:M con el maestro; “Vincular” agrega este equipo al repuesto.
        </p>
      </CardContent>
    </Card>
  )
}

/** Rail izquierdo (desktop): ruta del equipo en la jerarquía de la planta. */
function UbicacionRail({ equipment }: { equipment: Equipment }) {
  const parts = (equipment.hierarchyPath ?? '').split('>').map((s) => s.trim()).filter(Boolean)
  return (
    <div className="rounded-lg border bg-card/95 p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" /> Ubicación en la planta
      </div>
      {parts.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">Sin ruta de jerarquía.</p>
      ) : (
        <ol className="space-y-0.5">
          {parts.map((p, i) => {
            const last = i === parts.length - 1
            return (
              <li key={`${i}-${p}`} style={{ paddingLeft: `${i * 12}px` }} className="flex items-start">
                <span className={`text-xs ${last ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {i > 0 && <span className="mr-1 text-muted-foreground/50">└</span>}
                  {p}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <p className="mt-3 text-[10px] text-muted-foreground">Origen: jerarquía SAP del equipo.</p>
    </div>
  )
}

function ExpedienteDialog({
  equipment,
  incidents,
  log,
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
  onAnnotatePhoto,
  notes,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: {
  equipment: Equipment
  incidents: Incident[]
  log: MaintenanceLogEntry[]
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
  onAnnotatePhoto: (photoUrl: string) => void
  notes: EquipmentNote[]
  onAddNote: (text: string) => void
  onEditNote: (noteId: string, text: string) => void
  onDeleteNote: (noteId: string) => void
}) {
  const crit = CRIT[equipment.criticidad]
  const est = ESTADO[equipment.estado]
  const ubicacion = equipment.hierarchyPath || equipment.zoneId
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ciclo de vida + confiabilidad (datos ya existentes)
  const edad = aniosDesde(equipment.fechaInstalacion)
  const vidaUtil = equipment.fichaTecnica?.vidaUtilAnios
  const pctVida = edad != null && vidaUtil ? Math.min(100, Math.round((edad / vidaUtil) * 100)) : null
  const reemplazo =
    equipment.fechaInstalacion && vidaUtil
      ? new Date(new Date(equipment.fechaInstalacion).getTime() + vidaUtil * 365.25 * 86400000)
      : null
  const rel = confiabilidad(incidents)

  // Documentos heredados del nodo de jerarquía (maestro N:M). Los repuestos
  // viven en su propio sub-componente (lista + vincular) para refrescar al enlazar.
  const nodeIds = equipment.hierarchyNodeId ? [equipment.hierarchyNodeId] : []
  const { manuales, loading: manualesLoading } = useManualesDeEquipos(nodeIds)

  // Órdenes de trabajo del equipo
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [woLoading, setWoLoading] = useState(false)
  const [woForm, setWoForm] = useState(false)
  const [woSaving, setWoSaving] = useState(false)
  const [woDraft, setWoDraft] = useState<{
    titulo: string
    tipo: WorkOrder['tipo']
    prioridad: WorkOrder['prioridad']
    asignadoA: string
    fechaProgramada: string
    costo: string
    descripcion: string
  }>({ titulo: '', tipo: 'correctivo', prioridad: 'media', asignadoA: '', fechaProgramada: '', costo: '', descripcion: '' })

  // Costo total de mantenimiento del equipo (TCO) = suma de costos de sus OT.
  const tco = workOrders.reduce((s, wo) => s + (wo.costo ?? 0), 0)
  const otConCosto = workOrders.filter((wo) => typeof wo.costo === 'number').length

  useEffect(() => {
    let alive = true
    setWoLoading(true)
    getWorkOrders(equipment.id)
      .then((rows) => {
        if (alive) setWorkOrders(rows)
      })
      .catch((err) => {
        if (alive) setWorkOrders([])
        logger.error('Error cargando órdenes de trabajo', err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (alive) setWoLoading(false)
      })
    return () => {
      alive = false
    }
  }, [equipment.id])

  async function crearOT() {
    if (!woDraft.titulo.trim()) return
    setWoSaving(true)
    try {
      const costoNum = woDraft.costo.trim() ? Number(woDraft.costo) : undefined
      await createWorkOrder({
        equipmentId: equipment.id,
        hierarchyNodeId: equipment.hierarchyNodeId,
        titulo: woDraft.titulo.trim(),
        descripcion: woDraft.descripcion.trim() || undefined,
        tipo: woDraft.tipo,
        prioridad: woDraft.prioridad,
        estado: 'abierta',
        asignadoA: woDraft.asignadoA.trim() || undefined,
        fechaProgramada: woDraft.fechaProgramada || undefined,
        costo: costoNum != null && Number.isFinite(costoNum) ? costoNum : undefined,
      })
      setWorkOrders(await getWorkOrders(equipment.id))
      setWoForm(false)
      setWoDraft({ titulo: '', tipo: 'correctivo', prioridad: 'media', asignadoA: '', fechaProgramada: '', costo: '', descripcion: '' })
    } catch (err) {
      logger.error('Error creando OT', err instanceof Error ? err : new Error(String(err)))
      alert('No se pudo crear la orden de trabajo.')
    } finally {
      setWoSaving(false)
    }
  }

  async function cambiarEstadoOT(wo: WorkOrder, estado: WorkOrder['estado']) {
    try {
      const patch: Partial<WorkOrder> = { estado }
      if (estado === 'cerrada') {
        patch.fechaCierre = new Date().toISOString().slice(0, 10)
        // Capturar/confirmar el costo al cerrar (alimenta el TCO del activo).
        const ingresado = window.prompt('Costo de esta OT (opcional, solo número):', wo.costo != null ? String(wo.costo) : '')
        if (ingresado !== null && ingresado.trim() !== '') {
          const n = Number(ingresado)
          if (Number.isFinite(n)) patch.costo = n
        }
      }
      await updateWorkOrder(wo.id, patch)
      setWorkOrders(await getWorkOrders(equipment.id))
    } catch (err) {
      logger.error('Error actualizando OT', err instanceof Error ? err : new Error(String(err)))
      alert('No se pudo actualizar la orden de trabajo.')
    }
  }

  const [newNoteText, setNewNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      {/* Izquierda (desktop): ruta/ubicación en la jerarquía */}
      <aside
        className="hidden w-[30%] shrink-0 flex-col gap-2 overflow-y-auto p-4 md:flex lg:w-[26%] xl:w-[22%]"
        onClick={(ev) => ev.stopPropagation()}
      >
        <UbicacionRail equipment={equipment} />
      </aside>

      {/* Derecha: panel del expediente (columna fija ancha, no modal) */}
      <Card
        className="ml-auto h-full w-full overflow-y-auto rounded-none border-l md:w-[70%] lg:w-[74%] xl:w-[78%]"
        onClick={(ev) => ev.stopPropagation()}
      >
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
              {equipment.nombreComun && <div className="text-sm text-muted-foreground truncate">“{equipment.nombreComun}”</div>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`${crit.cls} text-xs`} title={CRIT_INFO[equipment.criticidad].desc}>
                  Criticidad {crit.nivel}
                </Badge>
                <Badge variant="outline" className={`${est.cls} text-xs`}>{est.label}</Badge>
                {ubicacion && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> <span className="line-clamp-1">{ubicacion}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="outline" size="sm" onClick={() => generarReporteEquipo(equipment, incidents, log)}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
              </Button>
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
              <TabsTrigger value="recursos">Recursos</TabsTrigger>
              <TabsTrigger value="trabajos">Trabajos ({workOrders.length})</TabsTrigger>
              {isFavorite && <TabsTrigger value="mediciones">Mediciones</TabsTrigger>}
              <TabsTrigger value="fotos">Fotos ({equipment.photos?.length || 0})</TabsTrigger>
              <TabsTrigger value="notas">Notas ({notes.length})</TabsTrigger>
              <TabsTrigger value="qr">QR</TabsTrigger>
            </TabsList>

            <TabsContent value="info">
              <div className="space-y-3">
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
                      <div className="text-sm text-muted-foreground">Tipo</div>
                      <div className="font-medium">{equipment.tipo || '—'}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Familia (NFPA 70B)</div>
                      <div className="font-medium">{FAMILIA_LABEL[familiaDe(equipment)]}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Estado</div>
                      <div className="font-medium">{est.label}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-muted-foreground">Criticidad (NFPA 70B §2.4)</div>
                      <div className="font-medium">
                        {CRIT_INFO[equipment.criticidad].label}{' '}
                        <span className="text-xs font-normal text-muted-foreground">— {CRIT_INFO[equipment.criticidad].desc}</span>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-muted-foreground">Descripción</div>
                      <div className="font-medium whitespace-pre-wrap">{equipment.descripcion || '—'}</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Protocolo de inspección NFPA 70B (según la familia del equipo) */}
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm font-semibold mb-1">
                      Protocolo de inspección NFPA 70B{' '}
                      <span className="text-[11px] font-normal text-muted-foreground">
                        · familia {FAMILIA_LABEL[familiaDe(equipment)]}
                      </span>
                    </div>
                    <ul className="divide-y">
                      {checklistDe(equipment).map((t) => (
                        <li key={t.id} className="py-1.5 flex items-start gap-2 text-sm">
                          <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div>{t.tarea}</div>
                            {t.nota && <div className="text-[11px] text-muted-foreground">{t.nota}</div>}
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                            {t.tipo === 'medicion'
                              ? `medición${t.unidad ? ` · ${t.unidad}` : ''}${t.rango ? ` (${t.rango.min ?? ''}${t.rango.min != null && t.rango.max != null ? '–' : ''}${t.rango.max ?? ''})` : ''}`
                              : 'cualitativo'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Tareas recomendadas por familia (NFPA 70B). Al registrar una inspección en la Ficha, documenta
                      hallazgo y condición. Plantilla de arranque — se afina con el estándar completo / RPTD N°15.
                    </p>
                  </CardContent>
                </Card>

                {/* Ciclo de vida */}
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm font-semibold mb-2">Ciclo de vida</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Antigüedad</div>
                        <div className="font-medium">{edad != null ? `${edad.toFixed(1)} años` : '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Vida útil</div>
                        <div className="font-medium">{vidaUtil != null ? `${vidaUtil} años` : '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Vida consumida</div>
                        <div
                          className={`font-medium ${
                            pctVida != null && pctVida >= 100
                              ? 'text-red-600'
                              : pctVida != null && pctVida >= 70
                                ? 'text-amber-600'
                                : ''
                          }`}
                        >
                          {pctVida != null ? `${pctVida}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Reemplazo estimado</div>
                        <div className="font-medium">{reemplazo ? reemplazo.toLocaleDateString() : '—'}</div>
                      </div>
                    </div>
                    {pctVida != null && (
                      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${pctVida >= 100 ? 'bg-red-500' : pctVida >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, pctVida)}%` }}
                        />
                      </div>
                    )}
                    {edad == null || vidaUtil == null ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Requiere fecha de instalación y vida útil (en la Ficha) para el cálculo.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                {/* Confiabilidad */}
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm font-semibold mb-2">
                      Confiabilidad{' '}
                      <span className="text-[11px] font-normal text-muted-foreground">(según historial cargado)</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">N.º de fallas</div>
                        <div className="font-medium">{rel.fallas}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">MTTR</div>
                        <div className="font-medium">{rel.mttrHoras != null ? `${rel.mttrHoras.toFixed(1)} h` : '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">MTBF</div>
                        <div className="font-medium">{rel.mtbfDias != null ? `${rel.mtbfDias.toFixed(0)} d` : '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Disponibilidad</div>
                        <div className="font-medium">{rel.disponibilidad != null ? `${rel.disponibilidad.toFixed(1)}%` : '—'}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Costo de mantenimiento (TCO) — suma de costos de las OT del equipo */}
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm font-semibold mb-2">
                      Costo de mantenimiento (TCO){' '}
                      <span className="text-[11px] font-normal text-muted-foreground">(según OT con costo)</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Costo acumulado</div>
                        <div className="font-medium">{formatCosto(tco)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">OT con costo</div>
                        <div className="font-medium">
                          {otConCosto} / {workOrders.length}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Costo promedio</div>
                        <div className="font-medium">{otConCosto > 0 ? formatCosto(tco / otConCosto) : '—'}</div>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      El costo se captura al crear o cerrar una orden de trabajo (pestaña Trabajos).
                    </p>
                  </CardContent>
                </Card>

                <TendenciaCondicion log={log} equipment={equipment} />
              </div>
            </TabsContent>

            <TabsContent value="ficha">
              <FichaTecnicaNFPA70B equipment={equipment} incidents={incidents} />
            </TabsContent>

            <TabsContent value="tablero">
              <TableroExpediente equipment={equipment} />
            </TabsContent>

            <TabsContent value="recursos">
              <div className="space-y-3">
                <RecursosRepuestos equipment={equipment} canEdit={canEdit} />

                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="text-sm font-semibold">
                      Documentos (manuales · planos · certificados){' '}
                      {manuales.length > 0 && <span className="text-xs font-normal text-muted-foreground">({manuales.length})</span>}
                    </div>
                    {manualesLoading ? (
                      <p className="text-sm text-muted-foreground italic">Cargando…</p>
                    ) : manuales.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Sin documentos heredados.</p>
                    ) : (
                      <div className="divide-y">
                        {manuales.map((m) => (
                          <a
                            key={m.id}
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-2 flex items-center gap-2 text-sm text-primary hover:underline"
                          >
                            <BookOpen className="h-4 w-4 shrink-0" /> <span className="flex-1 min-w-0 truncate">{m.titulo}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <p className="text-[11px] text-muted-foreground">
                  Repuestos y documentos se heredan del nodo de jerarquía del equipo (maestro N:M).
                </p>
              </div>
            </TabsContent>

            <TabsContent value="trabajos">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      Órdenes de trabajo{' '}
                      {workOrders.length > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                          ({workOrders.length}){tco > 0 ? ` · TCO ${formatCosto(tco)}` : ''}
                        </span>
                      )}
                    </div>
                    {canEdit && !woForm && (
                      <Button variant="outline" size="sm" onClick={() => setWoForm(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Nueva OT
                      </Button>
                    )}
                  </div>

                  {woForm && (
                    <div className="rounded-lg border p-3 space-y-3">
                      <Input
                        placeholder="Título de la OT…"
                        value={woDraft.titulo}
                        onChange={(e) => setWoDraft((d) => ({ ...d, titulo: e.target.value }))}
                      />
                      <div className="grid md:grid-cols-3 gap-2">
                        <select
                          className="text-sm border rounded-md px-2 py-1.5 bg-background"
                          value={woDraft.tipo}
                          onChange={(e) => setWoDraft((d) => ({ ...d, tipo: e.target.value as WorkOrder['tipo'] }))}
                        >
                          {WO_TIPOS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className="text-sm border rounded-md px-2 py-1.5 bg-background"
                          value={woDraft.prioridad}
                          onChange={(e) => setWoDraft((d) => ({ ...d, prioridad: e.target.value as WorkOrder['prioridad'] }))}
                        >
                          <option value="baja">Prioridad baja</option>
                          <option value="media">Prioridad media</option>
                          <option value="alta">Prioridad alta</option>
                          <option value="critica">Prioridad crítica</option>
                        </select>
                        <Input
                          type="date"
                          value={woDraft.fechaProgramada}
                          onChange={(e) => setWoDraft((d) => ({ ...d, fechaProgramada: e.target.value }))}
                        />
                      </div>
                      <div className="grid md:grid-cols-2 gap-2">
                        <Input
                          placeholder="Asignado a (técnico)…"
                          value={woDraft.asignadoA}
                          onChange={(e) => setWoDraft((d) => ({ ...d, asignadoA: e.target.value }))}
                        />
                        <Input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          placeholder="Costo (CLP, opcional)…"
                          value={woDraft.costo}
                          onChange={(e) => setWoDraft((d) => ({ ...d, costo: e.target.value }))}
                        />
                      </div>
                      <Textarea
                        rows={2}
                        placeholder="Descripción…"
                        value={woDraft.descripcion}
                        onChange={(e) => setWoDraft((d) => ({ ...d, descripcion: e.target.value }))}
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={crearOT} disabled={woSaving || !woDraft.titulo.trim()}>
                          <Check className="h-3.5 w-3.5 mr-1.5" /> {woSaving ? 'Guardando…' : 'Crear OT'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setWoForm(false)} disabled={woSaving}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}

                  {woLoading ? (
                    <p className="text-sm text-muted-foreground italic">Cargando…</p>
                  ) : workOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Sin órdenes de trabajo.</p>
                  ) : (
                    <div className="divide-y">
                      {workOrders.map((wo) => {
                        const we = WO_ESTADO[wo.estado]
                        const wp = WO_PRIORIDAD[wo.prioridad]
                        return (
                          <div key={wo.id} className="py-2.5 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium text-sm">{wo.titulo}</div>
                                {wo.descripcion && (
                                  <div className="text-xs text-muted-foreground whitespace-pre-wrap">{wo.descripcion}</div>
                                )}
                              </div>
                              <Badge variant="outline" className={`${we.cls} text-xs shrink-0`}>
                                {we.label}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span>{WO_TIPOS.find((t) => t.value === wo.tipo)?.label ?? wo.tipo}</span>
                              <span className={wp.cls}>● {wp.label}</span>
                              {wo.asignadoA && <span>👤 {wo.asignadoA}</span>}
                              {wo.fechaProgramada && <span>📅 {new Date(wo.fechaProgramada).toLocaleDateString()}</span>}
                              {wo.fechaCierre && <span>✓ {new Date(wo.fechaCierre).toLocaleDateString()}</span>}
                              {typeof wo.costo === 'number' && <span>💲 {formatCosto(wo.costo)}</span>}
                            </div>
                            {canEdit && wo.estado !== 'cerrada' && wo.estado !== 'cancelada' && (
                              <div className="flex items-center gap-1 pt-0.5">
                                {wo.estado === 'abierta' && (
                                  <Button variant="ghost" size="sm" onClick={() => cambiarEstadoOT(wo, 'en_proceso')}>
                                    Tomar
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => cambiarEstadoOT(wo, 'cerrada')}>
                                  Cerrar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground"
                                  onClick={() => cambiarEstadoOT(wo, 'cancelada')}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {isFavorite && (
              <TabsContent value="mediciones">
                <MedicionesTab equipment={equipment} canEdit={canEdit} />
              </TabsContent>
            )}

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
                              className="absolute top-1 left-1 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Anotar foto (marcar hallazgos)"
                              aria-label="Anotar foto"
                              onClick={(ev) => {
                                ev.stopPropagation()
                                onAnnotatePhoto(url)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
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

function AgendaInspecciones({
  groups,
  otByEquipo,
  onOpen,
}: {
  groups: Record<Bucket, Equipment[]>
  otByEquipo: Map<string, OtCount>
  onOpen: (id: string) => void
}) {
  const total = BUCKETS.reduce((n, b) => n + groups[b.key].length, 0)
  if (total === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground italic">No hay equipos para este filtro.</CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      {BUCKETS.map((b) => {
        const items = groups[b.key]
        if (items.length === 0) return null
        const danger = b.key === 'vencidas'
        return (
          <Card key={b.key}>
            <CardContent className="p-0">
              <div className={`px-4 py-2 flex items-center justify-between text-sm font-semibold ${danger ? 'text-red-600' : ''}`}>
                <span>{b.label}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="divide-y border-t">
                {items.map((e) => {
                  const crit = CRIT[e.criticidad]
                  const cond = e.fichaTecnica?.condicion
                  const dias = diasVencida(e.fichaTecnica?.proximaInspeccion)
                  const prox = e.fichaTecnica?.proximaInspeccion
                  return (
                    <div
                      key={e.id}
                      onClick={() => onOpen(e.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') onOpen(e.id)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted/40 cursor-pointer"
                    >
                      <Badge variant="outline" className={`${crit.cls} text-xs`}>{crit.nivel}</Badge>
                      <span className="w-6 text-center">{cond ? COND_EMOJI[cond] : '—'}</span>
                      <span className="flex-1 min-w-0 truncate">
                        {e.nombre} <span className="text-[11px] text-muted-foreground font-mono">· {e.codigo}</span>
                      </span>
                      <OtBadge ot={otByEquipo.get(e.id)} />
                      <span className={`text-xs shrink-0 ${dias !== null ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                        {dias !== null ? `vencida ${dias} d` : prox ? new Date(prox).toLocaleDateString() : 'sin fecha'}
                      </span>
                      {danger && (
                        <span className="text-[11px] font-medium text-primary shrink-0 inline-flex items-center">
                          Registrar <ChevronRight className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function CtdEquipoCard({
  equipment: e,
  ot,
  isFavorite,
  onToggleFavorite,
  onOpen,
}: {
  equipment: Equipment
  ot?: OtCount
  isFavorite: boolean
  onToggleFavorite: () => void
  onOpen: (tab: string) => void
}) {
  const crit = CRIT[e.criticidad]
  const est = ESTADO[e.estado]
  const cond = e.fichaTecnica?.condicion
  const pct = completitud(e)
  const foto = e.photos?.[0]
  return (
    <Card className="overflow-hidden cursor-pointer hover:bg-muted/30" onClick={() => onOpen('info')}>
      <div className="relative aspect-video bg-muted flex items-center justify-center">
        {foto ? (
          <img src={foto} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
        <button
          onClick={(ev) => {
            ev.stopPropagation()
            onToggleFavorite()
          }}
          title={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
          aria-label={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
          className="absolute top-1 right-1 p-1 rounded bg-black/40"
        >
          <Star className={`h-4 w-4 ${isFavorite ? 'fill-current text-yellow-500' : 'text-white'}`} />
        </button>
      </div>
      <CardContent className="p-3 space-y-1.5">
        <div className="font-medium text-sm truncate">{e.nombre}</div>
        <div className="text-[11px] text-muted-foreground font-mono truncate">{e.codigo}</div>
        {e.nombreComun && <div className="text-[11px] text-muted-foreground truncate">“{e.nombreComun}”</div>}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={`${crit.cls} text-xs`}>{crit.nivel}</Badge>
          {cond ? <span className="text-xs">{COND_EMOJI[cond]}</span> : null}
          <Badge variant="outline" className={`${est.cls} text-xs`}>{est.label}</Badge>
          <OtBadge ot={ot} />
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Ficha</span>
          <span className={pct < 100 ? 'text-amber-600' : 'text-emerald-600'}>{pct > 0 ? `${pct}%` : '—'}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function CtdEquipoRow({
  equipment: e,
  ot,
  compact,
  isFavorite,
  onToggleFavorite,
  onOpen,
}: {
  equipment: Equipment
  ot?: OtCount
  compact: boolean
  isFavorite: boolean
  onToggleFavorite: () => void
  onOpen: (tab: string) => void
}) {
  const crit = CRIT[e.criticidad]
  const est = ESTADO[e.estado]
  const cond = e.fichaTecnica?.condicion
  const pct = completitud(e)
  const foto = e.photos?.[0]
  return (
    <div
      className={`flex items-center gap-3 px-3 hover:bg-muted/40 cursor-pointer ${compact ? 'py-1.5' : 'py-3'}`}
      onClick={() => onOpen('info')}
    >
      <button
        onClick={(ev) => {
          ev.stopPropagation()
          onToggleFavorite()
        }}
        title={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
        aria-label={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
        className="shrink-0 p-1 -m-1"
      >
        <Star className={`h-4 w-4 ${isFavorite ? 'fill-current text-yellow-500' : 'text-muted-foreground'}`} />
      </button>

      <div className={`shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center ${compact ? 'h-8 w-8' : 'h-10 w-10'}`}>
        {foto ? (
          <img src={foto} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{e.nombre}</div>
        <div className="text-[10px] text-muted-foreground font-mono truncate">{e.codigo}</div>
        {e.nombreComun && <div className="text-[10px] text-muted-foreground truncate">“{e.nombreComun}”</div>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs md:hidden">
          <Badge variant="outline" className={`${crit.cls}`}>{crit.nivel}</Badge>
          {cond ? <span>{COND_EMOJI[cond]}</span> : null}
          <Badge variant="outline" className={`${est.cls}`}>{est.label}</Badge>
          <OtBadge ot={ot} />
          <button
            className={pct < 100 ? 'text-amber-600 underline decoration-dotted' : 'text-emerald-600'}
            title={pct < 100 ? 'Completar ficha' : 'Ficha completa'}
            onClick={(ev) => {
              ev.stopPropagation()
              onOpen('ficha')
            }}
          >
            {pct > 0 ? `${pct}%` : 'Completar ficha'}
          </button>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-3 shrink-0 text-sm">
        <Badge variant="outline" className={`${crit.cls} text-xs`}>{crit.nivel}</Badge>
        <span className="w-6 text-center">{cond ? COND_EMOJI[cond] : <span className="text-muted-foreground">—</span>}</span>
        <Badge variant="outline" className={`${est.cls} text-xs`}>{est.label}</Badge>
        <span className="w-12 text-right"><OtBadge ot={ot} /></span>
        <button
          className={`w-16 text-right ${pct < 100 ? 'text-amber-600 underline decoration-dotted underline-offset-2' : 'text-emerald-600'}`}
          title={pct < 100 ? 'Completar ficha (placa eléctrica)' : 'Ficha completa'}
          onClick={(ev) => {
            ev.stopPropagation()
            onOpen('ficha')
          }}
        >
          {pct > 0 ? `${pct}%` : 'Completar'}
        </button>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-primary hidden sm:inline-flex"
          onClick={(ev) => {
            ev.stopPropagation()
            onOpen('info')
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
            onOpen('tablero')
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
            onOpen('qr')
          }}
        >
          <QrCode className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
