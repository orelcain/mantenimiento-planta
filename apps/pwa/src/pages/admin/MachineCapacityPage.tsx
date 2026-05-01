/**
 * MachineCapacityPage — configuración de velocidad física (nameplate) por Baader.
 *
 * Permite al admin definir la capacidad física máxima real de cada máquina
 * (piezas/minuto según el panel de control de la Baader). Ese valor es
 * independiente del objetivo configurado en Shoplogix (expectedCycles).
 *
 * Se usa para:
 *   1. Detectar si el objetivo Shoplogix supera la capacidad física → alerta ⚠.
 *   2. Componente de Rendimiento en OEE si el objetivo está mal calibrado.
 *
 * Seguridad: la ruta ya está envuelta en <RequireReAuth> desde App.tsx.
 * Adicionalmente, cada GUARDADO individual pide contraseña otra vez vía
 * <ReAuthConfirmDialog> — protege contra cambios accidentales con sesión abierta.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Spinner,
  Badge,
} from '@/components/ui'
import { Gauge, Save, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import { PLANT_LINES } from '@/config/plantLines'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import {
  loadMachineCapacities,
  saveMachineCapacity,
  type MachineCapacityConfig,
} from '@/services/shoplogix/machineCapacity.service'
import { ReAuthConfirmDialog } from '@/components/admin/ReAuthConfirmDialog'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'

// Solo las plantas con Shoplogix habilitado
const ACTIVE_PLANTS = PLANT_LINES.filter((l) => l.shoplogixEnabled && !l.comingSoon)

interface PendingSave {
  plantSlug: PlantSlug
  machineid: string
  machineName: string
  newCpm: number
}

export function MachineCapacityPage() {
  const user = useAuthStore((s) => s.user)
  const { toast } = useToast()

  // Config cargada por planta
  const [configByPlant, setConfigByPlant] = useState<
    Record<string, MachineCapacityConfig[]>
  >({})
  // Valores editados localmente (antes de guardar)
  const [draftByMachine, setDraftByMachine] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dialog de re-auth por guardado
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const results = await Promise.all(
        ACTIVE_PLANTS.map(async (line) => {
          const configs = await loadMachineCapacities(line.plantSlug)
          return { plantSlug: line.plantSlug, configs }
        }),
      )
      const map: Record<string, MachineCapacityConfig[]> = {}
      for (const { plantSlug, configs } of results) {
        map[plantSlug] = configs
      }
      setConfigByPlant(map)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error cargando configuración'
      setError(msg)
      logger.error('[MachineCapacityPage] load error', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const getDraft = (machineid: string, fallback: number): string =>
    draftByMachine[machineid] ?? String(fallback)

  const setDraft = (machineid: string, val: string) =>
    setDraftByMachine((prev) => ({ ...prev, [machineid]: val }))

  const handleSaveRequest = (
    plantSlug: PlantSlug,
    machineid: string,
    machineName: string,
    draftVal: string,
  ) => {
    const cpm = parseFloat(draftVal)
    if (!Number.isFinite(cpm) || cpm <= 0 || cpm > 200) {
      toast({ title: 'Valor inválido', description: 'Introduce un número positivo (piezas/min).', variant: 'destructive' })
      return
    }
    setPendingSave({ plantSlug, machineid, machineName, newCpm: cpm })
  }

  const executeSave = useCallback(async () => {
    if (!pendingSave) return
    const { plantSlug, machineid, machineName, newCpm } = pendingSave
    setSaving(true)
    try {
      await saveMachineCapacity(
        plantSlug,
        machineid,
        newCpm,
        user?.email ?? 'admin',
      )
      // Actualizar estado local
      setConfigByPlant((prev) => {
        const updated = (prev[plantSlug] ?? []).map((c) =>
          c.machineid === machineid
            ? { ...c, nameplateMaxCpm: newCpm, updatedAt: new Date(), updatedByEmail: user?.email ?? '' }
            : c,
        )
        return { ...prev, [plantSlug]: updated }
      })
      // Limpiar draft
      setDraftByMachine((prev) => {
        const next = { ...prev }
        delete next[machineid]
        return next
      })
      toast({
        title: 'Guardado',
        description: `${machineName}: ${newCpm} pz/min guardado correctamente.`,
      })
      logger.info(`[MachineCapacity] ${plantSlug}/${machineid} → ${newCpm} cpm by ${user?.email}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      toast({ title: 'Error al guardar', description: msg, variant: 'destructive' })
      logger.error('[MachineCapacityPage] save error', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
      setPendingSave(null)
    }
  }, [pendingSave, user?.email, toast])

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-2xl flex items-center gap-3 text-muted-foreground">
        <Spinner /> Cargando configuración…
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Gauge className="w-5 h-5 text-cyan-400" />
          Velocidad Nameplate — Baader 142
        </h1>
        <p className="text-sm text-muted-foreground">
          Capacidad física máxima de cada Evisceradora según su panel de control.
          Se usa para detectar objetivos mal calibrados en Shoplogix y para calcular el OEE real.
        </p>
        <p className="text-xs text-amber-400/80 flex items-center gap-1 mt-1">
          <AlertTriangle className="w-3 h-3" />
          Cada guardado requiere confirmación de contraseña, aunque la sesión esté abierta.
        </p>
      </div>

      {error && (
        <p className="text-sm text-rose-400 flex items-center gap-1">
          <AlertTriangle className="w-4 h-4" /> {error}
          <Button variant="ghost" size="sm" onClick={loadAll} className="ml-2">
            <RotateCcw className="w-3 h-3 mr-1" /> Reintentar
          </Button>
        </p>
      )}

      {ACTIVE_PLANTS.map((line) => {
        const configs = configByPlant[line.plantSlug] ?? []
        return (
          <Card key={line.plantSlug}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="text-foreground">{line.label}</span>
                <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                  {line.description}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {configs.map((cfg, idx) => {
                const draftVal = getDraft(cfg.machineid, cfg.nameplateMaxCpm)
                const isDirty = draftVal !== String(cfg.nameplateMaxCpm)
                const parsedVal = parseFloat(draftVal)
                const isValid = Number.isFinite(parsedVal) && parsedVal > 0 && parsedVal <= 200

                return (
                  <div key={cfg.machineid} className="flex flex-col sm:flex-row sm:items-end gap-3 pb-3 border-b border-border/40 last:border-0 last:pb-0">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {cfg.machineName}
                        <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                          {idx === 0 ? '(modelo antiguo)' : '(modelo nuevo)'}
                        </span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={200}
                          step={0.5}
                          value={draftVal}
                          onChange={(e) => setDraft(cfg.machineid, e.target.value)}
                          className="w-28 text-sm"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">piezas / min</span>
                        {!isDirty && cfg.updatedAt && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            guardado
                          </span>
                        )}
                      </div>
                      {cfg.updatedAt && (
                        <p className="text-[10px] text-muted-foreground/60">
                          Actualizado por {cfg.updatedByEmail || 'admin'} el{' '}
                          {cfg.updatedAt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                      {!cfg.updatedAt && (
                        <p className="text-[10px] text-muted-foreground/50">Valor por defecto (no guardado en Firestore)</p>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant={isDirty ? 'default' : 'outline'}
                      disabled={!isDirty || !isValid || saving}
                      onClick={() => handleSaveRequest(line.plantSlug, cfg.machineid, cfg.machineName, draftVal)}
                      className="shrink-0"
                    >
                      {saving && pendingSave?.machineid === cfg.machineid
                        ? <Spinner />
                        : <><Save className="w-3.5 h-3.5 mr-1" /> Guardar</>
                      }
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}

      {/* Dialog de re-auth per-save */}
      <ReAuthConfirmDialog
        open={pendingSave !== null}
        onOpenChange={(open) => { if (!open) setPendingSave(null) }}
        reason={`para guardar la velocidad de ${pendingSave?.machineName ?? 'la máquina'}`}
        onConfirmed={executeSave}
      />
    </div>
  )
}
