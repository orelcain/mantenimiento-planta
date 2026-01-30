/**
 * ETTPage - Página para crear y gestionar Especificaciones Técnicas del Trabajo
 * Módulo administrativo con IA integrada
 */

import { useState, useEffect } from 'react'
import { Wand2, Mic, Plus, Trash2, Eye, Save, AlertCircle, Check, Download } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
} from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { useAuthStore } from '@/store'
import { createETT, getETT, listETT, updateETT, deleteETT } from '@/services/ett'
import {
  improveTrabajoDescripcion,
  improveMaterialEspecificacion,
  improveProcedimiento,
  improveRiesgoMedidas,
} from '@/services/ettAI'
import { exportETTToWord, downloadWord } from '@/utils/exportETTWord'
import { exportETTToPDF, downloadPDF } from '@/utils/exportETTPDF'
import type { ETT, ETTMaterial, ETProcedimiento, ETTRiesgo, ETTGeneralInfo } from '@/types'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { v4 as uuidv4 } from 'uuid'

/**
 * Interfaz local para el formulario con tipos más flexibles
 */
interface FormData {
  general: Partial<ETTGeneralInfo>
  trabajo_descripcion: string
  materiales: ETTMaterial[]
  procedimientos: ETProcedimiento[]
  riesgos: ETTRiesgo[]
  adjuntos: any[]
  estado: 'borrador' | 'en_revision' | 'aprobada' | 'completada' | 'archivada'
  createdBy: string
}

