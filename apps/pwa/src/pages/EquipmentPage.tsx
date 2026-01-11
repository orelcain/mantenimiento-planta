import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit2,
  FileDown,
  Grid3X3,
  Image as ImageIcon,
  List,
  Mail,
  MapPin,
  Package,
  Plus,
  Search,
  Settings,
  Share2,
  Star,
  Text,
  Trash2,
  XCircle,
  ZoomIn,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui'
import { useAppStore, useAuthStore } from '@/store'
import { getEquipments, updateEquipment, addEquipmentPhoto, removeEquipmentPhoto } from '@/services/equipment'
import { getIncidents } from '@/services/incidents'
import { updateEquipmentSchema } from '@/lib/validation'
import { debounce, formatRelativeTime, generateId } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { usePermissions } from '@/hooks/usePermissions'
import { PhotoAnnotationEditor } from '@/components/PhotoAnnotationEditor'
import type { Equipment, Incident } from '@/types'

const ITEMS_PER_PAGE = 12

type ViewMode = 'grid' | 'list'

type EquipmentNote = {
  id: string
  text: string
  createdAt: string
}

type EquipmentNotesById = Record<string, EquipmentNote[]>

type StatusConfig = {
  label: string
  icon: any
  badgeClassName: string
  iconClassName: string
}

const STATUS_CONFIG: Record<Equipment['estado'], StatusConfig> = {
  operativo: {
    label: 'Operativo',
    icon: CheckCircle2,
    badgeClassName: 'bg-success text-success-foreground',
    iconClassName: 'text-success',
  },
  en_mantenimiento: {
    label: 'En Mantenimiento',
    icon: Settings,
    badgeClassName: 'bg-warning text-warning-foreground',
    iconClassName: 'text-warning',
  },
  fuera_servicio: {
    label: 'Fuera de Servicio',
    icon: XCircle,
    badgeClassName: 'bg-destructive text-destructive-foreground',
    iconClassName: 'text-destructive',
  },
}

