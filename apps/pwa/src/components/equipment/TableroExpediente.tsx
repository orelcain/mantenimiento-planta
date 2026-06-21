import { useEffect, useMemo, useRef, useState } from 'react'
import { Zap, Plus, Trash2, Download, Upload, Check, X, Pencil, History } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui'
import { useAuthStore } from '@/store'
import { logger } from '@/lib/logger'
import {
  deleteTablero,
  getTableroByEquipment,
  saveTableroForEquipment,
  type TableroInput,
} from '@/services/tableros'
import { downloadPlantillaTableros, parsePlantillaTableros } from '@/services/tablerosExcel'
import {
  CONDICION_LABEL,
  ESTADO_CIRCUITO_LABEL,
  TIPO_TABLERO_LABEL,
  type CircuitoTablero,
  type CondicionNFPA,
  type EstadoCircuito,
  type Tablero,
  type TipoTablero,
} from '@/types/tableros'
import type { Equipment } from '@/types'

const CONDICION_BADGE: Record<CondicionNFPA, string> = {
  1: 'border-emerald-500 text-emerald-600',
  2: 'border-amber-500 text-amber-600',
  3: 'border-red-500 text-red-600',
}

function emptyDraft(eq: Equipment): TableroInput {
  return {
    tag: eq.codigo,
    nombre: eq.nombre,
    tipo: 'CCM',
    hierarchyNodeId: eq.hierarchyNodeId,
    condicionGeneral: 1,
    circuitos: [],
    principal: {},
  }
}

function draftFrom(t: Tablero): TableroInput {
  return {
    tag: t.tag,
    nombre: t.nombre,
    tipo: t.tipo,
    hierarchyNodeId: t.hierarchyNodeId,
    areaNombre: t.areaNombre,
    ubicacionFisica: t.ubicacionFisica,
    tensionV: t.tensionV,
    fases: t.fases,
    iccDisponibleKA: t.iccDisponibleKA,
    alimentadoDesde: t.alimentadoDesde,
    principal: t.principal,
    barraTensionV: t.barraTensionV,
    barraCorrienteA: t.barraCorrienteA,
    condicionGeneral: t.condicionGeneral,
    circuitos: t.circuitos,
    fotos: t.fotos,
    observaciones: t.observaciones,
  }
}

function emptyCircuito(numero: string): CircuitoTablero {
  return { numero, descripcion: '', estado: 'activo', condicion: 1 }
}