export function ETTPage() {
  const { user } = useAuthStore()
  const { toast } = useToast()
  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition()

  // Vista principal (lista o editar)
  const [view, setView] = useState<'lista' | 'editar'>('lista')
  const [ettList, setETTList] = useState<ETT[]>([])
  const [loading, setLoading] = useState(false)

  // Edición
  const [currentETT, setCurrentETT] = useState<ETT | null>(null)
  const [isNew, setIsNew] = useState(true)

  // Formulario
  const [form, setForm] = useState<FormData>({
    general: {
      titulo: '',
      fecha: new Date(),
      solicitante: '',
      responsable: user?.nombre || '',
      descripcion_general: '',
      observaciones: '',
    },
    trabajo_descripcion: '',
    materiales: [],
    procedimientos: [],
    riesgos: [],
    adjuntos: [],
    estado: 'borrador',
    createdBy: user?.id || '',
  })

  // IA
  const [improvingField, setImprovingField] = useState<string | null>(null)
  const [showImprovement, setShowImprovement] = useState<{
    field: string
    original: string
    mejorado: string
  } | null>(null)

  // Dialogs
  const [showMaterialDialog, setShowMaterialDialog] = useState(false)
  const [showProcedimientoDialog, setShowProcedimientoDialog] = useState(false)
  const [showRiesgoDialog, setShowRiesgoDialog] = useState(false)

  // Formularios internos
  const [materialForm, setMaterialForm] = useState<Partial<ETTMaterial>>({})
  const [procedimientoForm, setProcedimientoForm] = useState<Partial<ETProcedimiento>>({})
  const [riesgoForm, setRiesgoForm] = useState<Partial<ETTRiesgo>>({})

  // Cargar lista
  useEffect(() => {
    if (view === 'lista') {
      loadETTList()
    }
  }, [view])

  const loadETTList = async () => {
    setLoading(true)
    try {
      // Admin ve todas las ETT, usuarios normales solo las suyas
      const list = await listETT()
      setETTList(list)
    } catch (error) {
      logger.error('Error loading ETT list', error instanceof Error ? error : new Error(String(error)))
      toast({ title: 'Error', description: 'No se pudo cargar la lista de ETT', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleNewETT = () => {
    setIsNew(true)
    setCurrentETT(null)
    setForm({
      general: {
        titulo: '',
        fecha: new Date(),
        solicitante: '',
        responsable: user?.nombre || '',
        descripcion_general: '',
      },
      trabajo_descripcion: '',
      materiales: [],
      procedimientos: [],
      riesgos: [],
      adjuntos: [],
      estado: 'borrador',
      createdBy: user?.id || '',
    })
    setView('editar')
  }

  const handleEditETT = async (ettId: string) => {
    try {
      const ett = await getETT(ettId)
      if (ett) {
        setCurrentETT(ett)
        setForm({
          general: ett.general,
          trabajo_descripcion: ett.trabajo_descripcion,
          materiales: ett.materiales,
          procedimientos: ett.procedimientos,
          riesgos: ett.riesgos,
          adjuntos: ett.adjuntos,
          estado: ett.estado,
          createdBy: ett.createdBy,
        })
        setIsNew(false)
        setView('editar')
      }
    } catch (error) {
      logger.error('Error loading ETT', error instanceof Error ? error : new Error(String(error)))
      toast({ title: 'Error', description: 'No se pudo cargar la ETT', variant: 'destructive' })
    }
  }

  const handleSaveETT = async () => {
    try {
      if (!form.general.titulo) {
        toast({ title: 'Error', description: 'El título es requerido', variant: 'destructive' })
        return
      }

      setLoading(true)

      const ettData: Partial<ETT> = {
        ...form,
        general: {
          titulo: form.general.titulo || '',
          fecha: form.general.fecha || new Date(),
          solicitante: form.general.solicitante || '',
          responsable: form.general.responsable || '',
          descripcion_general: form.general.descripcion_general || '',
          empresa: form.general.empresa,
          area: form.general.area,
          observaciones: form.general.observaciones,
        } as ETTGeneralInfo,
        updatedAt: new Date(),
      }

      if (isNew) {
        await createETT({
          ...ettData,
          createdAt: new Date(),
        } as Omit<ETT, 'id'>)
        toast({ title: 'Éxito', description: 'ETT creada correctamente' })
        setView('lista')
        await loadETTList()
      } else if (currentETT) {
        await updateETT(currentETT.id, ettData)
        toast({ title: 'Éxito', description: 'ETT actualizada correctamente' })
        setView('lista')
        await loadETTList()
      }
    } catch (error) {
      logger.error('Error saving ETT', error instanceof Error ? error : new Error(String(error)))
      toast({ title: 'Error', description: 'No se pudo guardar la ETT', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleImproveField = async (field: string, texto: string) => {
    if (!texto.trim()) {
      toast({ title: 'Error', description: 'El campo no puede estar vacío', variant: 'destructive' })
      return
    }

    setImprovingField(field)
    try {
      let resultado
      switch (field) {
        case 'trabajo_descripcion':
          resultado = await improveTrabajoDescripcion(texto)
          break
        case 'material_especificacion':
          resultado = await improveMaterialEspecificacion(texto)
          break
        case 'procedimiento':
          resultado = await improveProcedimiento(texto)
          break
        case 'riesgo_medidas':
          resultado = await improveRiesgoMedidas(texto)
          break
        default:
          throw new Error('Campo desconocido')
      }

      setShowImprovement({
        field,
        original: resultado.texto_original,
        mejorado: resultado.texto_mejorado,
      })
    } catch (error) {
      logger.error('Error improving field', error instanceof Error ? error : new Error(String(error)))
      toast({ title: 'Error', description: 'No se pudo mejorar el texto', variant: 'destructive' })
    } finally {
      setImprovingField(null)
    }
  }

  const handleAddMaterial = () => {
    if (!materialForm.nombre) {
      toast({ title: 'Error', description: 'El nombre del material es requerido', variant: 'destructive' })
      return
    }

    const material: ETTMaterial = {
      id: uuidv4(),
      nombre: materialForm.nombre!,
      descripcion: materialForm.descripcion,
      cantidad: materialForm.cantidad || 1,
      unidad: materialForm.unidad || 'piezas',
      especificaciones: materialForm.especificaciones,
      notas: materialForm.notas,
    }

    setForm({
      ...form,
      materiales: [...form.materiales, material],
    })

    setMaterialForm({})
    setShowMaterialDialog(false)
    toast({ title: 'Éxito', description: 'Material agregado' })
  }

  const handleAddProcedimiento = () => {
    if (!procedimientoForm.titulo) {
      toast({ title: 'Error', description: 'El título del procedimiento es requerido', variant: 'destructive' })
      return
    }

    const procedimiento: ETProcedimiento = {
      id: uuidv4(),
      numero: form.procedimientos.length + 1,
      titulo: procedimientoForm.titulo!,
      descripcion: procedimientoForm.descripcion || '',
      tiempo_estimado: procedimientoForm.tiempo_estimado,
      precauciones: procedimientoForm.precauciones,
      personal_requerido: procedimientoForm.personal_requerido,
      notas: procedimientoForm.notas,
    }

    setForm({
      ...form,
      procedimientos: [...form.procedimientos, procedimiento],
    })

    setProcedimientoForm({})
    setShowProcedimientoDialog(false)
    toast({ title: 'Éxito', description: 'Procedimiento agregado' })
  }

  const handleAddRiesgo = () => {
    if (!riesgoForm.peligro) {
      toast({ title: 'Error', description: 'La descripción del peligro es requerida', variant: 'destructive' })
      return
    }

    const riesgo: ETTRiesgo = {
      id: uuidv4(),
      peligro: riesgoForm.peligro!,
      probabilidad: (riesgoForm.probabilidad as any) || 'media',
      consecuencia: (riesgoForm.consecuencia as any) || 'grave',
      medidas_preventivas: riesgoForm.medidas_preventivas || '',
      equipos_seguridad: Array.isArray(riesgoForm.equipos_seguridad)
        ? riesgoForm.equipos_seguridad
        : riesgoForm.equipos_seguridad
          ? [riesgoForm.equipos_seguridad]
          : [],
    }

    setForm({
      ...form,
      riesgos: [...form.riesgos, riesgo],
    })

    setRiesgoForm({})
    setShowRiesgoDialog(false)
    toast({ title: 'Éxito', description: 'Riesgo agregado' })
  }

  const handleExportWord = async () => {
    try {
      if (!currentETT) {
        toast({ title: 'Error', description: 'Debe guardar la ETT primero', variant: 'destructive' })
        return
      }

      setLoading(true)
      const blob = await exportETTToWord(currentETT)
      downloadWord(blob, `ETT_${currentETT.general.titulo.replace(/\s+/g, '_')}_${Date.now()}.docx`)
      toast({ title: 'Éxito', description: 'Documento descargado' })
    } catch (error) {
      logger.error('Error exporting to Word', error instanceof Error ? error : new Error(String(error)))
      toast({ title: 'Error', description: 'No se pudo exportar el documento', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = async () => {
    try {
      if (!currentETT) {
        toast({ title: 'Error', description: 'Debe guardar la ETT primero', variant: 'destructive' })
        return
      }

      setLoading(true)
      const blob = await exportETTToPDF(currentETT)
      downloadPDF(blob, `ETT_${currentETT.general.titulo.replace(/\s+/g, '_')}_${Date.now()}.pdf`)
      toast({ title: 'Éxito', description: 'PDF descargado' })
    } catch (error) {
      logger.error('Error exporting to PDF', error instanceof Error ? error : new Error(String(error)))
      toast({ title: 'Error', description: 'No se pudo exportar el PDF', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // VISTA LISTA
  if (view === 'lista') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Especificaciones Técnicas del Trabajo</h1>
            <p className="text-muted-foreground">Crear y gestionar ETT con asistencia de IA</p>
          </div>
          <Button onClick={handleNewETT}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva ETT
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-8 text-center">Cargando...</CardContent>
          </Card>
        ) : ettList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No hay ETT creadas</p>
              <Button onClick={handleNewETT}>Crear primera ETT</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {ettList.map(ett => (
              <Card key={ett.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{ett.general.titulo}</h3>
                      <p className="text-sm text-muted-foreground">{ett.general.descripcion_general}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge>{ett.estado}</Badge>
                        <Badge variant="outline">{ett.general.solicitante}</Badge>
                        <Badge variant="outline">{new Date(ett.createdAt).toLocaleDateString('es-ES')}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditETT(ett.id)}>
                        <Eye className="h-4 w-4 mr-1" />
                        Abrir
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          if (confirm('¿Estás seguro?')) {
                            await deleteETT(ett.id)
                            await loadETTList()
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  // VISTA EDITAR - TABS
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{isNew ? 'Nueva' : 'Editar'} ETT</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView('lista')}>
            Cancelar
          </Button>
          <Button onClick={handleSaveETT} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="trabajo">Trabajo</TabsTrigger>
          <TabsTrigger value="materiales">Materiales</TabsTrigger>
          <TabsTrigger value="procedimientos">Procedimientos</TabsTrigger>
          <TabsTrigger value="riesgos">Riesgos</TabsTrigger>
          <TabsTrigger value="exportar">Exportar</TabsTrigger>
        </TabsList>

        {/* TAB: GENERAL */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Título de la ETT *</Label>
                <Input
                  value={form.general.titulo || ''}
                  onChange={e => setForm({ ...form, general: { ...form.general, titulo: e.target.value } })}
                  placeholder="Ej: Mantenimiento de Bomba Centrifuga"
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Solicitante *</Label>
                  <Input
                    value={form.general.solicitante || ''}
                    onChange={e => setForm({ ...form, general: { ...form.general, solicitante: e.target.value } })}
                    placeholder="Nombre del solicitante"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>Responsable *</Label>
                  <Input
                    value={form.general.responsable || ''}
                    onChange={e => setForm({ ...form, general: { ...form.general, responsable: e.target.value } })}
                    placeholder="Responsable de la tarea"
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <Label>Descripción General</Label>
                <Textarea
                  value={form.general.descripcion_general || ''}
                  onChange={e =>
                    setForm({ ...form, general: { ...form.general, descripcion_general: e.target.value } })
                  }
                  placeholder="Descripción general de la tarea..."
                  rows={4}
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Observaciones</Label>
                <Textarea
                  value={form.general.observaciones || ''}
                  onChange={e => setForm({ ...form, general: { ...form.general, observaciones: e.target.value } })}
                  placeholder="Observaciones adicionales..."
                  rows={3}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: TRABAJO */}
        <TabsContent value="trabajo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Descripción del Trabajo</CardTitle>
              <p className="text-sm text-muted-foreground">
                Detalle técnico del trabajo a realizar. Con IA para mejorar claridad y precisión.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Descripción del Trabajo *</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleImproveField('trabajo_descripcion', form.trabajo_descripcion)}
                    disabled={improvingField === 'trabajo_descripcion' || !form.trabajo_descripcion}
                  >
                    <Wand2
                      className={cn('h-4 w-4 mr-2', improvingField === 'trabajo_descripcion' && 'animate-spin')}
                    />
                    {improvingField === 'trabajo_descripcion' ? 'Mejorando...' : 'Mejorar con IA'}
                  </Button>
                </div>
                <Textarea
                  value={form.trabajo_descripcion}
                  onChange={e => setForm({ ...form, trabajo_descripcion: e.target.value })}
                  placeholder="Descripción técnica detallada del trabajo..."
                  rows={8}
                  className="mt-2 font-mono"
                />
              </div>

              {/* Preview de mejora */}
              {showImprovement?.field === 'trabajo_descripcion' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="mt-2">
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold text-sm">Original:</p>
                        <p className="text-sm text-muted-foreground">{showImprovement.original}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Mejorado:</p>
                        <p className="text-sm">{showImprovement.mejorado}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setForm({ ...form, trabajo_descripcion: showImprovement.mejorado })
                          setShowImprovement(null)
                          toast({ title: 'Éxito', description: 'Texto actualizado' })
                        }}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Usar esta versión
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Captura de voz */}
              <div>
                <Label>O captura de voz:</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant={isListening ? 'destructive' : 'outline'}
                    onClick={isListening ? stopListening : startListening}
                  >
                    <Mic className={cn('h-4 w-4 mr-2', isListening && 'animate-pulse')} />
                    {isListening ? 'Grabando...' : 'Grabar'}
                  </Button>
                  {transcript && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setForm({
                          ...form,
                          trabajo_descripcion: (form.trabajo_descripcion || '') + '\n' + transcript,
                        })
                      }}
                    >
                      Agregar transcripción
                    </Button>
                  )}
                </div>
                {transcript && <p className="text-sm text-muted-foreground mt-2 italic">{transcript}</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: MATERIALES */}
        <TabsContent value="materiales" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Materiales y Equipos Requeridos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.materiales.length > 0 ? (
                <div className="space-y-2">
                  {form.materiales.map(mat => (
                    <Card key={mat.id} className="bg-muted/50">
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold">{mat.nombre}</p>
                            {mat.descripcion && (
                              <p className="text-sm text-muted-foreground">{mat.descripcion}</p>
                            )}
                            <div className="flex gap-2 mt-2 text-sm">
                              <Badge variant="outline">
                                {mat.cantidad} {mat.unidad}
                              </Badge>
                              {mat.especificaciones && <Badge variant="outline">{mat.especificaciones}</Badge>}
                            </div>
                            {mat.notas && <p className="text-xs text-muted-foreground mt-2">{mat.notas}</p>}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setForm({
                                ...form,
                                materiales: form.materiales.filter(m => m.id !== mat.id),
                              })
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No hay materiales agregados</p>
              )}

              <Button onClick={() => setShowMaterialDialog(true)} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Material
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: PROCEDIMIENTOS */}
        <TabsContent value="procedimientos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Procedimientos y Pasos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.procedimientos.length > 0 ? (
                <div className="space-y-2">
                  {form.procedimientos
                    .sort((a, b) => a.numero - b.numero)
                    .map(proc => (
                      <Card key={proc.id} className="bg-muted/50">
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-semibold">
                                Paso {proc.numero}: {proc.titulo}
                              </p>
                              {proc.descripcion && (
                                <p className="text-sm text-muted-foreground mt-1">{proc.descripcion}</p>
                              )}
                              <div className="flex gap-2 mt-2 text-xs">
                                {proc.tiempo_estimado && (
                                  <Badge variant="outline">⏱️ {proc.tiempo_estimado}</Badge>
                                )}
                                {proc.personal_requerido && (
                                  <Badge variant="outline">👥 {proc.personal_requerido}</Badge>
                                )}
                              </div>
                              {proc.precauciones && (
                                <div className="mt-2 p-2 bg-yellow-100 rounded text-xs">
                                  <p className="font-semibold">Precauciones:</p>
                                  <p>{proc.precauciones}</p>
                                </div>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setForm({
                                  ...form,
                                  procedimientos: form.procedimientos.filter(p => p.id !== proc.id),
                                })
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No hay procedimientos agregados</p>
              )}

              <Button onClick={() => setShowProcedimientoDialog(true)} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Procedimiento
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: RIESGOS */}
        <TabsContent value="riesgos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Análisis de Riesgos y Seguridad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.riesgos.length > 0 ? (
                <div className="space-y-2">
                  {form.riesgos.map(riesgo => (
                    <Card key={riesgo.id} className="bg-red-50 border-red-200">
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold">{riesgo.peligro}</p>
                            <div className="flex gap-2 mt-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  riesgo.probabilidad === 'alta' && 'bg-red-100',
                                  riesgo.probabilidad === 'media' && 'bg-yellow-100',
                                  riesgo.probabilidad === 'baja' && 'bg-green-100'
                                )}
                              >
                                Prob: {riesgo.probabilidad}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  riesgo.consecuencia === 'grave' && 'bg-red-100',
                                  riesgo.consecuencia === 'leve' && 'bg-green-100',
                                  riesgo.consecuencia === 'muy_grave' && 'bg-red-200',
                                  riesgo.consecuencia === 'mortal' && 'bg-red-300'
                                )}
                              >
                                Cons: {riesgo.consecuencia}
                              </Badge>
                            </div>
                            {riesgo.medidas_preventivas && (
                              <div className="mt-2 p-2 bg-green-100 rounded text-xs">
                                <p className="font-semibold">Medidas Preventivas:</p>
                                <p>{riesgo.medidas_preventivas}</p>
                              </div>
                            )}
                            {riesgo.equipos_seguridad && riesgo.equipos_seguridad.length > 0 && (
                              <div className="mt-1 text-xs">
                                <p className="font-semibold">EPP Requerido:</p>
                                <p>{riesgo.equipos_seguridad.join(', ')}</p>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setForm({
                                ...form,
                                riesgos: form.riesgos.filter(r => r.id !== riesgo.id),
                              })
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No hay riesgos identificados</p>
              )}

              <Button onClick={() => setShowRiesgoDialog(true)} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Riesgo
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: EXPORTAR */}
        {!isNew && currentETT && (
          <TabsContent value="exportar" className="space-y-6">
            <Card className="bg-blue-50">
              <CardHeader>
                <CardTitle>Exportar ETT</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                <Button onClick={handleExportWord} disabled={loading} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Word (.docx)
                </Button>
                <Button onClick={handleExportPDF} disabled={loading} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Descargar PDF
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* DIALOGS */}
      {/* Dialog Material */}
      <Dialog open={showMaterialDialog} onOpenChange={setShowMaterialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nombre del Material *</Label>
              <Input
                value={materialForm.nombre || ''}
                onChange={e => setMaterialForm({ ...materialForm, nombre: e.target.value })}
                placeholder="Ej: Aceite industrial"
                className="mt-2"
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input
                value={materialForm.descripcion || ''}
                onChange={e => setMaterialForm({ ...materialForm, descripcion: e.target.value })}
                placeholder="Descripción detallada"
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  value={materialForm.cantidad || 1}
                  onChange={e => setMaterialForm({ ...materialForm, cantidad: parseInt(e.target.value) })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Unidad</Label>
                <Select
                  value={materialForm.unidad || 'piezas'}
                  onValueChange={val => setMaterialForm({ ...materialForm, unidad: val })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="piezas">Piezas</SelectItem>
                    <SelectItem value="litros">Litros</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="m">Metros</SelectItem>
                    <SelectItem value="m2">m²</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Especificaciones Técnicas</Label>
              <Input
                value={materialForm.especificaciones || ''}
                onChange={e => setMaterialForm({ ...materialForm, especificaciones: e.target.value })}
                placeholder="Normas, estándares, etc."
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMaterialDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddMaterial}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Procedimiento */}
      <Dialog open={showProcedimientoDialog} onOpenChange={setShowProcedimientoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Procedimiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Título del Procedimiento *</Label>
              <Input
                value={procedimientoForm.titulo || ''}
                onChange={e => setProcedimientoForm({ ...procedimientoForm, titulo: e.target.value })}
                placeholder="Ej: Desmontaje de bomba"
                className="mt-2"
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={procedimientoForm.descripcion || ''}
                onChange={e => setProcedimientoForm({ ...procedimientoForm, descripcion: e.target.value })}
                placeholder="Descripción paso a paso"
                rows={3}
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tiempo Estimado</Label>
                <Input
                  value={procedimientoForm.tiempo_estimado || ''}
                  onChange={e => setProcedimientoForm({ ...procedimientoForm, tiempo_estimado: e.target.value })}
                  placeholder="Ej: 30 minutos"
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Personal Requerido</Label>
                <Input
                  type="number"
                  value={procedimientoForm.personal_requerido || 1}
                  onChange={e =>
                    setProcedimientoForm({ ...procedimientoForm, personal_requerido: parseInt(e.target.value) })
                  }
                  placeholder="Ej: 2"
                  className="mt-2"
                />
              </div>
            </div>
            <div>
              <Label>Precauciones de Seguridad</Label>
              <Textarea
                value={procedimientoForm.precauciones || ''}
                onChange={e => setProcedimientoForm({ ...procedimientoForm, precauciones: e.target.value })}
                placeholder="Precauciones importantes"
                rows={2}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProcedimientoDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddProcedimiento}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Riesgo */}
      <Dialog open={showRiesgoDialog} onOpenChange={setShowRiesgoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Análisis de Riesgo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Descripción del Peligro *</Label>
              <Input
                value={riesgoForm.peligro || ''}
                onChange={e => setRiesgoForm({ ...riesgoForm, peligro: e.target.value })}
                placeholder="Ej: Proyección de partes"
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Probabilidad</Label>
                <Select
                  value={riesgoForm.probabilidad || 'media'}
                  onValueChange={val =>
                    setRiesgoForm({ ...riesgoForm, probabilidad: val as any })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="muy_alta">Muy Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Consecuencia</Label>
                <Select
                  value={riesgoForm.consecuencia || 'grave'}
                  onValueChange={val =>
                    setRiesgoForm({ ...riesgoForm, consecuencia: val as any })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leve">Leve</SelectItem>
                    <SelectItem value="grave">Grave</SelectItem>
                    <SelectItem value="muy_grave">Muy Grave</SelectItem>
                    <SelectItem value="mortal">Mortal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Medidas Preventivas</Label>
              <Textarea
                value={riesgoForm.medidas_preventivas || ''}
                onChange={e => setRiesgoForm({ ...riesgoForm, medidas_preventivas: e.target.value })}
                placeholder="Acciones preventivas"
                rows={2}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Equipos de Protección Personal (EPP)</Label>
              <Textarea
                value={
                  Array.isArray(riesgoForm.equipos_seguridad) ? riesgoForm.equipos_seguridad.join(', ') : ''
                }
                onChange={e =>
                  setRiesgoForm({ ...riesgoForm, equipos_seguridad: e.target.value.split(',').map(s => s.trim()) })
                }
                placeholder="Ej: Gafas de seguridad, casco, guantes (separados por comas)"
                rows={2}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRiesgoDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddRiesgo}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
