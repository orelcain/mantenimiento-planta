/**
 * Modal de configuración global del módulo Grader.
 *
 * Cubre los parámetros que son política de planta (no cambian por turno):
 *   - Umbrales P0% (alerta + crítico) — usados en el timeline de todos los turnos
 *   - Rangos de peso por calibre — tabla de gramos por banda
 *
 * Se abre desde el header del landing con un botón ⚙️.
 * Carga desde Firestore al abrirse y guarda con merge al confirmar.
 */

import { useEffect, useState, useMemo } from 'react'
import { Settings2, Save, Loader2, Plus, Trash2, RotateCcw, Archive } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button, Input, Label, Badge } from '@/components/ui'
import { useAuthStore, useIsAdmin } from '@/store'
import { useToast } from '@/hooks/useToast'
import { getModuleRanges, saveModuleAnalysisConfig } from '@/services/grader/graderModuleConfig.service'
import { CALIBRE_WEIGHT_RANGES } from '@/services/grader/graderAnalytics'
import { savePauseTag, archivePauseTag, seedDefaultTagsIfEmpty } from '@/services/grader/graderPauseTags.service'
import { usePauseTags } from '@/hooks/usePauseTags'
import type { CalibreWeightRange } from '@/services/grader/types'
import type { GraderPauseTag } from '@/services/grader/graderPauseTags'
import { cn } from '@/lib/utils'

type SettingsTab = 'umbrales' | 'rangos' | 'tags'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'umbrales', label: 'Umbrales P0%' },
  { id: 'rangos',   label: 'Rangos calibre' },
  { id: 'tags',     label: 'Tags pausa' },
]