function numOrUndef(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function TableroExpediente({ equipment }: { equipment: Equipment }) {
  const user = useAuthStore((s) => s.user)
  const canWrite = !!user && ['admin', 'supervisor', 'tecnico'].includes(user.rol)
  const autor = useMemo(() => {
    const nombre = [user?.nombre, user?.apellido].filter(Boolean).join(' ').trim()
    return nombre || user?.email || undefined
  }, [user])

  const [tablero, setTablero] = useState<Tablero | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<TableroInput>(emptyDraft(equipment))
  const [revisionNota, setRevisionNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setEditing(false)
    getTableroByEquipment(equipment.id)
      .then((t) => {
        if (!alive) return
        setTablero(t)
        setDraft(t ? draftFrom(t) : emptyDraft(equipment))
        setError(null)
      })
      .catch((e) => {
        logger.error('Error cargando tablero del equipo', e instanceof Error ? e : new Error(String(e)))
        if (alive) setError('No se pudo cargar el tablero.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [equipment.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const setField = <K extends keyof TableroInput>(key: K, value: TableroInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))
  const setPrincipal = (key: keyof NonNullable<TableroInput['principal']>, value: number | string | undefined) =>
    setDraft((d) => ({ ...d, principal: { ...(d.principal ?? {}), [key]: value } }))
  function setCircuito(idx: number, patch: Partial<CircuitoTablero>) {
    setDraft((d) => {
      const next = [...d.circuitos]
      next[idx] = { ...next[idx]!, ...patch }
      return { ...d, circuitos: next }
    })
  }
  const addCircuito = () =>
    setDraft((d) => ({ ...d, circuitos: [...d.circuitos, emptyCircuito(String(d.circuitos.length + 1))] }))
  const removeCircuito = (idx: number) =>
    setDraft((d) => ({ ...d, circuitos: d.circuitos.filter((_, i) => i !== idx) }))

  function startEdit() {
    setDraft(tablero ? draftFrom(tablero) : emptyDraft(equipment))
    setRevisionNota('')
    setEditing(true)
  }

  async function handleSave() {
    if (!canWrite) return
    setSaving(true)
    setError(null)
    try {
      await saveTableroForEquipment(
        equipment.id,
        { ...draft, tag: equipment.codigo, nombre: equipment.nombre, hierarchyNodeId: equipment.hierarchyNodeId },
        { autor, revisionNota: tablero ? revisionNota : undefined }
      )
      const fresh = await getTableroByEquipment(equipment.id)
      setTablero(fresh)
      setEditing(false)
    } catch (e) {
      logger.error('Error guardando tablero', e instanceof Error ? e : new Error(String(e)))
      setError('No se pudo guardar. Revisa permisos (técnico+) e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!user || user.rol !== 'admin' || !tablero) return
    if (!window.confirm(`¿Eliminar el levantamiento de tablero de ${equipment.codigo}?`)) return
    try {
      await deleteTablero(equipment.id)
      setTablero(null)
      setDraft(emptyDraft(equipment))
      setEditing(false)
    } catch (e) {
      logger.error('Error eliminando tablero', e instanceof Error ? e : new Error(String(e)))
      setError('No se pudo eliminar.')
    }
  }

  async function handleImport(file: File) {
    try {
      const parsed = await parsePlantillaTableros(file)
      if (!parsed) {
        setError('El Excel no tiene una hoja "Cabecera" válida.')
        return
      }
      setDraft({ ...parsed, tag: equipment.codigo, nombre: equipment.nombre, hierarchyNodeId: equipment.hierarchyNodeId })
      setEditing(true)
    } catch (e) {
      logger.error('Error importando Excel de tablero', e instanceof Error ? e : new Error(String(e)))
      setError('No se pudo leer el Excel. Usa la plantilla.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const ultima = tablero?.revisiones[tablero.revisiones.length - 1]

  if (loading) {
    return <p className="text-sm text-muted-foreground italic p-2">Cargando tablero…</p>
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">{error}</div>
      )}

      {/* Vista lectura */}
      {!editing && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Tablero / Unifilar</h3>
                <span className="text-[11px] text-muted-foreground">· levantamiento NFPA 70B</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={downloadPlantillaTableros}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Plantilla
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={!canWrite}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Importar
                </Button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f) }} />
                <Button size="sm" onClick={startEdit} disabled={!canWrite}>
                  {tablero ? <Pencil className="h-3.5 w-3.5 mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  {tablero ? 'Editar' : 'Levantar'}
                </Button>
              </div>
            </div>

            {!tablero ? (
              <p className="text-sm text-muted-foreground italic">
                Este equipo aún no tiene levantamiento de tablero. Pulsa “Levantar” o importa la plantilla Excel.
                Se guardará como <strong>Revisión 0 (as-found)</strong>.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className={CONDICION_BADGE[tablero.condicionGeneral]}>
                    {CONDICION_LABEL[tablero.condicionGeneral]}
                  </Badge>
                  <span className="text-sm text-muted-foreground">{TIPO_TABLERO_LABEL[tablero.tipo]}</span>
                  {tablero.tensionV ? <span className="text-sm text-muted-foreground">{tablero.tensionV} V{tablero.fases ? ` · ${tablero.fases}F` : ''}</span> : null}
                  {tablero.alimentadoDesde ? <span className="text-sm text-muted-foreground">desde {tablero.alimentadoDesde}</span> : null}
                  {ultima ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <History className="h-3 w-3" /> rev {tablero.revisiones.length - 1} · {new Date(ultima.fecha).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>

                {tablero.circuitos.length > 0 && (
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground mb-1">{tablero.circuitos.length} circuitos</div>
                    <div className="space-y-1">
                      {tablero.circuitos.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 border-t first:border-t-0 text-sm">
                          <span className="text-xs text-muted-foreground min-w-[24px]">{c.numero}</span>
                          <span className="flex-1">{c.cargaNombre || c.descripcion || '—'}</span>
                          <span className="text-xs text-muted-foreground">{c.ratingA ? `${c.ratingA} A` : ''} {c.conductorCalibre ?? ''}</span>
                          <span>{c.condicion === 1 ? '🟢' : c.condicion === 2 ? '🟡' : '🔴'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Vista edición */}
      {editing && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{tablero ? 'Editar tablero' : 'Levantar tablero'}</h3>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={draft.tipo} onValueChange={(v) => setField('tipo', v as TipoTablero)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_TABLERO_LABEL) as TipoTablero[]).map((k) => (
                      <SelectItem key={k} value={k}>{TIPO_TABLERO_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Condición general</Label>
                <Select value={String(draft.condicionGeneral)} onValueChange={(v) => setField('condicionGeneral', Number(v) as CondicionNFPA)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {([1, 2, 3] as CondicionNFPA[]).map((c) => (
                      <SelectItem key={c} value={String(c)}>{CONDICION_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Alimentado desde</Label>
                <Input value={draft.alimentadoDesde ?? ''} onChange={(e) => setField('alimentadoDesde', e.target.value || undefined)} placeholder="TGD-Principal" />
              </div>
              <div>
                <Label className="text-xs">Tensión (V)</Label>
                <Input type="number" value={draft.tensionV ?? ''} onChange={(e) => setField('tensionV', numOrUndef(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Fases</Label>
                <Select value={draft.fases ? String(draft.fases) : ''} onValueChange={(v) => setField('fases', v ? (Number(v) as 1 | 3) : undefined)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1F</SelectItem>
                    <SelectItem value="3">3F</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Icc disp. (kA)</Label>
                <Input type="number" value={draft.iccDisponibleKA ?? ''} onChange={(e) => setField('iccDisponibleKA', numOrUndef(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Ppal. rating (A)</Label>
                <Input type="number" value={draft.principal?.ratingA ?? ''} onChange={(e) => setPrincipal('ratingA', numOrUndef(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Ppal. polos</Label>
                <Input type="number" value={draft.principal?.polos ?? ''} onChange={(e) => setPrincipal('polos', numOrUndef(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Ppal. AIC (kA)</Label>
                <Input type="number" value={draft.principal?.aicKA ?? ''} onChange={(e) => setPrincipal('aicKA', numOrUndef(e.target.value))} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Circuitos derivados</Label>
                <Button variant="outline" size="sm" onClick={addCircuito}><Plus className="h-3.5 w-3.5 mr-1" /> Circuito</Button>
              </div>
              {draft.circuitos.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Sin circuitos. Agrega el primero.</p>
              ) : (
                draft.circuitos.map((c, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-md p-2">
                    <div className="col-span-2"><Label className="text-[11px]">N°</Label><Input value={c.numero} onChange={(e) => setCircuito(i, { numero: e.target.value })} /></div>
                    <div className="col-span-5"><Label className="text-[11px]">Carga (equipo)</Label><Input value={c.cargaNombre ?? ''} onChange={(e) => setCircuito(i, { cargaNombre: e.target.value || undefined })} placeholder="Motor 720004608" /></div>
                    <div className="col-span-2"><Label className="text-[11px]">Int. (A)</Label><Input type="number" value={c.ratingA ?? ''} onChange={(e) => setCircuito(i, { ratingA: numOrUndef(e.target.value) })} /></div>
                    <div className="col-span-2"><Label className="text-[11px]">Cond.</Label>
                      <Select value={String(c.condicion)} onValueChange={(v) => setCircuito(i, { condicion: Number(v) as CondicionNFPA })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{([1, 2, 3] as CondicionNFPA[]).map((cc) => (<SelectItem key={cc} value={String(cc)}>{cc}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 flex justify-end"><Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeCircuito(i)}><Trash2 className="h-4 w-4" /></Button></div>
                    <div className="col-span-7"><Label className="text-[11px]">Descripción</Label><Input value={c.descripcion} onChange={(e) => setCircuito(i, { descripcion: e.target.value })} /></div>
                    <div className="col-span-3"><Label className="text-[11px]">Calibre</Label><Input value={c.conductorCalibre ?? ''} onChange={(e) => setCircuito(i, { conductorCalibre: e.target.value || undefined })} placeholder="8 AWG" /></div>
                    <div className="col-span-2"><Label className="text-[11px]">Estado</Label>
                      <Select value={c.estado} onValueChange={(v) => setCircuito(i, { estado: v as EstadoCircuito })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(ESTADO_CIRCUITO_LABEL) as EstadoCircuito[]).map((es) => (<SelectItem key={es} value={es}>{ESTADO_CIRCUITO_LABEL[es]}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div>
              <Label className="text-xs">Observaciones</Label>
              <Textarea rows={2} value={draft.observaciones ?? ''} onChange={(e) => setField('observaciones', e.target.value || undefined)} />
            </div>

            {tablero ? (
              <div>
                <Label className="text-xs flex items-center gap-1"><History className="h-3.5 w-3.5" /> Nota de revisión (opcional)</Label>
                <Input value={revisionNota} onChange={(e) => setRevisionNota(e.target.value)} placeholder="Qué cambió…" />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Se guardará como Revisión 0 (as-found) con la fecha de hoy.</p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={saving || !canWrite}>
                <Check className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
              </Button>
              {tablero && user?.rol === 'admin' && (
                <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