const CRITICIDAD_CONFIG: Record<Equipment['criticidad'], { label: string; badgeClassName: string }> = {
  alta: { label: 'Alta', badgeClassName: 'bg-destructive text-destructive-foreground' },
  media: { label: 'Media', badgeClassName: 'bg-warning text-warning-foreground' },
  baja: { label: 'Baja', badgeClassName: 'bg-muted text-muted-foreground' },
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function favoritesStorageKey(userId?: string) {
  return `equipment_favorites_v1:${userId ?? 'anon'}`
}

function notesStorageKey(userId?: string) {
  return `equipment_notes_v1:${userId ?? 'anon'}`
}

function downloadTextFile(filename: string, content: string, contentType = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toCsv(rows: Record<string, string>[]) {
  const firstRow = rows[0]
  if (!firstRow) return ''
  const headers = Object.keys(firstRow)
  const escape = (value: string) => {
    const v = value ?? ''
    const needs = /[",\n]/.test(v)
    const escaped = v.replace(/"/g, '""')
    return needs ? `"${escaped}"` : escaped
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(String(row[h] ?? ''))).join(','))
  }
  return lines.join('\n')
}

export function EquipmentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { equipment, setEquipment, setSelectedIncident } = useAppStore()
  const user = useAuthStore((s) => s.user)
  const { canDeleteEquipment, canEditEquipment } = usePermissions()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showFavsOnly, setShowFavsOnly] = useState(false)
  const [filterSelectedIds, setFilterSelectedIds] = useState<Set<string>>(new Set())

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [compact, setCompact] = useState(false)

  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(1)

  const [detailEquipment, setDetailEquipment] = useState<Equipment | null>(null)
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)

  const [detailIncidents, setDetailIncidents] = useState<Incident[]>([])
  const [detailIncidentsLoading, setDetailIncidentsLoading] = useState(false)
  const [detailIncidentsError, setDetailIncidentsError] = useState<string | null>(null)

  const [notesById, setNotesById] = useState<EquipmentNotesById>({})
  const [newNoteText, setNewNoteText] = useState('')

  const [maintenanceEquipment, setMaintenanceEquipment] = useState<Equipment | null>(null)
  const [maintenanceType, setMaintenanceType] = useState<'local' | 'externo'>('local')
  const [maintenanceResponsible, setMaintenanceResponsible] = useState('')
  const [maintenanceNotes, setMaintenanceNotes] = useState('')
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareIncludeBasic, setShareIncludeBasic] = useState(true)
  const [shareIncludeHistory, setShareIncludeHistory] = useState(true)
  const [shareIncludeNotes, setShareIncludeNotes] = useState(true)
  const [shareIncludePhotos, setShareIncludePhotos] = useState(true)
  const [shareIncludeQR, setShareIncludeQR] = useState(false)
  const [shareFormat, setShareFormat] = useState<'pdf' | 'csv' | 'json'>('pdf')
  const [shareLoading, setShareLoading] = useState(false)
  const [selectedNotesByEquipment, setSelectedNotesByEquipment] = useState<Map<string, Set<string>>>(new Map())

  const [photoUploading, setPhotoUploading] = useState(false)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null)
  
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')

  const debouncedSetSearch = useMemo(
    () => debounce((value: string) => setDebouncedSearch(value), 300),
    []
  )

  const favKey = useMemo(() => favoritesStorageKey(user?.id), [user?.id])
  const notesKey = useMemo(() => notesStorageKey(user?.id), [user?.id])

  useEffect(() => {
    getEquipments().then(setEquipment)
  }, [setEquipment])

  // Procesar equipos seleccionados desde query params (desde jerarquía)
  useEffect(() => {
    const selectedParam = searchParams.get('selected')
    const idParam = searchParams.get('id')
    
    if (selectedParam) {
      const ids = selectedParam.split(',').filter(Boolean)
      setFilterSelectedIds(new Set(ids))
      setSelectedIds(new Set(ids))
    } else if (idParam) {
      setFilterSelectedIds(new Set([idParam]))
    } else {
      setFilterSelectedIds(new Set())
    }
  }, [searchParams])

  useEffect(() => {
    debouncedSetSearch(searchQuery)
  }, [searchQuery, debouncedSetSearch])

  useEffect(() => {
    const favRaw = safeParseJson<string[]>(localStorage.getItem(favKey))
    if (Array.isArray(favRaw)) setFavorites(new Set(favRaw))

    const notesRaw = safeParseJson<EquipmentNotesById>(localStorage.getItem(notesKey))
    if (notesRaw && typeof notesRaw === 'object') setNotesById(notesRaw)
  }, [favKey, notesKey])

  useEffect(() => {
    localStorage.setItem(favKey, JSON.stringify([...favorites]))
  }, [favorites, favKey])

  useEffect(() => {
    localStorage.setItem(notesKey, JSON.stringify(notesById))
  }, [notesById, notesKey])

  const filteredEquipment = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()

    return equipment.filter((eq) => {
      if (eq.deleted) return false

      const matchesSearch =
        q.length === 0 ||
        eq.nombre.toLowerCase().includes(q) ||
        eq.codigo.toLowerCase().includes(q) ||
        (eq.hierarchyPath?.toLowerCase().includes(q) ?? false)

      const matchesStatus = filterStatus === 'all' || eq.estado === filterStatus
      const matchesFav = !showFavsOnly || favorites.has(eq.id)
      const matchesSelected = filterSelectedIds.size === 0 || filterSelectedIds.has(eq.id)

      return matchesSearch && matchesStatus && matchesFav && matchesSelected
    })
  }, [debouncedSearch, equipment, favorites, filterStatus, showFavsOnly, filterSelectedIds])

  const totalPages = Math.max(1, Math.ceil(filteredEquipment.length / ITEMS_PER_PAGE))
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedEquipment = filteredEquipment.slice(startIndex, endIndex)

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const stats = useMemo(
    () => ({
      total: equipment.filter((e) => !e.deleted).length,
      operativos: equipment.filter((e) => !e.deleted && e.estado === 'operativo').length,
      enMantenimiento: equipment.filter((e) => !e.deleted && e.estado === 'en_mantenimiento').length,
      fueraServicio: equipment.filter((e) => !e.deleted && e.estado === 'fuera_servicio').length,
    }),
    [equipment]
  )

  const toggleFavorite = (equipmentId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(equipmentId)) next.delete(equipmentId)
      else next.add(equipmentId)
      return next
    })
  }

  const toggleSelected = (equipmentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(equipmentId)) next.delete(equipmentId)
      else next.add(equipmentId)
      return next
    })
  }

  const selectAllCurrentPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const eq of paginatedEquipment) next.add(eq.id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const bulkSetSyncExcluded = async (value: boolean) => {
    if (!canDeleteEquipment) {
      setBulkError('No tienes permisos para excluir/reincluir equipos del sync.')
      return
    }

    const ids = [...selectedIds]
    if (ids.length === 0) return

    const label = value ? 'excluir del sync' : 'reincluir al sync'
    const ok = window.confirm(
      `¿Confirmas ${label} ${ids.length} ${ids.length === 1 ? 'equipo' : 'equipos'}?`
    )
    if (!ok) return

    setBulkLoading(true)
    setBulkError(null)

    try {
      for (const id of ids) {
        await updateEquipment(id, { syncExcluded: value })
      }
      const fresh = await getEquipments()
      setEquipment(fresh)
      clearSelection()
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Error en acción masiva')
      logger.error('Bulk syncExcluded update failed', err)
      setBulkError('No se pudo completar la acción masiva. Intenta de nuevo.')
    } finally {
      setBulkLoading(false)
    }
  }

  const bulkChangeStatus = async (newStatus: Equipment['estado']) => {
    if (!canEditEquipment) {
      setBulkError('No tienes permisos para editar el estado de los equipos.')
      return
    }

    const ids = [...selectedIds]
    if (ids.length === 0) return

    const statusLabel = STATUS_CONFIG[newStatus].label
    const ok = window.confirm(
      `¿Confirmas cambiar el estado a "${statusLabel}" para ${ids.length} ${ids.length === 1 ? 'equipo' : 'equipos'}?`
    )
    if (!ok) return

    setBulkLoading(true)
    setBulkError(null)

    try {
      for (const id of ids) {
        await updateEquipment(id, { estado: newStatus })
      }
      const fresh = await getEquipments()
      setEquipment(fresh)
      clearSelection()
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Error en cambio masivo de estado')
      logger.error('Bulk status change failed', err)
      setBulkError('No se pudo cambiar el estado masivo. Intenta de nuevo.')
    } finally {
      setBulkLoading(false)
    }
  }

  const copySelectedCodes = () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return

    const codes = equipment
      .filter((e) => ids.includes(e.id))
      .map((e) => e.codigo)
      .join('\n')

    navigator.clipboard
      .writeText(codes)
      .then(() => {
        setBulkError(null)
        alert(`${ids.length} códigos copiados al portapapeles`)
      })
      .catch(() => {
        setBulkError('No se pudo copiar al portapapeles')
      })
  }

  const openMaintenanceModal = (eq: Equipment) => {
    setMaintenanceEquipment(eq)
    setMaintenanceType('local')
    setMaintenanceResponsible('')
    setMaintenanceNotes('')
  }

  const closeMaintenanceModal = () => {
    setMaintenanceEquipment(null)
    setMaintenanceResponsible('')
    setMaintenanceNotes('')
  }

  const submitMaintenance = async () => {
    if (!maintenanceEquipment || !canEditEquipment) return

    setMaintenanceLoading(true)

    try {
      await updateEquipment(maintenanceEquipment.id, {
        estado: 'en_mantenimiento',
      })

      const noteText = `⚙️ Mantenimiento ${maintenanceType === 'local' ? 'Local' : 'Externo'}${
        maintenanceResponsible ? ` - ${maintenanceResponsible}` : ''
      }${maintenanceNotes ? `\n${maintenanceNotes}` : ''}`

      const equipmentNotes = notesById[maintenanceEquipment.id] || []
      const newNote: EquipmentNote = {
        id: generateId(),
        text: noteText,
        createdAt: new Date().toISOString(),
      }

      setNotesById((prev) => ({
        ...prev,
        [maintenanceEquipment.id]: [...equipmentNotes, newNote],
      }))

      const fresh = await getEquipments()
      setEquipment(fresh)

      closeMaintenanceModal()
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Error al asignar mantenimiento')
      logger.error('Maintenance assignment failed', err)
      alert('No se pudo asignar el mantenimiento. Intenta de nuevo.')
    } finally {
      setMaintenanceLoading(false)
    }
  }

  const openShareModal = () => {
    if (selectedIds.size === 0) return
    setShareModalOpen(true)
  }

  const closeShareModal = () => {
    setShareModalOpen(false)
  }

  const generateShareData = async () => {
    const selectedEquipments = equipment.filter((e) => selectedIds.has(e.id))

    const data: any = {
      fecha_exportacion: new Date().toISOString(),
      total_equipos: selectedEquipments.length,
      equipos: [],
    }

    for (const eq of selectedEquipments) {
      const equipmentData: any = {}

      if (shareIncludeBasic) {
        equipmentData.codigo = eq.codigo
        equipmentData.nombre = eq.nombre
        equipmentData.estado = STATUS_CONFIG[eq.estado].label
        equipmentData.criticidad = CRITICIDAD_CONFIG[eq.criticidad].label
        equipmentData.ubicacion = eq.hierarchyPath || eq.zoneId || ''
        equipmentData.marca = eq.marca || ''
        equipmentData.modelo = eq.modelo || ''
        equipmentData.numero_serie = eq.numeroSerie || ''
      }

      if (shareIncludeHistory) {
        try {
          const incidents = await getIncidents({ equipmentId: eq.id, limit: 20 })
          equipmentData.historial = incidents.map((inc) => ({
            titulo: inc.titulo,
            prioridad: inc.prioridad,
            estado: inc.status,
            fecha: inc.createdAt,
          }))
        } catch (_e) {
          equipmentData.historial = []
        }
      }

      if (shareIncludeNotes) {
        const notes = notesById[eq.id] || []
        const selectedNotesSet = selectedNotesByEquipment.get(eq.id)
        
        // Si hay notas seleccionadas, filtrar solo esas; si no, incluir todas
        const notesToInclude = selectedNotesSet && selectedNotesSet.size > 0
          ? notes.filter((_, idx) => selectedNotesSet.has(`${eq.id}-${idx}`))
          : notes
        
        equipmentData.notas = notesToInclude.map((n) => ({
          texto: n.text,
          fecha: n.createdAt,
        }))
      }

      if (shareIncludePhotos && eq.photos && eq.photos.length > 0) {
        equipmentData.fotos = eq.photos.map((url, idx) => ({
          url,
          numero: idx + 1,
        }))
      }

      if (shareIncludeQR) {
        equipmentData.qr_url = `${window.location.origin}/mantenimiento-planta/public/equipment/${eq.id}`
      }

      data.equipos.push(equipmentData)
    }

    return data
  }

  const handleShareDownload = async () => {
    setShareLoading(true)

    try {
      const data = await generateShareData()

      if (shareFormat === 'json') {
        const json = JSON.stringify(data, null, 2)
        downloadTextFile('equipos_exportados.json', json)
      } else if (shareFormat === 'csv') {
        const rows = data.equipos.map((eq: any) => ({
          Código: eq.codigo || '',
          Nombre: eq.nombre || '',
          Estado: eq.estado || '',
          Criticidad: eq.criticidad || '',
          Ubicación: eq.ubicacion || '',
          Marca: eq.marca || '',
          Modelo: eq.modelo || '',
          'N° Serie': eq.numero_serie || '',
          'Incidencias': eq.historial?.length || 0,
          'Notas': eq.notas?.length || 0,
        }))
        const csv = toCsv(rows)
        downloadTextFile('equipos_exportados.csv', csv)
      } else if (shareFormat === 'pdf') {
        const pdfContent = generateSharePdfContent(data)
        downloadTextFile('equipos_exportados.txt', pdfContent)
        alert('Para generar PDF: copia este contenido y pégalo en un generador de PDF o imprime la página.')
      }

      closeShareModal()
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Error al generar exportación')
      logger.error('Share export failed', err)
      alert('No se pudo generar la exportación. Intenta de nuevo.')
    } finally {
      setShareLoading(false)
    }
  }

  const handleShareViaEmail = async () => {
    setShareLoading(true)

    try {
      const data = await generateShareData()
      const selectedEquipments = equipment.filter((e) => selectedIds.has(e.id))
      
      // Generar contenido HTML para email
      let htmlBody = `<html><body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Información de Equipos</h1>
        <p style="color: #666;">Fecha: ${new Date().toLocaleDateString()} - ${selectedEquipments.length} equipo(s)</p>
        <hr style="border: 1px solid #ddd; margin: 20px 0;">
      `

      for (const eq of selectedEquipments) {
        const StatusIcon = STATUS_CONFIG[eq.estado].label
        
        htmlBody += `
          <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 20px 0; background: #f9f9f9;">
            <h2 style="color: #2563eb; margin-top: 0;">${eq.nombre}</h2>
            <p style="color: #666; font-size: 14px;"><strong>Código:</strong> ${eq.codigo}</p>
            <p style="margin: 5px 0;"><span style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${StatusIcon}</span> <span style="background: #fef3c7; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${CRITICIDAD_CONFIG[eq.criticidad].label}</span></p>
        `

        if (eq.hierarchyPath) {
          htmlBody += `<p style="color: #666; font-size: 13px;">📍 ${eq.hierarchyPath}</p>`
        }

        if (eq.marca || eq.modelo || eq.numeroSerie) {
          htmlBody += `<div style="margin-top: 10px; font-size: 13px;">`
          if (eq.marca) htmlBody += `<p style="margin: 3px 0;"><strong>Marca:</strong> ${eq.marca}</p>`
          if (eq.modelo) htmlBody += `<p style="margin: 3px 0;"><strong>Modelo:</strong> ${eq.modelo}</p>`
          if (eq.numeroSerie) htmlBody += `<p style="margin: 3px 0;"><strong>N° Serie:</strong> ${eq.numeroSerie}</p>`
          htmlBody += `</div>`
        }

        // Incluir primera foto si está habilitado
        if (shareIncludePhotos && eq.photos && eq.photos.length > 0) {
          htmlBody += `
            <div style="margin-top: 15px;">
              <p style="font-weight: bold; margin-bottom: 8px;">📷 Foto principal:</p>
              <img src="${eq.photos[0]}" alt="Foto del equipo" style="max-width: 300px; border-radius: 4px; border: 1px solid #ddd;" />
              ${eq.photos.length > 1 ? `<p style="color: #666; font-size: 12px; margin-top: 5px;">+ ${eq.photos.length - 1} foto(s) más</p>` : ''}
            </div>
          `
        }

        // Incluir notas si está habilitado
        const notes = notesById[eq.id] || []
        if (shareIncludeNotes && notes.length > 0) {
          htmlBody += `
            <div style="margin-top: 15px; padding: 10px; background: #fff; border-left: 3px solid #3b82f6;">
              <p style="font-weight: bold; margin: 0 0 8px 0;">📝 Notas:</p>
          `
          notes.forEach(note => {
            htmlBody += `<p style="margin: 5px 0; font-size: 13px; color: #444;">• ${note.text} <span style="color: #999; font-size: 11px;">(${note.createdAt})</span></p>`
          })
          htmlBody += `</div>`
        }

        // Incluir QR si está habilitado
        if (shareIncludeQR) {
          const qrUrl = `${window.location.origin}/mantenimiento-planta/public/equipment/${eq.id}`
          htmlBody += `
            <div style="margin-top: 15px; padding: 10px; background: #fff; text-align: center; border: 1px solid #ddd; border-radius: 4px;">
              <p style="font-weight: bold; margin: 0 0 8px 0;">📱 Código QR</p>
              <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Escanea para ver este equipo en la app</p>
              <div style="background: white; padding: 10px; display: inline-block;">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <text x="60" y="60" text-anchor="middle" style="font-size: 10px; fill: #666;">[QR Code]</text>
                </svg>
              </div>
              <p style="font-size: 11px; color: #666; margin-top: 8px;">URL: <a href="${qrUrl}" style="color: #2563eb;">${qrUrl}</a></p>
            </div>
          `
        }

        htmlBody += `</div>`
      }

      htmlBody += `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px;">
          <p>Este reporte fue generado desde el Sistema de Gestión de Mantenimiento</p>
          <p>Para acceder a funciones completas, inicia sesión en la aplicación</p>
        </div>
      </body></html>`

      // Crear el body en texto plano como fallback
      const textBody = generateSharePdfContent(data)
      const subject = `Información de ${selectedEquipments.length} equipo(s) - ${new Date().toLocaleDateString()}`
      
      // Para email con HTML necesitamos un workaround porque mailto: no soporta HTML directamente
      // Abrimos con body en texto y el usuario puede copiar el HTML si lo necesita
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(textBody + '\\n\\nNota: Adjunta las fotos manualmente si es necesario.')}`
      
      closeShareModal()
    } catch (_e) {
      alert('No se pudo preparar el email. Intenta con la opción de descarga.')
    } finally {
      setShareLoading(false)
    }
  }

  const handleShareViaMobile = async () => {
    if (!navigator.share) {
      alert('Tu navegador no soporta la función de compartir. Usa la opción de descarga.')
      return
    }

    setShareLoading(true)

    try {
      const data = await generateShareData()
      const text = generateSharePdfContent(data)
      
      await navigator.share({
        title: `Exportación de ${data.total_equipos} equipos`,
        text: text.substring(0, 1000) + '...',
      })
      
      closeShareModal()
    } catch (_e) {
      if ((_e as Error).name !== 'AbortError') {
        alert('No se pudo compartir. Intenta con la opción de descarga.')
      }
    } finally {
      setShareLoading(false)
    }
  }

  const generateSharePdfContent = (data: any): string => {
    let content = `REPORTE DE EQUIPOS\n`
    content += `Fecha: ${new Date(data.fecha_exportacion).toLocaleString()}\n`
    content += `Total equipos: ${data.total_equipos}\n`
    content += `\n${'='.repeat(60)}\n\n`

    for (const eq of data.equipos) {
      content += `EQUIPO: ${eq.nombre}\n`
      content += `Código: ${eq.codigo}\n`
      
      if (shareIncludeBasic) {
        content += `Estado: ${eq.estado}\n`
        content += `Criticidad: ${eq.criticidad}\n`
        content += `Ubicación: ${eq.ubicacion}\n`
        if (eq.marca) content += `Marca: ${eq.marca}\n`
        if (eq.modelo) content += `Modelo: ${eq.modelo}\n`
        if (eq.numero_serie) content += `N° Serie: ${eq.numero_serie}\n`
      }

      if (shareIncludeHistory && eq.historial && eq.historial.length > 0) {
        content += `\nHistorial de Incidencias (${eq.historial.length}):\n`
        eq.historial.forEach((inc: any, i: number) => {
          content += `  ${i + 1}. ${inc.titulo} - ${inc.prioridad} - ${inc.estado}\n`
          content += `     Fecha: ${new Date(inc.fecha).toLocaleString()}\n`
        })
      }

      if (shareIncludeNotes && eq.notas && eq.notas.length > 0) {
        content += `\nNotas (${eq.notas.length}):\n`
        eq.notas.forEach((nota: any, i: number) => {
          content += `  ${i + 1}. ${nota.texto}\n`
          content += `     Fecha: ${new Date(nota.fecha).toLocaleString()}\n`
        })
      }

      if (shareIncludePhotos && eq.fotos && eq.fotos.length > 0) {
        content += `\nFotos (${eq.fotos.length}):\n`
        eq.fotos.forEach((foto: any) => {
          content += `  ${foto.numero}. ${foto.url}\n`
        })
      }

      if (shareIncludeQR && eq.qr_url) {
        content += `\nURL QR: ${eq.qr_url}\n`
      }

      content += `\n${'-'.repeat(60)}\n\n`
    }

    return content
  }

  const handleViewHierarchy = (eq: Equipment) => {
    const focusId = eq.hierarchyNodeId || eq.id
    const q = encodeURIComponent(eq.codigo)
    const focus = encodeURIComponent(focusId)
    navigate(`/hierarchy?q=${q}&focus=${focus}`)
  }

  const exportCsv = () => {
    const source = selectedIds.size > 0
      ? filteredEquipment.filter((e) => selectedIds.has(e.id))
      : filteredEquipment

    const rows = source.map((e) => ({
      Código: e.codigo,
      Nombre: e.nombre,
      Estado: STATUS_CONFIG[e.estado].label,
      Criticidad: CRITICIDAD_CONFIG[e.criticidad].label,
      Ubicación: e.hierarchyPath ?? e.zoneId ?? '',
      Marca: e.marca ?? '',
      Modelo: e.modelo ?? '',
      'N° Serie': e.numeroSerie ?? '',
    }))

    const csv = toCsv(rows)
    const fileName = selectedIds.size > 0 ? 'equipos_seleccionados.csv' : 'equipos.csv'
    downloadTextFile(fileName, csv)
  }

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!detailEquipment) return

      setDetailIncidents([])
      setDetailIncidentsError(null)
      setDetailIncidentsLoading(true)

      try {
        const incidents = await getIncidents({ equipmentId: detailEquipment.id, limit: 50 })
        if (!cancelled) setDetailIncidents(incidents)
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error('Error cargando incidencias')
        logger.error('Error loading equipment incidents', err)
        if (!cancelled) setDetailIncidentsError('No se pudo cargar el historial de incidencias.')
      } finally {
        if (!cancelled) setDetailIncidentsLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [detailEquipment])

  const openDetail = (eq: Equipment) => {
    setDetailEquipment(eq)
    setNewNoteText('')
  }

  const closeDetail = () => setDetailEquipment(null)

  const addNote = () => {
    if (!detailEquipment) return
    const text = newNoteText.trim()
    if (!text) return

    const note: EquipmentNote = {
      id: generateId(),
      text,
      createdAt: new Date().toISOString(),
    }

    setNotesById((prev) => {
      const next = { ...prev }
      const list = next[detailEquipment.id] ?? []
      next[detailEquipment.id] = [note, ...list]
      return next
    })

    setNewNoteText('')
  }

  const editNote = (equipmentId: string, noteId: string, newText: string) => {
    const text = newText.trim()
    if (!text) return

    setNotesById((prev) => {
      const next = { ...prev }
      const list = next[equipmentId] ?? []
      next[equipmentId] = list.map((note) =>
        note.id === noteId ? { ...note, text } : note
      )
      return next
    })
  }

  const deleteNote = (equipmentId: string, noteId: string) => {
    setNotesById((prev) => {
      const next = { ...prev }
      const list = next[equipmentId] ?? []
      next[equipmentId] = list.filter((note) => note.id !== noteId)
      return next
    })
  }

  const openEditFromDetail = () => {
    if (!detailEquipment) return
    setEditingEquipment(detailEquipment)
  }

  const onSaveEquipment = async () => {
    const fresh = await getEquipments()
    setEquipment(fresh)

    setEditingEquipment(null)

    if (detailEquipment) {
      const updated = fresh.find((e) => e.id === detailEquipment.id) ?? null
      setDetailEquipment(updated)
    }
  }

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !detailEquipment || !canEditEquipment) return

    setPhotoUploading(true)

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file) {
          await addEquipmentPhoto(detailEquipment.id, file)
        }
      }

      const fresh = await getEquipments()
      setEquipment(fresh)

      const updated = fresh.find((e) => e.id === detailEquipment.id) ?? null
      if (updated) setDetailEquipment(updated)
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Error al subir fotos')
      logger.error('Photo upload failed', err)
      alert('No se pudieron subir las fotos. Intenta de nuevo.')
    } finally {
      setPhotoUploading(false)
    }
  }

  const handlePhotoDelete = async (photoUrl: string) => {
    if (!detailEquipment || !canEditEquipment) return

    const ok = window.confirm('¿Eliminar esta foto?')
    if (!ok) return

    try {
      await removeEquipmentPhoto(detailEquipment.id, photoUrl)

      const fresh = await getEquipments()
      setEquipment(fresh)

      const updated = fresh.find((e) => e.id === detailEquipment.id) ?? null
      if (updated) setDetailEquipment(updated)
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error('Error al eliminar foto')
      logger.error('Photo delete failed', err)
      alert('No se pudo eliminar la foto. Intenta de nuevo.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Equipos</h1>
            <p className="text-sm text-muted-foreground">Se sincroniza automáticamente desde la jerarquía</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={showFavsOnly ? 'default' : 'outline'}
            onClick={() => {
              setShowFavsOnly((v) => !v)
              setCurrentPage(1)
            }}
          >
            <Star className="h-4 w-4 mr-2" />
            Favoritos
          </Button>

          <Button variant="outline" onClick={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}>
            {viewMode === 'grid' ? <List className="h-4 w-4 mr-2" /> : <Grid3X3 className="h-4 w-4 mr-2" />}
            {viewMode === 'grid' ? 'Lista' : 'Grid'}
          </Button>

          <Button variant={compact ? 'default' : 'outline'} onClick={() => setCompact((v) => !v)}>
            <Text className="h-4 w-4 mr-2" />
            Compacto
          </Button>

          <Button variant="outline" onClick={exportCsv} disabled={filteredEquipment.length === 0}>
            <FileDown className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total Equipos</div>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-success">{stats.operativos}</div>
                <div className="text-sm text-muted-foreground">Operativos</div>
              </div>
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-warning">{stats.enMantenimiento}</div>
                <div className="text-sm text-muted-foreground">En Mantenimiento</div>
              </div>
              <Settings className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-destructive">{stats.fueraServicio}</div>
                <div className="text-sm text-muted-foreground">Fuera de Servicio</div>
              </div>
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            {/* Badge filtro activo desde jerarquía */}
            {filterSelectedIds.size > 0 && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex-1 text-sm text-blue-700">
                  Mostrando {filterSelectedIds.size} {filterSelectedIds.size === 1 ? 'equipo seleccionado' : 'equipos seleccionados'} desde jerarquía
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterSelectedIds(new Set())
                    navigate('/equipment', { replace: true })
                  }}
                  className="text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                >
                  Ver todos
                </Button>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, código o ubicación..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-9"
                />
              </div>
              <Select
                value={filterStatus}
                onValueChange={(value) => {
                  setFilterStatus(value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="operativo">✓ Operativo</SelectItem>
                  <SelectItem value="en_mantenimiento">⚙ En Mantenimiento</SelectItem>
                  <SelectItem value="fuera_servicio">✗ Fuera de Servicio</SelectItem>
                </SelectContent>
              </Select>
              {filteredEquipment.length > 0 && (
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {filteredEquipment.length} {filteredEquipment.length === 1 ? 'equipo' : 'equipos'}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={selectAllCurrentPage} disabled={paginatedEquipment.length === 0}>
                Seleccionar página
              </Button>
              <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedIds.size === 0}>
                Limpiar selección
              </Button>
              {selectedIds.size > 0 && <Badge variant="secondary">{selectedIds.size} seleccionados</Badge>}
            </div>

            {(bulkError || selectedIds.size > 0) && (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {bulkError ? (
                  <div className="text-sm text-destructive">{bulkError}</div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Acciones masivas sobre la selección
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <Select
                    value=""
                    onValueChange={(value) => bulkChangeStatus(value as Equipment['estado'])}
                    disabled={selectedIds.size === 0 || bulkLoading || !canEditEquipment}
                  >
                    <SelectTrigger className="w-[180px] h-9 text-sm" title={!canEditEquipment ? 'Sin permisos' : undefined}>
                      <SelectValue placeholder="Cambiar estado..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operativo">✓ Operativo</SelectItem>
                      <SelectItem value="en_mantenimiento">⚙ En Mantenimiento</SelectItem>
                      <SelectItem value="fuera_servicio">✗ Fuera de Servicio</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.size === 0}
                    onClick={copySelectedCodes}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copiar códigos
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.size === 0}
                    onClick={exportCsv}
                  >
                    <FileDown className="h-4 w-4 mr-1" />
                    Exportar CSV
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    disabled={selectedIds.size === 0}
                    onClick={openShareModal}
                  >
                    <Share2 className="h-4 w-4 mr-1" />
                    Compartir
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.size === 0 || bulkLoading || !canDeleteEquipment}
                    onClick={() => bulkSetSyncExcluded(true)}
                    title={!canDeleteEquipment ? 'Sin permisos' : undefined}
                  >
                    {bulkLoading ? 'Procesando…' : 'Excluir del sync'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedIds.size === 0 || bulkLoading || !canDeleteEquipment}
                    onClick={() => bulkSetSyncExcluded(false)}
                    title={!canDeleteEquipment ? 'Sin permisos' : undefined}
                  >
                    {bulkLoading ? 'Procesando…' : 'Reincluir al sync'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div
        className={
          viewMode === 'grid'
            ? `grid gap-4 ${compact ? 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' : 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`
            : 'space-y-2'
        }
      >
        {filteredEquipment.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No hay equipos</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterStatus !== 'all' || showFavsOnly || filterSelectedIds.size > 0
                  ? 'No se encontraron equipos con los filtros aplicados'
                  : 'Aún no hay equipos sincronizados desde la jerarquía'}
              </p>
            </CardContent>
          </Card>
        ) : (
          paginatedEquipment.map((eq) => (
            <EquipmentCard
              key={eq.id}
              equipment={eq}
              selected={selectedIds.has(eq.id)}
              favorite={favorites.has(eq.id)}
              viewMode={viewMode}
              compact={compact}
              onToggleSelected={() => toggleSelected(eq.id)}
              onToggleFavorite={() => toggleFavorite(eq.id)}
              onOpenDetail={() => openDetail(eq)}
              onViewHierarchy={() => handleViewHierarchy(eq)}
              onQuickMaintenance={() => openMaintenanceModal(eq)}
            />
          ))
        )}
      </div>

      {filteredEquipment.length > 0 && totalPages > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-col sm:flex-row">
              <div className="text-sm text-muted-foreground">
                Mostrando {startIndex + 1}-{Math.min(endIndex, filteredEquipment.length)} de {filteredEquipment.length} equipos
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="w-10"
                        >
                          {page}
                        </Button>
                      )
                    }
                    if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <span key={page} className="px-2 text-muted-foreground">
                          ...
                        </span>
                      )
                    }
                    return null
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {detailEquipment && (
        <EquipmentDetailDialog
          equipment={detailEquipment}
          favorite={favorites.has(detailEquipment.id)}
          incidents={detailIncidents}
          incidentsLoading={detailIncidentsLoading}
          incidentsError={detailIncidentsError}
          notes={notesById[detailEquipment.id] ?? []}
          newNoteText={newNoteText}
          photoUploading={photoUploading}
          selectedPhotoIndex={selectedPhotoIndex}
          editingNoteId={editingNoteId}
          editingNoteText={editingNoteText}
          onNewNoteTextChange={setNewNoteText}
          onAddNote={addNote}
          onEditNote={(noteId, newText) => {
            editNote(detailEquipment.id, noteId, newText)
            setEditingNoteId(null)
            setEditingNoteText('')
          }}
          onDeleteNote={(noteId) => deleteNote(detailEquipment.id, noteId)}
          onStartEditNote={(noteId, text) => {
            setEditingNoteId(noteId)
            setEditingNoteText(text)
          }}
          onCancelEditNote={() => {
            setEditingNoteId(null)
            setEditingNoteText('')
          }}
          onEditingNoteTextChange={setEditingNoteText}
          onToggleFavorite={() => toggleFavorite(detailEquipment.id)}
          onViewHierarchy={() => handleViewHierarchy(detailEquipment)}
          onEdit={openEditFromDetail}
          onOpenIncident={(incident) => {
            setSelectedIncident(incident)
            navigate('/incidents')
          }}
          onPhotoUpload={handlePhotoUpload}
          onPhotoDelete={handlePhotoDelete}
          onPhotoSelect={setSelectedPhotoIndex}
          onEditPhoto={(photoUrl) => setEditingPhoto(photoUrl)}
          onClose={closeDetail}
        />
      )}

      {/* Photo annotation editor */}
      {editingPhoto && (
        <PhotoAnnotationEditor
          photoUrl={editingPhoto}
          onSave={async (annotatedImageUrl) => {
            // TODO: Subir imagen anotada y reemplazar la original
            // Por ahora solo cerramos
            setEditingPhoto(null)
          }}
          onClose={() => setEditingPhoto(null)}
        />
      )}
      {maintenanceEquipment && (
        <Dialog open onOpenChange={(open) => !open && closeMaintenanceModal()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Asignar mantenimiento</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold mb-1">{maintenanceEquipment.nombre}</div>
                <div className="text-xs text-muted-foreground font-mono">{maintenanceEquipment.codigo}</div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maintenanceType">Tipo de mantenimiento</Label>
                <Select value={maintenanceType} onValueChange={(v) => setMaintenanceType(v as 'local' | 'externo')}>
                  <SelectTrigger id="maintenanceType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">🔧 Local (Departamento de Mantenimiento)</SelectItem>
                    <SelectItem value="externo">🏢 Externo (Servicio Tercerizado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maintenanceResponsible">
                  {maintenanceType === 'local' ? 'Responsable/Técnico' : 'Proveedor/Empresa'}
                </Label>
                <Input
                  id="maintenanceResponsible"
                  value={maintenanceResponsible}
                  onChange={(e) => setMaintenanceResponsible(e.target.value)}
                  placeholder={maintenanceType === 'local' ? 'Nombre del técnico...' : 'Nombre de la empresa...'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maintenanceNotes">Notas adicionales (opcional)</Label>
                <Textarea
                  id="maintenanceNotes"
                  value={maintenanceNotes}
                  onChange={(e) => setMaintenanceNotes(e.target.value)}
                  placeholder="Detalles del mantenimiento, piezas a revisar, etc..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeMaintenanceModal} disabled={maintenanceLoading}>
                Cancelar
              </Button>
              <Button onClick={submitMaintenance} disabled={maintenanceLoading || !canEditEquipment}>
                {maintenanceLoading ? 'Guardando...' : 'Asignar mantenimiento'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {shareModalOpen && (
        <Dialog open onOpenChange={(open) => !open && closeShareModal()}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Compartir equipos seleccionados</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {selectedIds.size} {selectedIds.size === 1 ? 'equipo seleccionado' : 'equipos seleccionados'}
              </div>

              <div className="space-y-3">
                <Label className="text-base">¿Qué información incluir?</Label>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shareBasic"
                    checked={shareIncludeBasic}
                    onCheckedChange={(checked) => setShareIncludeBasic(checked as boolean)}
                  />
                  <Label htmlFor="shareBasic" className="text-sm font-normal cursor-pointer">
                    Datos básicos (código, nombre, estado, ubicación, marca, modelo)
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shareHistory"
                    checked={shareIncludeHistory}
                    onCheckedChange={(checked) => setShareIncludeHistory(checked as boolean)}
                  />
                  <Label htmlFor="shareHistory" className="text-sm font-normal cursor-pointer">
                    Historial de incidencias (últimas 20 por equipo)
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shareNotes"
                    checked={shareIncludeNotes}
                    onCheckedChange={(checked) => setShareIncludeNotes(checked as boolean)}
                  />
                  <Label htmlFor="shareNotes" className="text-sm font-normal cursor-pointer">
                    Notas internas del usuario
                  </Label>
                </div>

                {/* Selector individual de notas cuando está habilitado */}
                {shareIncludeNotes && (
                  <div className="ml-6 mt-2 space-y-2 border-l-2 border-gray-200 pl-4">
                    <p className="text-xs text-gray-600 mb-2">Selecciona las notas a incluir:</p>
                    {equipment.filter((e) => selectedIds.has(e.id)).map((eq) => {
                      const eqNotes = notesById[eq.id] || []
                      if (eqNotes.length === 0) return null

                      const selectedNotesSet = selectedNotesByEquipment.get(eq.id) || new Set()
                      
                      return (
                        <div key={eq.id} className="bg-gray-50 p-2 rounded">
                          <p className="text-xs font-semibold text-gray-700 mb-1">{eq.nombre}</p>
                          <div className="space-y-1">
                            {eqNotes.map((note, idx) => {
                              const noteId = `${eq.id}-${idx}`
                              const isChecked = selectedNotesSet.has(noteId)
                              
                              return (
                                <div key={noteId} className="flex items-start space-x-2">
                                  <Checkbox
                                    id={noteId}
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      const newMap = new Map(selectedNotesByEquipment)
                                      const noteSet = new Set(newMap.get(eq.id) || [])
                                      if (checked) {
                                        noteSet.add(noteId)
                                      } else {
                                        noteSet.delete(noteId)
                                      }
                                      newMap.set(eq.id, noteSet)
                                      setSelectedNotesByEquipment(newMap)
                                    }}
                                  />
                                  <Label htmlFor={noteId} className="text-xs font-normal cursor-pointer">
                                    {note.text.substring(0, 50)}{note.text.length > 50 ? '...' : ''} 
                                    <span className="text-gray-400 ml-1">({note.createdAt})</span>
                                  </Label>
                                </div>
                              )
                            })}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => {
                                const newMap = new Map(selectedNotesByEquipment)
                                const allNoteIds = eqNotes.map((_, idx) => `${eq.id}-${idx}`)
                                newMap.set(eq.id, new Set(allNoteIds))
                                setSelectedNotesByEquipment(newMap)
                              }}
                            >
                              Todas
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => {
                                const newMap = new Map(selectedNotesByEquipment)
                                newMap.set(eq.id, new Set())
                                setSelectedNotesByEquipment(newMap)
                              }}
                            >
                              Ninguna
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sharePhotos"
                    checked={shareIncludePhotos}
                    onCheckedChange={(checked) => setShareIncludePhotos(checked as boolean)}
                  />
                  <Label htmlFor="sharePhotos" className="text-sm font-normal cursor-pointer">
                    Fotos del equipo
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shareQR"
                    checked={shareIncludeQR}
                    onCheckedChange={(checked) => setShareIncludeQR(checked as boolean)}
                  />
                  <Label htmlFor="shareQR" className="text-sm font-normal cursor-pointer">
                    URLs para códigos QR
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shareFormat">Formato de exportación</Label>
                <Select value={shareFormat} onValueChange={(v) => setShareFormat(v as 'pdf' | 'csv' | 'json')}>
                  <SelectTrigger id="shareFormat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">📄 PDF/Texto (para imprimir o copiar)</SelectItem>
                    <SelectItem value="csv">📊 CSV (para Excel)</SelectItem>
                    <SelectItem value="json">💾 JSON (para sistemas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4 space-y-2">
                <Label className="text-base">¿Cómo deseas compartir?</Label>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={handleShareDownload}
                    disabled={shareLoading}
                    className="justify-start"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Descargar archivo
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleShareViaEmail}
                    disabled={shareLoading}
                    className="justify-start"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Enviar por correo electrónico
                  </Button>

                  {'share' in navigator && (
                    <Button
                      variant="outline"
                      onClick={handleShareViaMobile}
                      disabled={shareLoading}
                      className="justify-start"
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Compartir vía móvil
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeShareModal} disabled={shareLoading}>
                Cancelar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editingEquipment && (
        <EquipmentForm equipment={editingEquipment} onClose={() => setEditingEquipment(null)} onSuccess={onSaveEquipment} />
      )}
    </div>
  )
}

function EquipmentCard({
  equipment,
  selected,
  favorite,
  viewMode,
  compact,
  onToggleSelected,
  onToggleFavorite,
  onOpenDetail,
  onViewHierarchy,
  onQuickMaintenance,
}: {
  equipment: Equipment
  selected: boolean
  favorite: boolean
  viewMode: ViewMode
  compact: boolean
  onToggleSelected: () => void
  onToggleFavorite: () => void
  onOpenDetail: () => void
  onViewHierarchy: () => void
  onQuickMaintenance: () => void
}) {
  const statusConfig = STATUS_CONFIG[equipment.estado]
  const criticidadConfig = CRITICIDAD_CONFIG[equipment.criticidad]
  const StatusIcon = statusConfig.icon

  const titleClassName = compact
    ? 'text-xs leading-snug line-clamp-3 group-hover:text-primary transition-colors'
    : 'text-sm leading-snug line-clamp-3 group-hover:text-primary transition-colors'

  const codeBadgeClassName = compact ? 'font-mono text-[10px]' : 'font-mono text-[11px]'
  const metaBadgeTextClassName = compact ? 'text-[10px]' : 'text-[11px]'
  const headerClassName = compact ? 'p-3 pb-2' : 'p-3.5 pb-2.5'
  const contentClassName = compact ? 'p-3 pt-0 space-y-2' : 'p-3.5 pt-0 space-y-2.5'
  const statusIconSizeClassName = compact ? 'h-4 w-4' : 'h-5 w-5'
  const favButtonClassName = compact ? 'h-7 w-7' : 'h-8 w-8'
  const favIconSizeClassName = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const smallTextClassName = compact ? 'text-[11px]' : 'text-xs'
  const actionButtonClassName = compact ? 'h-6 text-[11px]' : 'h-7 text-xs'

  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/50 transition-colors">
        <CardContent className={compact ? 'p-3' : 'p-4'}>
          <div className="flex items-start gap-3">
            <Checkbox checked={selected} onCheckedChange={() => onToggleSelected()} />

            <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenDetail}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={compact ? 'text-sm font-semibold truncate' : 'font-semibold truncate'}>{equipment.nombre}</div>
                  <div
                    className={
                      compact
                        ? 'text-[11px] text-muted-foreground font-mono truncate'
                        : 'text-sm text-muted-foreground font-mono truncate'
                    }
                  >
                    {equipment.codigo}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusIcon className={`${statusIconSizeClassName} ${statusConfig.iconClassName}`} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleFavorite()
                    }}
                    title={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                  >
                    <Star className={`${favIconSizeClassName} ${favorite ? 'fill-current text-yellow-500' : ''}`} />
                  </Button>
                </div>
              </div>

              {(equipment.hierarchyPath || equipment.zoneId) && (
                <div className={`flex items-start gap-2 text-muted-foreground mt-2 ${smallTextClassName}`}>
                  <MapPin className={compact ? 'h-3 w-3 flex-shrink-0 mt-0.5' : 'h-3.5 w-3.5 flex-shrink-0 mt-0.5'} />
                  <span className={compact ? 'line-clamp-2' : 'line-clamp-2'}>{equipment.hierarchyPath || equipment.zoneId}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {equipment.syncExcluded && (
                    <Badge variant="outline" className={metaBadgeTextClassName}>
                      Excluido
                    </Badge>
                  )}
                  <Badge variant="outline" className={`${criticidadConfig.badgeClassName} ${metaBadgeTextClassName}`}>
                    {criticidadConfig.label}
                  </Badge>
                  <Badge className={`${statusConfig.badgeClassName} ${metaBadgeTextClassName}`}>{statusConfig.label}</Badge>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className={actionButtonClassName}
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewHierarchy()
                  }}
                >
                  Ver jerarquía
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group" onClick={onOpenDetail}>
      <CardHeader className={headerClassName}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelected()}
              onClick={(e) => e.stopPropagation()}
              aria-label="Seleccionar equipo"
            />
            <div className="flex-1 min-w-0">
              <CardTitle className={`${titleClassName} mb-1`}>
                {equipment.nombre}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={codeBadgeClassName}>
                  {equipment.codigo}
                </Badge>
                {equipment.syncExcluded && (
                  <Badge variant="outline" className={metaBadgeTextClassName}>
                    Excluido
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusIcon className={`${statusIconSizeClassName} flex-shrink-0 ${statusConfig.iconClassName}`} />
            <Button
              variant="ghost"
              size="icon"
              className={favButtonClassName}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite()
              }}
              title={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
            >
              <Star className={`${favIconSizeClassName} ${favorite ? 'fill-current text-yellow-500' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>
        {(equipment.hierarchyPath || equipment.zoneId) && (
          <div className={`flex items-start gap-2 text-muted-foreground ${smallTextClassName}`}>
            <MapPin className={compact ? 'h-3 w-3 flex-shrink-0 mt-0.5' : 'h-3.5 w-3.5 flex-shrink-0 mt-0.5'} />
            <span className="line-clamp-2">{equipment.hierarchyPath || equipment.zoneId}</span>
          </div>
        )}

        {equipment.marca && (
          <div className={`text-muted-foreground truncate ${smallTextClassName}`}>
            <span className="font-medium">{equipment.marca}</span>
            {equipment.modelo && <span> · {equipment.modelo}</span>}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2 border-t">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`${criticidadConfig.badgeClassName} ${metaBadgeTextClassName}`}>
                {criticidadConfig.label}
              </Badge>
              {equipment.photos && equipment.photos.length > 0 && (
                <Badge variant="secondary" className={`${metaBadgeTextClassName} flex items-center gap-1`}>
                  <ImageIcon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                  {equipment.photos.length}
                </Badge>
              )}
            </div>
            <Badge className={`${statusConfig.badgeClassName} ${metaBadgeTextClassName}`}>
              {statusConfig.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={`flex-1 ${actionButtonClassName}`}
              onClick={(e) => {
                e.stopPropagation()
                onQuickMaintenance()
              }}
              title="Asignar mantenimiento"
            >
              <Settings className={compact ? 'h-3 w-3 mr-1' : 'h-3.5 w-3.5 mr-1'} />
              Mantenimiento
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={actionButtonClassName}
              onClick={(e) => {
                e.stopPropagation()
                onViewHierarchy()
              }}
              title="Ver en jerarquía"
            >
              Ver jerarquía
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EquipmentDetailDialog({
  equipment,
  favorite,
  incidents,
  incidentsLoading,
  incidentsError,
  notes,
  newNoteText,
  photoUploading,
  selectedPhotoIndex,
  editingNoteId,
  editingNoteText,
  onNewNoteTextChange,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onStartEditNote,
  onCancelEditNote,
  onEditingNoteTextChange,
  onToggleFavorite,
  onViewHierarchy,
  onEdit,
  onOpenIncident,
  onPhotoUpload,
  onPhotoDelete,
  onPhotoSelect,
  onEditPhoto,
  onClose,
}: {
  equipment: Equipment
  favorite: boolean
  incidents: Incident[]
  incidentsLoading: boolean
  incidentsError: string | null
  notes: EquipmentNote[]
  newNoteText: string
  photoUploading: boolean
  selectedPhotoIndex: number | null
  editingNoteId: string | null
  editingNoteText: string
  onNewNoteTextChange: (v: string) => void
  onAddNote: () => void
  onEditNote: (noteId: string, newText: string) => void
  onDeleteNote: (noteId: string) => void
  onStartEditNote: (noteId: string, text: string) => void
  onCancelEditNote: () => void
  onEditingNoteTextChange: (text: string) => void
  onToggleFavorite: () => void
  onViewHierarchy: () => void
  onEdit: () => void
  onOpenIncident: (incident: Incident) => void
  onPhotoUpload: (files: FileList | null) => void
  onPhotoDelete: (photoUrl: string) => void
  onPhotoSelect: (index: number | null) => void
  onEditPhoto: (photoUrl: string) => void
  onClose: () => void
}) {
  const statusConfig = STATUS_CONFIG[equipment.estado]
  const criticidadConfig = CRITICIDAD_CONFIG[equipment.criticidad]

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="truncate">{equipment.nombre}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFavorite}
              title={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
            >
              <Star className={`h-5 w-5 ${favorite ? 'fill-current text-yellow-500' : ''}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="font-mono text-xs">
            {equipment.codigo}
          </Badge>
          <Badge className={`${statusConfig.badgeClassName} text-xs`}>{statusConfig.label}</Badge>
          <Badge variant="outline" className={`${criticidadConfig.badgeClassName} text-xs`}>
            {criticidadConfig.label}
          </Badge>
          {equipment.syncExcluded && (
            <Badge variant="outline" className="text-xs">
              Excluido
            </Badge>
          )}
        </div>

        {(equipment.hierarchyPath || equipment.zoneId) && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mt-0.5" />
            <span className="line-clamp-2">{equipment.hierarchyPath || equipment.zoneId}</span>
          </div>
        )}

        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Información</TabsTrigger>
            <TabsTrigger value="photos">Fotos ({equipment.photos?.length || 0})</TabsTrigger>
            <TabsTrigger value="history">Historial ({incidents.length})</TabsTrigger>
            <TabsTrigger value="notes">Notas ({notes.length})</TabsTrigger>
            <TabsTrigger value="qr">QR</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <Card>
              <CardContent className="p-4 grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Marca</div>
                  <div className="font-medium">{equipment.marca || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Modelo</div>
                  <div className="font-medium">{equipment.modelo || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Número de serie</div>
                  <div className="font-medium">{equipment.numeroSerie || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Estado</div>
                  <div className="font-medium">{statusConfig.label}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-muted-foreground">Descripción</div>
                  <div className="font-medium whitespace-pre-wrap">{equipment.descripcion || '-'}</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="photos">
            <Card>
              <CardContent className="p-4 space-y-4">
                {/* Upload section */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Galería de fotos</h3>
                  <div>
                    <input
                      type="file"
                      id="photo-upload"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => onPhotoUpload(e.target.files)}
                      disabled={photoUploading}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('photo-upload')?.click()}
                      disabled={photoUploading}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {photoUploading ? 'Subiendo...' : 'Agregar fotos'}
                    </Button>
                  </div>
                </div>

                {/* Photos grid */}
                {equipment.photos && equipment.photos.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {equipment.photos.map((photoUrl, idx) => (
                      <div key={photoUrl} className="relative group aspect-square rounded-lg overflow-hidden border">
                        <img
                          src={photoUrl}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => onPhotoSelect(idx)}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              onPhotoSelect(idx)
                            }}
                          >
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              onPhotoDelete(photoUrl)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No hay fotos todavía</p>
                    <p className="text-sm">Haz clic en "Agregar fotos" para subir imágenes</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <div className="space-y-3">
              {incidentsLoading && (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">Cargando incidencias…</CardContent>
                </Card>
              )}
              {incidentsError && (
                <Card>
                  <CardContent className="p-4 text-sm text-destructive">{incidentsError}</CardContent>
                </Card>
              )}
              {!incidentsLoading && !incidentsError && incidents.length === 0 && (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">Este equipo aún no tiene incidencias registradas.</CardContent>
                </Card>
              )}

              {incidents.map((inc) => (
                <Card key={inc.id} className="cursor-pointer hover:border-primary/50" onClick={() => onOpenIncident(inc)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{inc.titulo}</div>
                        <div className="text-sm text-muted-foreground truncate">{formatRelativeTime(inc.createdAt)}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-xs">
                          {inc.tipo}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {inc.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {inc.prioridad}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="notes">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-4 space-y-2">
                  <Label htmlFor="note">Nueva nota</Label>
                  <Textarea
                    id="note"
                    value={newNoteText}
                    onChange={(e) => onNewNoteTextChange(e.target.value)}
                    placeholder="Escribe una nota rápida sobre este equipo…"
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button onClick={onAddNote} disabled={!newNoteText.trim()}>
                      Guardar nota
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {notes.length === 0 ? (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">Sin notas aún.</CardContent>
                </Card>
              ) : (
                notes.map((n) => (
                  <Card key={n.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="text-sm text-muted-foreground mb-1">{formatRelativeTime(n.createdAt)}</div>
                          {editingNoteId === n.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingNoteText}
                                onChange={(e) => onEditingNoteTextChange(e.target.value)}
                                rows={3}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    onEditNote(n.id, editingNoteText)
                                  }}
                                  disabled={!editingNoteText.trim()}
                                >
                                  Guardar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={onCancelEditNote}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap">{n.text}</div>
                          )}
                        </div>
                        {editingNoteId !== n.id && (
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onStartEditNote(n.id, n.text)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('¿Eliminar esta nota?')) {
                                  onDeleteNote(n.id)
                                }
                              }}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="qr">
            <Card>
              <CardContent className="p-6 space-y-6">
                {/* QR Code Visual */}
                <div className="flex flex-col items-center gap-4">
                  <div className="text-sm font-medium text-center">Código QR del Equipo</div>
                  <div className="p-4 bg-white rounded-lg border-2 border-border">
                    <QRCodeSVG
                      value={`${window.location.origin}/equipment/${equipment.id}`}
                      size={200}
                      level="H"
                      includeMargin
                      data-qr={equipment.id}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground text-center max-w-xs">
                    Escanea este código para acceder directamente al equipo
                  </div>
                </div>

                {/* Texto del QR */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">URL del equipo</div>
                  <div className="font-mono text-xs p-3 rounded-md bg-muted break-all">
                    {`${window.location.origin}/equipment/${equipment.id}`}
                  </div>
                </div>

                {/* Código del equipo */}
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Código del equipo</div>
                  <div className="font-mono text-sm p-3 rounded-md bg-muted break-all">
                    {equipment.qrCode || equipment.codigo}
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const text = `${window.location.origin}/equipment/${equipment.id}`
                      try {
                        await navigator.clipboard.writeText(text)
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar URL
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const svg = document.querySelector(`svg[data-qr="${equipment.id}"]`)
                      if (!svg) return
                      const svgData = new XMLSerializer().serializeToString(svg)
                      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
                      const url = URL.createObjectURL(svgBlob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = `qr-${equipment.codigo}.svg`
                      link.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Descargar QR
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onViewHierarchy}>
            Ver jerarquía
          </Button>
          <Button onClick={onEdit}>Editar</Button>
        </DialogFooter>
      </DialogContent>

      {/* Photo preview modal */}
      {selectedPhotoIndex !== null && equipment.photos && equipment.photos[selectedPhotoIndex] && (
        <Dialog open onOpenChange={() => onPhotoSelect(null)}>
          <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                Foto {selectedPhotoIndex + 1} de {equipment.photos.length}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 relative min-h-0">
              <img
                src={equipment.photos[selectedPhotoIndex]}
                alt={`Foto ${selectedPhotoIndex + 1}`}
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => onPhotoSelect(Math.max(0, selectedPhotoIndex - 1))}
                disabled={selectedPhotoIndex === 0}
              >
                Anterior
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const photoUrl = equipment.photos?.[selectedPhotoIndex]
                    if (photoUrl) {
                      onEditPhoto(photoUrl)
                    }
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Editar anotaciones
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const photoUrl = equipment.photos?.[selectedPhotoIndex]
                    if (photoUrl) {
                      onPhotoDelete(photoUrl)
                      onPhotoSelect(null)
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={() => onPhotoSelect(Math.min(equipment.photos!.length - 1, selectedPhotoIndex + 1))}
                disabled={selectedPhotoIndex === equipment.photos.length - 1}
              >
                Siguiente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}

function EquipmentForm({
  equipment,
  onClose,
  onSuccess,
}: {
  equipment: Equipment
  onClose: () => void
  onSuccess: () => void
}) {
  const { canDeleteEquipment, canEditEquipment } = usePermissions()
  const [isLoading, setIsLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState({
    codigo: equipment.codigo || '',
    nombre: equipment.nombre || '',
    descripcion: equipment.descripcion || '',
    marca: equipment.marca || '',
    modelo: equipment.modelo || '',
    numeroSerie: equipment.numeroSerie || '',
    syncExcluded: Boolean(equipment.syncExcluded),
    criticidad: equipment.criticidad || ('media' as Equipment['criticidad']),
    estado: equipment.estado || ('operativo' as Equipment['estado']),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canEditEquipment) {
      setValidationErrors({ general: 'No tienes permisos para editar equipos.' })
      return
    }

    setIsLoading(true)
    setValidationErrors({})

    try {
      const dataToValidate = {
        codigo: equipment.codigo,
        nombre: equipment.nombre,
        descripcion: formData.descripcion || undefined,
        marca: formData.marca || undefined,
        modelo: formData.modelo || undefined,
        numeroSerie: formData.numeroSerie || undefined,
        criticidad: formData.criticidad,
        estado: formData.estado,
      }

      const validation = updateEquipmentSchema.safeParse(dataToValidate)

      if (!validation.success) {
        const errors: Record<string, string> = {}
        validation.error.issues.forEach((err) => {
          const path = err.path.map((p) => String(p)).join('.')
          errors[path] = err.message
        })
        setValidationErrors(errors)
        logger.warn('Equipment validation failed', { errors })
        return
      }

      logger.info('Updating equipment', { equipmentId: equipment.id, codigo: equipment.codigo })

      await updateEquipment(equipment.id, {
        descripcion: formData.descripcion || undefined,
        marca: formData.marca || undefined,
        modelo: formData.modelo || undefined,
        numeroSerie: formData.numeroSerie || undefined,
        syncExcluded: formData.syncExcluded,
        criticidad: formData.criticidad,
        estado: formData.estado,
      })

      onSuccess()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error saving equipment')
      logger.error('Error saving equipment', err)
      setValidationErrors({ general: 'Error al guardar el equipo. Por favor intenta de nuevo.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!canDeleteEquipment) {
      setValidationErrors({ general: 'No tienes permisos para eliminar equipos.' })
      return
    }

    const ok = window.confirm(
      `¿Eliminar el equipo "${equipment.nombre}" (${equipment.codigo})?\n\nEsto lo oculta del módulo y lo excluye del sync para evitar que se vuelva a crear automáticamente.`
    )
    if (!ok) return

    setIsLoading(true)
    setValidationErrors({})

    try {
      logger.info('Soft deleting equipment (exclude from sync)', { equipmentId: equipment.id, codigo: equipment.codigo })
      await updateEquipment(equipment.id, {
        syncExcluded: true,
        deleted: true,
        deletedAt: new Date(),
      })
      onSuccess()
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Error deleting equipment')
      logger.error('Error deleting equipment', err)
      setValidationErrors({ general: 'Error al eliminar el equipo. Por favor intenta de nuevo.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Equipo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {validationErrors.general && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{validationErrors.general}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input id="codigo" value={formData.codigo} disabled required />
              {validationErrors.codigo && <p className="text-sm text-destructive">{validationErrors.codigo}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input id="nombre" value={formData.nombre} disabled />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Descripción del equipo..."
              rows={2}
            />
            {validationErrors.descripcion && <p className="text-sm text-destructive">{validationErrors.descripcion}</p>}
          </div>

          {canDeleteEquipment && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="syncExcluded"
                checked={formData.syncExcluded}
                onCheckedChange={(checked) => setFormData({ ...formData, syncExcluded: checked === true })}
                disabled={isLoading}
              />
              <Label htmlFor="syncExcluded" className="text-sm">
                Excluir del sync (no se actualizará/creará desde jerarquía)
              </Label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="marca">Marca</Label>
              <Input
                id="marca"
                value={formData.marca}
                onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                placeholder="Siemens"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modelo">Modelo</Label>
              <Input
                id="modelo"
                value={formData.modelo}
                onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                placeholder="XYZ-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="criticidad">Criticidad</Label>
              <Select
                value={formData.criticidad}
                onValueChange={(value: Equipment['criticidad']) => setFormData({ ...formData, criticidad: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={formData.estado}
                onValueChange={(value: Equipment['estado']) => setFormData({ ...formData, estado: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operativo">Operativo</SelectItem>
                  <SelectItem value="en_mantenimiento">En Mantenimiento</SelectItem>
                  <SelectItem value="fuera_servicio">Fuera de Servicio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            {canDeleteEquipment && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isLoading}>
                Eliminar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !canEditEquipment}>
              {isLoading ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
