/**
 * ETTTemplatePicker — Pantalla "¿Cómo querés empezar?"
 *
 * Primera pantalla al crear una ETT nueva. Ofrece 3 vías de entrada:
 *
 *   1. 🔄 Duplicar ETT anterior (lista de últimas 5)
 *   2. 📋 Empezar desde plantilla (Paneles / Piping / En blanco)
 *   3. 🤖 Asistente IA (conversacional) — describir el trabajo por voz o texto
 *
 * Al elegir cualquier vía, se invoca `onSelect(ett)` con la ETT parcial
 * (sin id ni metadata) lista para pasar al editor WYSIWYG.
 */

import { useState } from 'react'
import { Copy, FileText, Sparkles, Mic } from 'lucide-react'
import { Button, Card, CardContent, Textarea } from '@/components/ui'
import type { ETT, ETTPlantillaId } from '@/types'
import { ETT_PLANTILLAS, nuevaETTDesdePlantilla } from '@/data/ettTemplates'
import { completarPlantillaIA } from '@/services/ettAI'
import { duplicateETT } from '@/services/ett'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

export interface ETTTemplatePickerProps {
  /** ETTs existentes del usuario para la opción "duplicar" */
  ettsRecientes: ETT[]
  /** ID del usuario actual (necesario para crear/duplicar) */
  currentUserId: string
  /** Nombre o departamento del usuario (para pre-rellenar) */
  userProfile?: { nombre?: string; departamento?: string }
  /**
   * Callback cuando el usuario elige una opción.
   * Recibe el ID de la ETT creada (para entrar al editor).
   */
  onETTCreada: (ettId: string) => void
  /** Callback para cancelar y volver a la lista */
  onCancelar: () => void
}