const EMPTY_TAG: Omit<GraderPauseTag, 'id'> & { id: string } = {
  id: '', label: '', emoji: '', color: '#94a3b8', bandFill: 'rgba(148,163,184,0.16)',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSettingsModal({ open, onOpenChange }: Props) {
  const user = useAuthStore(s => s.user)
  const isAdmin = useIsAdmin()
  const { toast } = useToast()

  const [tab, setTab] = useState<SettingsTab>('umbrales')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Umbrales
  const [alertThreshold, setAlertThreshold] = useState(2)
  const [criticalThreshold, setCriticalThreshold] = useState(3.5)

  // Rangos calibre
  const [ranges, setRanges] = useState<CalibreWeightRange[]>(CALIBRE_WEIGHT_RANGES)

  // Tags pausa
  const { tags: pauseTags, loading: tagsLoading, reload: reloadTags } = usePauseTags()
  const [newTag, setNewTag] = useState<GraderPauseTag>(EMPTY_TAG)
  const [savingTag, setSavingTag] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const isCustomRanges = useMemo(() => {
    if (ranges.length !== CALIBRE_WEIGHT_RANGES.length) return true
    return ranges.some((r, i) => {
      const def = CALIBRE_WEIGHT_RANGES[i]
      return !def || r.calibre !== def.calibre || r.minGrams !== def.minGrams || r.maxGrams !== def.maxGrams
    })
  }, [ranges])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getModuleRanges()
      .then(cfg => {
        if (cfg?.alertThreshold)    setAlertThreshold(cfg.alertThreshold)
        if (cfg?.criticalThreshold) setCriticalThreshold(cfg.criticalThreshold)
        if (cfg?.customWeightRanges && cfg.customWeightRanges.length > 0) {
          setRanges(cfg.customWeightRanges)
        } else {
          setRanges(CALIBRE_WEIGHT_RANGES)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  function updateRange(idx: number, patch: Partial<CalibreWeightRange>) {
    setRanges(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function addRange() {
    setRanges(prev => [...prev, { calibre: '', minGrams: 0, maxGrams: 0, label: '' }])
  }

  function removeRange(idx: number) {
    setRanges(prev => prev.filter((_, i) => i !== idx))
  }

  function resetRanges() {
    setRanges(CALIBRE_WEIGHT_RANGES)
  }

  async function handleSaveTag() {
    if (!user || !newTag.id || !newTag.label || !newTag.emoji) return
    setSavingTag(true)
    try {
      await savePauseTag(newTag, user.id)
      setNewTag(EMPTY_TAG)
      reloadTags()
      toast({ title: 'Tag guardado' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Reintentar', variant: 'destructive' })
    } finally {
      setSavingTag(false)
    }
  }

  async function handleArchiveTag(id: string) {
    if (!user) return
    try {
      await archivePauseTag(id, user.id)
      reloadTags()
      toast({ title: 'Tag archivado' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Reintentar', variant: 'destructive' })
    }
  }

  async function handleSeed() {
    if (!user) return
    setSeeding(true)
    try {
      const seeded = await seedDefaultTagsIfEmpty(user.id)
      reloadTags()
      toast({ title: seeded ? 'Tags inicializados' : 'La colección ya tenía datos' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Reintentar', variant: 'destructive' })
    } finally {
      setSeeding(false)
    }
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      await saveModuleAnalysisConfig({
        alertThreshold,
        criticalThreshold,
        customWeightRanges: isCustomRanges ? ranges : [],
        updatedBy: user.id,
      })
      toast({ title: 'Configuración guardada', description: 'Los cambios se aplicarán en todos los turnos.' })
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Error al guardar',
        description: err instanceof Error ? err.message : 'Reintentar',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            Configuración global del Grader
          </DialogTitle>
          <DialogDescription>
            Parámetros de política de planta — se aplican a todos los turnos.
          </DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border/60">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                tab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido — scrollable */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : tab === 'umbrales' ? (
            <div className="space-y-5">
              <p className="text-xs text-muted-foreground">
                Definen las líneas de referencia en el timeline y el color del badge de P0% en todos los turnos.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Umbral alerta P0% <span className="text-amber-500">●</span></Label>
                  <Input
                    type="number"
                    min={0} max={100} step={0.5}
                    value={alertThreshold}
                    onChange={e => setAlertThreshold(Number(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Línea amarilla en el timeline. Típico: 2%</p>
                </div>

                <div>
                  <Label className="text-xs">Umbral crítico P0% <span className="text-red-500">●</span></Label>
                  <Input
                    type="number"
                    min={0} max={100} step={0.5}
                    value={criticalThreshold}
                    onChange={e => setCriticalThreshold(Number(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Línea roja en el timeline. Típico: 3.5%</p>
                </div>
              </div>

              {/* Preview visual de los umbrales */}
              <div className="rounded-md border border-border/40 bg-muted/20 p-3">
                <p className="text-[11px] text-muted-foreground mb-2 font-medium">Vista previa de colores</p>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/15 text-emerald-600 font-medium">
                    ✓ OK — bajo {alertThreshold}%
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/15 text-amber-600 font-medium">
                    ⚠ Alerta — {alertThreshold}–{criticalThreshold}%
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/15 text-red-600 font-medium">
                    ✕ Crítico — sobre {criticalThreshold}%
                  </span>
                </div>
              </div>
            </div>
          ) : tab === 'tags' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Tags para clasificar pausas en el timeline. Se guardan en Firestore.
                </p>
                {isAdmin && (
                  <Button size="sm" variant="ghost" onClick={handleSeed} disabled={seeding} className="h-7 text-xs gap-1">
                    {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    Inicializar defaults
                  </Button>
                )}
              </div>

              {/* Lista de tags activos */}
              {tagsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1">
                  {pauseTags.map(tag => (
                    <div
                      key={tag.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/30 hover:bg-muted/20"
                    >
                      <span className="text-base leading-none w-6 text-center">{tag.emoji}</span>
                      <span className="flex-1 text-sm">{tag.label}</span>
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-[10px] font-mono text-muted-foreground/60">{tag.id}</span>
                      {isAdmin && (
                        <button
                          onClick={() => handleArchiveTag(tag.id)}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors p-0.5"
                          title="Archivar tag"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Formulario agregar nuevo tag */}
              {isAdmin && (
                <div className="border border-border/40 rounded-md p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Nuevo tag</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">ID <span className="text-muted-foreground">(snake_case)</span></Label>
                      <Input
                        value={newTag.id}
                        onChange={e => setNewTag(t => ({ ...t, id: e.target.value }))}
                        placeholder="ej: pausa_tecnica"
                        className="h-7 text-xs mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Emoji</Label>
                      <Input
                        value={newTag.emoji}
                        onChange={e => setNewTag(t => ({ ...t, emoji: e.target.value }))}
                        placeholder="🏷️"
                        className="h-7 text-xs mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={newTag.label}
                      onChange={e => setNewTag(t => ({ ...t, label: e.target.value }))}
                      placeholder="Nombre visible"
                      className="h-7 text-xs mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Color hex</Label>
                      <Input
                        value={newTag.color}
                        onChange={e => setNewTag(t => ({ ...t, color: e.target.value }))}
                        placeholder="#60a5fa"
                        className="h-7 text-xs mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">BandFill rgba</Label>
                      <Input
                        value={newTag.bandFill}
                        onChange={e => setNewTag(t => ({ ...t, bandFill: e.target.value }))}
                        placeholder="rgba(96,165,250,0.16)"
                        className="h-7 text-xs mt-1 font-mono"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5 mt-1"
                    onClick={handleSaveTag}
                    disabled={savingTag || !newTag.id || !newTag.label || !newTag.emoji}
                  >
                    {savingTag ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Agregar tag
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Rangos de peso (gramos) por calibre. Usados en análisis y timeline.
                </p>
                <div className="flex gap-1.5">
                  {isCustomRanges && (
                    <Button size="sm" variant="ghost" onClick={resetRanges} className="h-7 text-xs gap-1">
                      <RotateCcw className="w-3 h-3" />
                      Restaurar default
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={addRange} className="h-7 text-xs gap-1">
                      <Plus className="w-3 h-3" />
                      Agregar
                    </Button>
                  )}
                </div>
              </div>

              {isCustomRanges && (
                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                  Personalizado
                </Badge>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 px-2">Calibre</th>
                      <th className="py-1.5 px-2">Mín (g)</th>
                      <th className="py-1.5 px-2">Máx (g)</th>
                      {isAdmin && <th className="py-1.5 px-2 w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {ranges.map((r, idx) => (
                      <tr key={idx} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-1 px-2">
                          {isAdmin ? (
                            <Input
                              value={r.calibre}
                              onChange={e => updateRange(idx, { calibre: e.target.value })}
                              className="h-7 text-xs w-24"
                              placeholder="4-6 lb"
                            />
                          ) : (
                            <span className="font-mono">{r.calibre}</span>
                          )}
                        </td>
                        <td className="py-1 px-2">
                          {isAdmin ? (
                            <Input
                              type="number"
                              value={r.minGrams}
                              onChange={e => updateRange(idx, { minGrams: Number(e.target.value) })}
                              className="h-7 text-xs w-20 font-mono"
                            />
                          ) : (
                            <span className="font-mono">{r.minGrams.toLocaleString('es-CL')}</span>
                          )}
                        </td>
                        <td className="py-1 px-2">
                          {isAdmin ? (
                            <Input
                              type="number"
                              value={r.maxGrams}
                              onChange={e => updateRange(idx, { maxGrams: Number(e.target.value) })}
                              className="h-7 text-xs w-20 font-mono"
                            />
                          ) : (
                            <span className="font-mono">{r.maxGrams.toLocaleString('es-CL')}</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-1 px-2">
                            <button
                              onClick={() => removeRange(idx)}
                              className="text-muted-foreground/50 hover:text-destructive transition-colors p-1"
                              title="Eliminar rango"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-border/40">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          {isAdmin && tab !== 'tags' && (
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Guardando…</>
                : <><Save className="w-4 h-4 mr-1.5" />Guardar</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
