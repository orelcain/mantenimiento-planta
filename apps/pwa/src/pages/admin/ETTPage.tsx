/**
 * ETTPage — Página principal del módulo Especificaciones Técnicas del Trabajo
 *
 * Tiene 3 vistas principales:
 *
 *   1. 📋 LISTA      — Muestra ETTs existentes, botón "Nueva ETT"
 *   2. 🎯 PICKER     — Selector inicial (duplicar / plantilla / IA)
 *   3. ✏️ EDITOR     — Vista WYSIWYG del documento ETT
 *
 * Conectada a Firestore via `services/ett.ts`. Los cambios en el editor
 * se auto-guardan con debounce de 1.5s.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Download,
  FileText,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Check,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
} from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { useAuthStore } from '@/store'
import {
  listETT,
  getETT,
  updateETT,
  deleteETT,
  approveETT,
} from '@/services/ett'
import { exportETTToWord, downloadWord } from '@/utils/exportETTWord'
import type { ETT } from '@/types'
import { ETTDocumentView, ETTTemplatePicker } from '@/components/ett'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

type Vista = 'lista' | 'picker' | 'editor'

const AUTOSAVE_DEBOUNCE_MS = 1500

export function ETTPage() {
  const { user } = useAuthStore()
  const { toast } = useToast()

  const [vista, setVista] = useState<Vista>('lista')
  const [ettList, setETTList] = useState<ETT[]>([])
  const [loading, setLoading] = useState(false)
  const [currentETT, setCurrentETT] = useState<ETT | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ==========================================================================
  // DATA LOADING
  // ==========================================================================

  const loadETTList = useCallback(async () => {
    setLoading(true)
    try {
      const filters = user?.rol === 'admin' ? {} : { createdBy: user?.id }
      const list = await listETT(filters)
      setETTList(list)
    } catch (err) {
      logger.error(
        'Error loading ETT list',
        err instanceof Error ? err : new Error(String(err)),
      )
      toast({
        title: 'Error al cargar ETTs',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [user?.id, user?.rol, toast])

  useEffect(() => {
    if (vista === 'lista') {
      loadETTList()
    }
  }, [vista, loadETTList])

  // ==========================================================================
  // AUTOSAVE (con debounce)
  // ==========================================================================

  useEffect(() => {
    if (!dirty || !currentETT) return

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updateETT(currentETT.id, {
          cabecera: currentETT.cabecera,
          area_intervencion: currentETT.area_intervencion,
          descripcion_trabajos: currentETT.descripcion_trabajos,
          responsabilidades_contratista: currentETT.responsabilidades_contratista,
          imagenes: currentETT.imagenes,
        })
        setDirty(false)
      } catch (err) {
        toast({
          title: 'Error al guardar',
          description: err instanceof Error ? err.message : 'Error desconocido',
          variant: 'destructive',
        })
      } finally {
        setSaving(false)
      }
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [dirty, currentETT, toast])

  // ==========================================================================
  // ACCIONES
  // ==========================================================================

  const handleOpenNew = () => setVista('picker')

  const handleETTCreada = async (ettId: string) => {
    try {
      const ett = await getETT(ettId)
      if (!ett) throw new Error('ETT no encontrada tras crear')
      setCurrentETT(ett)
      setDirty(false)
      setVista('editor')
    } catch (err) {
      toast({
        title: 'Error al abrir ETT',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  const handleOpenEdit = async (ettId: string) => {
    try {
      const ett = await getETT(ettId)
      if (!ett) throw new Error('ETT no encontrada')
      setCurrentETT(ett)
      setDirty(false)
      setVista('editor')
    } catch (err) {
      toast({
        title: 'Error al abrir',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  const handleDocChange = (ett: ETT) => {
    setCurrentETT(ett)
    setDirty(true)
  }

  const handleBackToLista = async () => {
    // Forzar guardado inmediato si hay cambios pendientes
    if (dirty && currentETT) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
      }
      try {
        await updateETT(currentETT.id, {
          cabecera: currentETT.cabecera,
          area_intervencion: currentETT.area_intervencion,
          descripcion_trabajos: currentETT.descripcion_trabajos,
          responsabilidades_contratista: currentETT.responsabilidades_contratista,
          imagenes: currentETT.imagenes,
        })
      } catch (err) {
        toast({
          title: 'No se pudieron guardar los cambios',
          description: err instanceof Error ? err.message : 'Error desconocido',
          variant: 'destructive',
        })
        return
      }
    }
    setCurrentETT(null)
    setVista('lista')
  }

  const handleExport = async () => {
    if (!currentETT) return
    try {
      const blob = await exportETTToWord(currentETT)
      const fileName = `ETT_${(currentETT.cabecera.proyecto || 'sin_titulo').replace(/[^a-zA-Z0-9]/g, '_')}.docx`
      downloadWord(blob, fileName)
      toast({
        title: 'ETT exportada',
        description: `Descargado ${fileName}`,
      })
    } catch (err) {
      toast({
        title: 'Error al exportar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (ettId: string) => {
    if (!confirm('¿Eliminar esta ETT? Esta acción no se puede deshacer.')) return
    try {
      await deleteETT(ettId)
      toast({ title: 'ETT eliminada' })
      await loadETTList()
    } catch (err) {
      toast({
        title: 'Error al eliminar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  const handleApprove = async () => {
    if (!currentETT || !user?.id) return
    try {
      await approveETT(currentETT.id, user.id)
      toast({ title: 'ETT aprobada' })
      const refreshed = await getETT(currentETT.id)
      if (refreshed) setCurrentETT(refreshed)
    } catch (err) {
      toast({
        title: 'Error al aprobar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  // ==========================================================================
  // RENDER: VISTA EDITOR
  // ==========================================================================

  if (vista === 'editor' && currentETT) {
    return (
      <div className="min-h-screen bg-gray-100">
        {/* Barra superior */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={handleBackToLista}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver
              </Button>
              <div className="text-sm">
                <div className="font-medium truncate max-w-[400px]">
                  {currentETT.cabecera.proyecto || '(sin título)'}
                </div>
                <div className="text-xs text-gray-500">
                  {saving ? (
                    <span className="flex items-center gap-1">
                      <Save className="h-3 w-3 animate-pulse" />
                      Guardando...
                    </span>
                  ) : dirty ? (
                    <span>Cambios sin guardar</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" />
                      Guardado
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant={
                  currentETT.estado === 'aprobada' ? 'default' : 'secondary'
                }
              >
                {currentETT.estado}
              </Badge>
              {currentETT.estado !== 'aprobada' && user?.rol === 'admin' && (
                <Button variant="outline" size="sm" onClick={handleApprove}>
                  <Check className="h-4 w-4 mr-1" />
                  Aprobar
                </Button>
              )}
              <Button size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" />
                Exportar Word
              </Button>
            </div>
          </div>
        </div>

        {/* Documento WYSIWYG */}
        <div className="py-6">
          <ETTDocumentView ett={currentETT} onChange={handleDocChange} />
        </div>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: VISTA PICKER
  // ==========================================================================

  if (vista === 'picker') {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <ETTTemplatePicker
          ettsRecientes={ettList}
          currentUserId={user?.id ?? 'anonymous'}
          userProfile={{
            nombre: user?.nombre,
            departamento: 'Dpto. Mantención Chonchi',
          }}
          onETTCreada={handleETTCreada}
          onCancelar={() => setVista('lista')}
        />
      </div>
    )
  }

  // ==========================================================================
  // RENDER: VISTA LISTA
  // ==========================================================================

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Especificaciones Técnicas del Trabajo
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Formato corporativo AquaChile — Adquisiciones / Servicios
            </p>
          </div>
          <Button onClick={handleOpenNew} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            Nueva ETT
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              Cargando ETTs...
            </CardContent>
          </Card>
        ) : ettList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <h3 className="text-lg font-medium text-gray-700 mb-1">
                No hay ETTs todavía
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Creá tu primera Especificación Técnica
              </p>
              <Button onClick={handleOpenNew}>
                <Sparkles className="h-4 w-4 mr-2" />
                Crear nueva ETT
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {ettList.map((ett) => (
              <Card
                key={ett.id}
                className={cn(
                  'hover:shadow-md transition-shadow cursor-pointer',
                  ett.estado === 'aprobada' && 'border-green-300',
                )}
              >
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div
                    className="flex-1 min-w-0"
                    onClick={() => handleOpenEdit(ett.id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {ett.cabecera.proyecto || '(sin título)'}
                      </h3>
                      <Badge
                        variant={
                          ett.estado === 'aprobada' ? 'default' : 'secondary'
                        }
                        className="text-xs"
                      >
                        {ett.estado}
                      </Badge>
                      {ett.origen && (
                        <Badge variant="outline" className="text-xs">
                          {ett.origen}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-3">
                      <span>
                        {ett.cabecera.fecha_requerimiento.toLocaleDateString('es-CL')}
                      </span>
                      <span>·</span>
                      <span className="truncate">
                        {ett.cabecera.usuario_solicitante}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(ett.id)}
                    >
                      Abrir
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => handleDelete(ett.id)}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Alert className="mt-6">
          <Sparkles className="h-4 w-4" />
          <AlertDescription>
            <strong>Tip:</strong> Al crear una nueva ETT podés elegir entre
            duplicar una anterior, empezar desde plantilla, o dictarle al
            asistente IA qué trabajo necesitás.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}