export function ETTTemplatePicker({
  ettsRecientes,
  currentUserId,
  userProfile,
  onETTCreada,
  onCancelar,
}: ETTTemplatePickerProps) {
  const { toast } = useToast()
  const [modo, setModo] = useState<'menu' | 'ia'>('menu')
  const [iaDescripcion, setIaDescripcion] = useState('')
  const [iaPlantillaId, setIaPlantillaId] = useState<ETTPlantillaId>('paneles')
  const [iaLoading, setIaLoading] = useState(false)

  // --- Opción 1: Duplicar ETT existente ---
  const handleDuplicar = async (ett: ETT) => {
    try {
      const newId = await duplicateETT(ett.id, currentUserId)
      toast({ title: 'ETT duplicada', description: 'Se creó una copia en borrador.' })
      onETTCreada(newId)
    } catch (err) {
      toast({
        title: 'Error al duplicar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  // --- Opción 2: Empezar desde plantilla (crea en memoria, no persiste todavía) ---
  const handlePlantilla = async (plantillaId: ETTPlantillaId) => {
    try {
      const { createETT } = await import('@/services/ett')
      const nueva = nuevaETTDesdePlantilla(plantillaId, currentUserId)
      const newId = await createETT(nueva)
      toast({ title: 'ETT creada', description: `Plantilla "${plantillaId}" cargada.` })
      onETTCreada(newId)
    } catch (err) {
      toast({
        title: 'Error al crear ETT',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  // --- Opción 3: Asistente IA ---
  const handleIACreate = async () => {
    if (!iaDescripcion.trim()) {
      toast({
        title: 'Descripción vacía',
        description: 'Describí el trabajo para que la IA pueda completar la plantilla.',
        variant: 'destructive',
      })
      return
    }

    setIaLoading(true)
    try {
      const resultado = await completarPlantillaIA({
        plantilla_id: iaPlantillaId,
        descripcion_usuario: iaDescripcion,
        user_profile: userProfile,
      })

      // Combinar plantilla base con los campos inferidos por la IA
      const base = nuevaETTDesdePlantilla(iaPlantillaId, currentUserId)
      const completada: Omit<ETT, 'id' | 'createdAt' | 'updatedAt'> = {
        ...base,
        cabecera: { ...base.cabecera, ...(resultado.cabecera ?? {}) },
        area_intervencion: resultado.area_intervencion ?? base.area_intervencion,
        descripcion_trabajos:
          resultado.descripcion_trabajos ?? base.descripcion_trabajos,
        responsabilidades_contratista:
          resultado.responsabilidades_contratista ?? base.responsabilidades_contratista,
        origen: 'ia',
      }

      const { createETT } = await import('@/services/ett')
      const newId = await createETT(completada)

      const faltantes = resultado.campos_faltantes?.length ?? 0
      toast({
        title: 'ETT creada con IA',
        description:
          faltantes > 0
            ? `La IA completó la plantilla. Faltan ${faltantes} campo(s) por confirmar.`
            : 'La IA completó toda la plantilla.',
      })
      onETTCreada(newId)
    } catch (err) {
      toast({
        title: 'Error de IA',
        description:
          err instanceof Error ? err.message : 'No se pudo procesar la descripción',
        variant: 'destructive',
      })
    } finally {
      setIaLoading(false)
    }
  }

  // ==========================================================================
  // MODO: Asistente IA
  // ==========================================================================

  if (modo === 'ia') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-600" />
            Asistente IA
          </h2>
          <Button variant="ghost" onClick={() => setModo('menu')}>
            ← Volver
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Tipo de trabajo (para elegir plantilla base):
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ETT_PLANTILLAS.map((p) => (
                  <Button
                    key={p.id}
                    variant={iaPlantillaId === p.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIaPlantillaId(p.id)}
                  >
                    {p.nombre}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Describí el trabajo que necesitas:
              </label>
              <Textarea
                value={iaDescripcion}
                onChange={(e) => setIaDescripcion(e.target.value)}
                placeholder="Ej: Necesito cambiar 8 paneles del entretecho en sector baader, medidas 10m x 1.2m, espesor 100mm, trabajo para la próxima semana"
                rows={5}
                className="resize-none"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleIACreate}
                disabled={iaLoading || !iaDescripcion.trim()}
                className="flex-1"
              >
                {iaLoading ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                    La IA está armando la ETT...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generar ETT con IA
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                disabled
                title="Voice input próximamente"
              >
                <Mic className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ==========================================================================
  // MODO: Menú principal (3 vías)
  // ==========================================================================

  const ultimasETTs = ettsRecientes.slice(0, 5)

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">¿Cómo querés empezar?</h2>
        <Button variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>

      {/* Opción 1: Duplicar ETT anterior */}
      {ultimasETTs.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Copy className="h-5 w-5 text-blue-600" />
              Duplicar una ETT anterior
            </h3>
            <div className="space-y-1">
              {ultimasETTs.map((ett) => (
                <button
                  key={ett.id}
                  onClick={() => handleDuplicar(ett)}
                  className="w-full text-left px-3 py-2 rounded-ctl hover:bg-blue-50 flex items-center justify-between text-sm"
                >
                  <span className="font-medium truncate flex-1">
                    {ett.cabecera.proyecto || '(sin título)'}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    {ett.createdAt.toLocaleDateString('es-CL')}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Opción 2: Plantillas base */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <FileText className="h-5 w-5 text-green-600" />
            Empezar desde una plantilla
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ETT_PLANTILLAS.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePlantilla(p.id)}
                className={cn(
                  'p-4 border-2 rounded-card text-left transition-all',
                  'hover:border-green-500 hover:bg-green-50',
                  'border-gray-200',
                )}
              >
                <div className="font-semibold text-gray-900 mb-1">{p.nombre}</div>
                <div className="text-xs text-gray-500">{p.descripcion}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Opción 3: Asistente IA */}
      <Card
        className="cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all"
        onClick={() => setModo('ia')}
      >
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Asistente IA
          </h3>
          <p className="text-sm text-gray-600">
            Describí el trabajo que necesitás y la IA arma la ETT por vos.
            Ideal para ETTs rápidas dictando por voz.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
