import { useEffect, useMemo, useRef, useState } from 'react'
import { Zap, Plus, Download, Upload, Trash2, Pencil, FileSpreadsheet, History } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
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
  Textarea,
} from '@/components/ui'
import { useAuthStore } from '@/store'
import { logger } from '@/lib/logger'
import {
  createTablero,
  deleteTablero,
  getTableros,
  nuevaRevision,
  updateTablero,
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

const CONDICION_BADGE: Record<CondicionNFPA, string> = {
  1: 'bg-success text-success-foreground',
  2: 'bg-warning text-warning-foreground',
  3: 'bg-destructive text-destructive-foreground',
}

function emptyDraft(): TableroInput {
  return {
    tag: '',
    nombre: '',
    tipo: 'CCM',
    condicionGeneral: 1,
    circuitos: [],
    principal: {},
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

export function TablerosPage() {
  const user = useAuthStore((s) => s.user)
  const canWrite = !!user && ['admin', 'supervisor', 'tecnico'].includes(user.rol)
  const autor = useMemo(() => {
    const nombre = [user?.nombre, user?.apellido].filter(Boolean).join(' ').trim()
    return nombre || user?.email || undefined
  }, [user])

  const [tableros, setTableros] = useState<Tablero[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TableroInput>(emptyDraft())
  const [revisionNota, setRevisionNota] = useState('')
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function reload() {
    setLoading(true)
    try {
      setTableros(await getTableros())
      setError(null)
    } catch (e) {
      logger.error('Error cargando tableros', e instanceof Error ? e : new Error(String(e)))
      setError('No se pudieron cargar los tableros.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const stats = useMemo(
    () => ({
      total: tableros.length,
      c1: tableros.filter((t) => t.condicionGeneral === 1).length,
      c2: tableros.filter((t) => t.condicionGeneral === 2).length,
      c3: tableros.filter((t) => t.condicionGeneral === 3).length,
    }),
    [tableros]
  )

  function openNuevo() {
    setEditingId(null)
    setDraft(emptyDraft())
    setRevisionNota('')
    setDialogOpen(true)
  }

  function openEditar(t: Tablero) {
    setEditingId(t.id)
    setDraft({
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
      createdBy: t.createdBy,
    })
    setRevisionNota('')
    setDialogOpen(true)
  }

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

  function addCircuito() {
    setDraft((d) => ({ ...d, circuitos: [...d.circuitos, emptyCircuito(String(d.circuitos.length + 1))] }))
  }

  function removeCircuito(idx: number) {
    setDraft((d) => ({ ...d, circuitos: d.circuitos.filter((_, i) => i !== idx) }))
  }

  async function handleSave() {
    if (!canWrite) return
    if (!draft.tag.trim() || !draft.nombre.trim()) {
      setError('Tag y nombre son obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const patch: Partial<TableroInput> = { ...draft }
        const original = tableros.find((t) => t.id === editingId)
        const revisiones = original ? [...original.revisiones] : []
        if (revisionNota.trim()) {
          revisiones.push(nuevaRevision('cambio', revisionNota.trim(), autor))
        }
        await updateTablero(editingId, { ...patch, revisiones })
      } else {
        await createTablero(draft, { autor })
      }
      setDialogOpen(false)
      await reload()
    } catch (e) {
      logger.error('Error guardando tablero', e instanceof Error ? e : new Error(String(e)))
      setError('No se pudo guardar. Revisa permisos e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(t: Tablero) {
    if (!user || user.rol !== 'admin') return
    if (!window.confirm(`¿Eliminar el tablero ${t.tag}? Esta acción no se puede deshacer.`)) return
    try {
      await deleteTablero(t.id)
      await reload()
    } catch (e) {
      logger.error('Error eliminando tablero', e instanceof Error ? e : new Error(String(e)))
      setError('No se pudo eliminar el tablero.')
    }
  }

  async function handleImport(file: File) {
    try {
      const parsed = await parsePlantillaTableros(file)
      if (!parsed) {
        setError('No se encontró una cabecera válida en el Excel (hoja "Cabecera" con columna tag).')
        return
      }
      setEditingId(null)
      setDraft(parsed)
      setRevisionNota('')
      setDialogOpen(true)
    } catch (e) {
      logger.error('Error importando Excel de tableros', e instanceof Error ? e : new Error(String(e)))
      setError('No se pudo leer el Excel. Verifica que use la plantilla.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Tableros / Unifilares</h1>
            <p className="text-sm text-muted-foreground">
              Levantamiento eléctrico (NFPA 70B) · base para unifilares e histórico de cambios
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={downloadPlantillaTableros}>
            <Download className="h-4 w-4 mr-2" />
            Plantilla Excel
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!canWrite}>
            <Upload className="h-4 w-4 mr-2" />
            Importar Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImport(f)
            }}
          />
          <Button onClick={openNuevo} disabled={!canWrite}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo levantamiento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Tableros</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-2xl font-bold text-success">{stats.c1}</div>
          <div className="text-sm text-muted-foreground">Condición 1</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-2xl font-bold text-warning">{stats.c2}</div>
          <div className="text-sm text-muted-foreground">Condición 2</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-2xl font-bold text-destructive">{stats.c3}</div>
          <div className="text-sm text-muted-foreground">Condición 3</div>
        </CardContent></Card>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">{error}</div>
      )}

      {loading ? (
        <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">Cargando…</CardContent></Card>
      ) : tableros.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Zap className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Sin tableros levantados</h3>
          <p className="text-sm text-muted-foreground">
            Empieza con “Nuevo levantamiento” o descarga la plantilla Excel para capturar en campo.
          </p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tableros.map((t) => {
            const ultima = t.revisiones[t.revisiones.length - 1]
            return (
              <Card key={t.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openEditar(t)}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{t.tag}</div>
                      <div className="text-sm text-muted-foreground">{t.nombre}</div>
                    </div>
                    <Badge className={CONDICION_BADGE[t.condicionGeneral]}>{t.condicionGeneral}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{TIPO_TABLERO_LABEL[t.tipo]}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                    <span>{t.circuitos.length} circuitos</span>
                    {t.tensionV ? <span>{t.tensionV} V</span> : null}
                    {ultima ? (
                      <span className="flex items-center gap-1">
                        <History className="h-3 w-3" />
                        rev {t.revisiones.length - 1} · {new Date(ultima.fecha).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {dialogOpen && (
        <Dialog open onOpenChange={(o) => !o && setDialogOpen(false)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? `Editar tablero ${draft.tag}` : 'Nuevo levantamiento de tablero'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Identificación</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Tag *</Label>
                    <Input value={draft.tag} onChange={(e) => setField('tag', e.target.value)} placeholder="CCM-AGUAS-01" />
                  </div>
                  <div className="space-y-1">
                    <Label>Nombre *</Label>
                    <Input value={draft.nombre} onChange={(e) => setField('nombre', e.target.value)} placeholder="CCM Tratamiento de aguas" />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <Select value={draft.tipo} onValueChange={(v) => setField('tipo', v as TipoTablero)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(TIPO_TABLERO_LABEL) as TipoTablero[]).map((k) => (
                          <SelectItem key={k} value={k}>{TIPO_TABLERO_LABEL[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Condición general (NFPA 70B)</Label>
                    <Select value={String(draft.condicionGeneral)} onValueChange={(v) => setField('condicionGeneral', Number(v) as CondicionNFPA)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {([1, 2, 3] as CondicionNFPA[]).map((c) => (
                          <SelectItem key={c} value={String(c)}>{CONDICION_LABEL[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Área</Label>
                    <Input value={draft.areaNombre ?? ''} onChange={(e) => setField('areaNombre', e.target.value || undefined)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Ubicación física</Label>
                    <Input value={draft.ubicacionFisica ?? ''} onChange={(e) => setField('ubicacionFisica', e.target.value || undefined)} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Alimentación / principal</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label>Tensión (V)</Label>
                    <Input type="number" value={draft.tensionV ?? ''} onChange={(e) => setField('tensionV', numOrUndef(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fases</Label>
                    <Select value={draft.fases ? String(draft.fases) : ''} onValueChange={(v) => setField('fases', v ? (Number(v) as 1 | 3) : undefined)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1F</SelectItem>
                        <SelectItem value="3">3F</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Icc disp. (kA)</Label>
                    <Input type="number" value={draft.iccDisponibleKA ?? ''} onChange={(e) => setField('iccDisponibleKA', numOrUndef(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Alimentado desde</Label>
                    <Input value={draft.alimentadoDesde ?? ''} onChange={(e) => setField('alimentadoDesde', e.target.value || undefined)} placeholder="TGD-Principal" />
                  </div>
                  <div className="space-y-1">
                    <Label>Ppal. rating (A)</Label>
                    <Input type="number" value={draft.principal?.ratingA ?? ''} onChange={(e) => setPrincipal('ratingA', numOrUndef(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Ppal. polos</Label>
                    <Input type="number" value={draft.principal?.polos ?? ''} onChange={(e) => setPrincipal('polos', numOrUndef(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Ppal. AIC (kA)</Label>
                    <Input type="number" value={draft.principal?.aicKA ?? ''} onChange={(e) => setPrincipal('aicKA', numOrUndef(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Ppal. marca</Label>
                    <Input value={draft.principal?.marca ?? ''} onChange={(e) => setPrincipal('marca', e.target.value || undefined)} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Circuitos derivados</div>
                  <Button variant="outline" size="sm" onClick={addCircuito}>
                    <Plus className="h-4 w-4 mr-1" /> Circuito
                  </Button>
                </div>
                {draft.circuitos.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Sin circuitos. Agrega el primero.</div>
                ) : (
                  <div className="space-y-2">
                    {draft.circuitos.map((c, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-md p-2">
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">N°</Label>
                          <Input value={c.numero} onChange={(e) => setCircuito(i, { numero: e.target.value })} />
                        </div>
                        <div className="col-span-4 space-y-1">
                          <Label className="text-xs">Carga (equipo)</Label>
                          <Input value={c.cargaNombre ?? ''} onChange={(e) => setCircuito(i, { cargaNombre: e.target.value || undefined })} placeholder="Motor 720004608" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Int. (A)</Label>
                          <Input type="number" value={c.ratingA ?? ''} onChange={(e) => setCircuito(i, { ratingA: numOrUndef(e.target.value) })} />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Calibre</Label>
                          <Input value={c.conductorCalibre ?? ''} onChange={(e) => setCircuito(i, { conductorCalibre: e.target.value || undefined })} placeholder="8 AWG" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Cond.</Label>
                          <Select value={String(c.condicion)} onValueChange={(v) => setCircuito(i, { condicion: Number(v) as CondicionNFPA })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {([1, 2, 3] as CondicionNFPA[]).map((cc) => (
                                <SelectItem key={cc} value={String(cc)}>{cc}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-5 space-y-1">
                          <Label className="text-xs">Descripción</Label>
                          <Input value={c.descripcion} onChange={(e) => setCircuito(i, { descripcion: e.target.value })} />
                        </div>
                        <div className="col-span-3 space-y-1">
                          <Label className="text-xs">Estado</Label>
                          <Select value={c.estado} onValueChange={(v) => setCircuito(i, { estado: v as EstadoCircuito })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ESTADO_CIRCUITO_LABEL) as EstadoCircuito[]).map((es) => (
                                <SelectItem key={es} value={es}>{ESTADO_CIRCUITO_LABEL[es]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-4 flex justify-end">
                          <Button variant="ghost" size="sm" onClick={() => removeCircuito(i)} className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <Label>Observaciones</Label>
                <Textarea rows={2} value={draft.observaciones ?? ''} onChange={(e) => setField('observaciones', e.target.value || undefined)} />
              </section>

              {editingId ? (
                <section className="space-y-2">
                  <Label className="flex items-center gap-1"><History className="h-4 w-4" /> Nota de revisión (opcional)</Label>
                  <Input value={revisionNota} onChange={(e) => setRevisionNota(e.target.value)} placeholder="Qué cambió en este tablero…" />
                  <p className="text-xs text-muted-foreground">Si escribes algo, se agrega como una nueva revisión al histórico.</p>
                </section>
              ) : (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" /> Se guardará como <strong>Revisión 0 (as-found)</strong> con la fecha de hoy.
                </p>
              )}
            </div>

            <DialogFooter className="gap-2">
              {editingId && user?.rol === 'admin' && (
                <Button variant="outline" className="mr-auto text-destructive" onClick={() => { const t = tableros.find((x) => x.id === editingId); if (t) handleDelete(t) }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !canWrite}>
                {editingId ? <Pencil className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear (Revisión 0)'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
