import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { BookOpen, Check, ClipboardList, FileText, Gauge, Info, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, CardContent, Input, Label, Textarea } from '@/components/ui'
import { getEquipments, updateEquipment } from '@/services/equipment'
import {
  addMaintenanceLogEntry,
  deleteMaintenanceLogEntry,
  getMaintenanceLog,
  updateMaintenanceLogEntry,
} from '@/services/maintenanceLog'
import { usePermissions } from '@/hooks/usePermissions'
import { useAppStore } from '@/store'
import { logger } from '@/lib/logger'
import { FAMILIA_LABEL, checklistDe, familiaDe } from '@/lib/nfpa70b'
import type { ChecklistResultado, Equipment, FichaTecnica, Incident, MaintenanceLogEntry } from '@/types'

/**
 * Ficha Técnica NFPA 70B — v2 (lectura + captura de placa).
 *
 * Expediente del equipo según la NFPA 70B (Centro Técnico Documental).
 * v1: estructura solo lectura. v2: editor inline para capturar la placa eléctrica
 * y el bloque RCM (condición 1/2/3), que se guardan en `equipment.fichaTecnica`.
 * El historial (`maintenanceLog`) llega en la v3.
 *
 * Ver `docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md`.
 */

const CRITICIDAD: Record<Equipment['criticidad'], { nivel: string; label: string; cls: string }> = {
  alta: { nivel: 'A', label: 'Crítica', cls: 'border-red-500 text-red-600' },
  media: { nivel: 'B', label: 'Media', cls: 'border-amber-500 text-amber-600' },
  baja: { nivel: 'C', label: 'Baja', cls: 'border-emerald-500 text-emerald-600' },
}

const CONDICION: Record<1 | 2 | 3, { emoji: string; label: string }> = {
  1: { emoji: '🟢', label: 'Condición 1 · como nuevo' },
  2: { emoji: '🟡', label: 'Condición 2 · con desvíos' },
  3: { emoji: '🔴', label: 'Condición 3 · acción requerida' },
}

const SEVERIDAD: Record<MaintenanceLogEntry['severidad'], string> = {
  verde: '🟢',
  amarillo: '🟡',
  rojo: '🔴',
}

const TIPOS: { value: MaintenanceLogEntry['tipo']; label: string }[] = [
  { value: 'inspeccion', label: 'Inspección' },
  { value: 'termografia', label: 'Termografía' },
  { value: 'medicion', label: 'Medición' },
  { value: 'preventivo', label: 'Preventivo' },
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'predictivo', label: 'Predictivo' },
]

type EntryDraft = {
  tipo: MaintenanceLogEntry['tipo']
  severidad: MaintenanceLogEntry['severidad']
  fecha: string
  tecnico: string
  hallazgo: string
  checklist: ChecklistResultado[]
}

function emptyDraft(equipment: Pick<Equipment, 'nombre' | 'tipo'>): EntryDraft {
  return {
    tipo: 'inspeccion',
    severidad: 'verde',
    fecha: new Date().toISOString().slice(0, 10),
    tecnico: '',
    hallazgo: '',
    // Protocolo de inspección por familia (NFPA 70B); default "no evaluado".
    checklist: checklistDe(equipment).map((t) => ({ id: t.id, tarea: t.tarea, estado: 'na' as const })),
  }
}

const CHK_ESTADO: { value: ChecklistResultado['estado']; label: string; on: string }[] = [
  { value: 'ok', label: '✓', on: 'bg-emerald-500 text-white' },
  { value: 'obs', label: '⚠', on: 'bg-amber-500 text-white' },
  { value: 'na', label: '–', on: 'bg-muted text-foreground' },
]

function rangoText(r?: { min?: number; max?: number }): string {
  if (!r) return ''
  if (r.min != null && r.max != null) return `${r.min}–${r.max}`
  if (r.max != null) return `máx ${r.max}`
  if (r.min != null) return `mín ${r.min}`
  return ''
}
function fueraDeRango(valor: string | undefined, r?: { min?: number; max?: number }): boolean {
  if (!r || valor == null || valor.trim() === '') return false
  const v = Number(valor)
  if (!Number.isFinite(v)) return false
  if (r.max != null && v > r.max) return true
  if (r.min != null && v < r.min) return true
  return false
}

const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.value, t.label])) as Record<
  MaintenanceLogEntry['tipo'],
  string
>

// Prioridad de incidencia → semáforo de condición (Cap. 9)
const PRIORIDAD_SEV: Record<string, MaintenanceLogEntry['severidad']> = {
  critica: 'rojo',
  alta: 'rojo',
  media: 'amarillo',
  baja: 'verde',
}

type TimelineRow = {
  key: string
  fecha: Date
  tipoLabel: string
  severidad: MaintenanceLogEntry['severidad']
  texto: string
  source: 'log' | 'incidencia'
  checklist?: ChecklistResultado[]
  logId?: string
}

function asDate(v: unknown): Date {
  if (v instanceof Date) return v
  const maybe = v as { toDate?: () => Date } | null
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate()
  return new Date()
}

// NFPA 70B Cap. 9 / §2.11: intervalo base por criticidad (6 m – 3 a) × factor por condición.
const INTERVALO_BASE: Record<Equipment['criticidad'], number> = { alta: 180, media: 365, baja: 1095 }
const FACTOR_COND: Record<1 | 2 | 3, number> = { 1: 1.5, 2: 1, 3: 0.5 }

function intervaloInspeccionDias(criticidad: Equipment['criticidad'], condicion?: 1 | 2 | 3): number {
  return Math.round(INTERVALO_BASE[criticidad] * (condicion ? FACTOR_COND[condicion] : 1))
}

function SectionTitle({
  icon: Icon,
  children,
  hint,
}: {
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{children}</h3>
      {hint && <span className="text-[11px] text-muted-foreground">· {hint}</span>}
    </div>
  )
}

function Field({ label, value, pending }: { label: string; value?: ReactNode; pending?: boolean }) {
  const empty = pending || value === undefined || value === null || value === ''
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${empty ? 'italic text-muted-foreground/70' : ''}`}>
        {empty ? 'Por capturar' : value}
      </div>
    </div>
  )
}

/** Quita claves vacías/undefined/NaN para no enviar basura a Firestore. */
function clean(ficha: FichaTecnica): FichaTecnica {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(ficha)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'number' && Number.isNaN(v)) continue
    out[k] = v
  }
  return out as FichaTecnica
}

export function FichaTecnicaNFPA70B({
  equipment,
  incidents = [],
}: {
  equipment: Equipment
  incidents?: Incident[]
}) {
  const { setEquipment } = useAppStore()
  const [ficha, setFicha] = useState<FichaTecnica>(equipment.fichaTecnica ?? {})
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Al cambiar de equipo, recargar su ficha y salir de edición.
  useEffect(() => {
    setFicha(equipment.fichaTecnica ?? {})
    setEditing(false)
  }, [equipment.id, equipment.fichaTecnica])

  const crit = CRITICIDAD[equipment.criticidad]
  const fechaInstalacion = equipment.fechaInstalacion
    ? new Date(equipment.fechaInstalacion).toLocaleDateString()
    : undefined
  const proxima = ficha.proximaInspeccion
    ? new Date(ficha.proximaInspeccion).toLocaleDateString()
    : undefined

  const num = (v: string): number | undefined => (v === '' ? undefined : Number(v))
  const set = (patch: Partial<FichaTecnica>) => setFicha((f) => ({ ...f, ...patch }))

  async function handleSave() {
    setSaving(true)
    try {
      const cleaned = clean(ficha)
      await updateEquipment(equipment.id, { fichaTecnica: cleaned })
      const fresh = await getEquipments()
      setEquipment(fresh)
      setFicha(cleaned)
      setEditing(false)
    } catch (err) {
      logger.error('Error guardando ficha técnica NFPA 70B', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setFicha(equipment.fichaTecnica ?? {})
    setEditing(false)
  }

  // Historial de mantenimiento (maintenanceLog)
  const [log, setLog] = useState<MaintenanceLogEntry[]>([])
  const [loadingLog, setLoadingLog] = useState(false)
  const [addingEntry, setAddingEntry] = useState(false)
  const [savingEntry, setSavingEntry] = useState(false)
  const [draft, setDraft] = useState<EntryDraft>(() => emptyDraft(equipment))

  function setChkItem(i: number, patch: Partial<ChecklistResultado>) {
    setDraft((d) => ({ ...d, checklist: d.checklist.map((t, j) => (j === i ? { ...t, ...patch } : t)) }))
  }
  // Metadatos del protocolo (cualitativo/medición, rango, especificación) por familia.
  const chkMetas = checklistDe(equipment)

  // Edición/borrado de entradas del historial (solo admin).
  const { isAdmin } = usePermissions()
  const [editLogId, setEditLogId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{
    fecha: string
    tipo: MaintenanceLogEntry['tipo']
    severidad: MaintenanceLogEntry['severidad']
    tecnico: string
    hallazgo: string
  }>({ fecha: '', tipo: 'inspeccion', severidad: 'verde', tecnico: '', hallazgo: '' })

  function startEditLog(logId: string) {
    const l = log.find((x) => x.id === logId)
    if (!l) return
    setEditLogId(logId)
    setEditDraft({
      fecha: new Date(l.fecha).toISOString().slice(0, 10),
      tipo: l.tipo,
      severidad: l.severidad,
      tecnico: l.tecnico ?? '',
      hallazgo: l.hallazgo,
    })
  }

  async function saveEditLog() {
    if (!editLogId || !editDraft.hallazgo.trim()) return
    try {
      await updateMaintenanceLogEntry(editLogId, {
        fecha: new Date(editDraft.fecha),
        tipo: editDraft.tipo,
        severidad: editDraft.severidad,
        tecnico: editDraft.tecnico.trim() || undefined,
        hallazgo: editDraft.hallazgo.trim(),
      })
      setLog(await getMaintenanceLog(equipment.id))
      setEditLogId(null)
    } catch (err) {
      logger.error('Error editando entrada del historial', err instanceof Error ? err : new Error(String(err)))
      alert('No se pudo editar la entrada.')
    }
  }

  async function delLog(logId: string) {
    if (!window.confirm('¿Eliminar esta entrada del historial? No se puede deshacer.')) return
    try {
      await deleteMaintenanceLogEntry(logId)
      setLog(await getMaintenanceLog(equipment.id))
      if (editLogId === logId) setEditLogId(null)
    } catch (err) {
      logger.error('Error eliminando entrada del historial', err instanceof Error ? err : new Error(String(err)))
      alert('No se pudo eliminar la entrada.')
    }
  }

  useEffect(() => {
    let alive = true
    setLoadingLog(true)
    getMaintenanceLog(equipment.id)
      .then((rows) => {
        if (alive) setLog(rows)
      })
      .catch((err) =>
        logger.error('Error cargando historial NFPA 70B', err instanceof Error ? err : new Error(String(err))),
      )
      .finally(() => {
        if (alive) setLoadingLog(false)
      })
    return () => {
      alive = false
    }
  }, [equipment.id])

  async function handleAddEntry() {
    if (!draft.hallazgo.trim()) return
    setSavingEntry(true)
    try {
      const fechaEvento = new Date(draft.fecha)
      // Cerrar el ciclo NFPA 70B: una inspección registra la condición observada
      // (severidad → condición) y reprograma la próxima fecha (criticidad × condición).
      const esInspeccion = ['inspeccion', 'termografia', 'medicion', 'preventivo', 'predictivo'].includes(draft.tipo)
      const nuevaCondicion: 1 | 2 | 3 | undefined = esInspeccion
        ? ({ verde: 1, amarillo: 2, rojo: 3 } as const)[draft.severidad]
        : undefined
      const condParaIntervalo = nuevaCondicion ?? ficha.condicion
      const intervalo = intervaloInspeccionDias(equipment.criticidad, condParaIntervalo)
      const proximaISO = esInspeccion
        ? new Date(fechaEvento.getTime() + intervalo * 86400000).toISOString().slice(0, 10)
        : undefined

      // Solo se guardan las tareas evaluadas (estado ≠ no-evaluado) o con medición.
      const checklist = draft.checklist.filter(
        (t) => t.estado !== 'na' || (t.valor && t.valor.trim()) || (t.detalle && t.detalle.trim()),
      )

      await addMaintenanceLogEntry({
        equipmentId: equipment.id,
        hierarchyNodeId: equipment.hierarchyNodeId,
        fecha: fechaEvento,
        tipo: draft.tipo,
        tecnico: draft.tecnico.trim() || undefined,
        hallazgo: draft.hallazgo.trim(),
        severidad: draft.severidad,
        proximaInspeccion: proximaISO,
        checklist: checklist.length > 0 ? checklist : undefined,
      })

      // Si fue una inspección, actualizar la ficha (condición + próxima inspección).
      if (esInspeccion) {
        const cleaned = clean({
          ...ficha,
          condicion: nuevaCondicion,
          frecuenciaInspeccionDias: intervalo,
          proximaInspeccion: proximaISO,
        })
        await updateEquipment(equipment.id, { fichaTecnica: cleaned })
        setFicha(cleaned)
      }

      const rows = await getMaintenanceLog(equipment.id)
      setLog(rows)
      if (esInspeccion) {
        const fresh = await getEquipments()
        setEquipment(fresh)
      }
      setDraft(emptyDraft(equipment))
      setAddingEntry(false)
    } catch (err) {
      logger.error('Error registrando evento NFPA 70B', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSavingEntry(false)
    }
  }

  // Timeline unificado: historial manual (maintenanceLog) + incidencias del equipo
  const timeline: TimelineRow[] = [
    ...log.map((e) => ({
      key: `log-${e.id}`,
      fecha: e.fecha,
      tipoLabel: TIPO_LABEL[e.tipo],
      severidad: e.severidad,
      texto: `${e.tecnico ? `${e.tecnico} — ` : ''}${e.hallazgo}`,
      source: 'log' as const,
      checklist: e.checklist,
      logId: e.id,
    })),
    ...incidents.map((i) => ({
      key: `inc-${i.id}`,
      fecha: asDate(i.createdAt),
      tipoLabel: 'Incidencia',
      severidad: PRIORIDAD_SEV[i.prioridad] ?? 'amarillo',
      texto: i.titulo,
      source: 'incidencia' as const,
    })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  // v3c — Próxima inspección sugerida (NFPA 70B Cap. 9): criticidad × condición desde la última fecha.
  const refFecha = log[0]?.fecha ?? (equipment.fechaInstalacion ? new Date(equipment.fechaInstalacion) : new Date())
  const sugeridaDias = intervaloInspeccionDias(equipment.criticidad, ficha.condicion)
  const sugeridaFecha = new Date(refFecha.getTime() + sugeridaDias * 86400000)
  const sugeridaISO = sugeridaFecha.toISOString().slice(0, 10)

  async function aplicarSugerida() {
    setSaving(true)
    try {
      const cleaned = clean({ ...ficha, frecuenciaInspeccionDias: sugeridaDias, proximaInspeccion: sugeridaISO })
      await updateEquipment(equipment.id, { fichaTecnica: cleaned })
      const fresh = await getEquipments()
      setEquipment(fresh)
      setFicha(cleaned)
    } catch (err) {
      logger.error('Error aplicando próxima inspección sugerida', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Datos de placa — NFPA 70B §2.2 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={FileText} hint="NFPA 70B §2.2 · datos de rotulación">
              Datos de placa
            </SectionTitle>
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar ficha
              </Button>
            )}
          </div>

          {editing ? (
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Potencia (kW)</Label>
                <Input type="number" value={ficha.potenciaKw ?? ''} onChange={(e) => set({ potenciaKw: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Voltaje (V)</Label>
                <Input type="number" value={ficha.voltajeV ?? ''} onChange={(e) => set({ voltajeV: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Corriente nominal (A)</Label>
                <Input type="number" value={ficha.corrienteA ?? ''} onChange={(e) => set({ corrienteA: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">RPM</Label>
                <Input type="number" value={ficha.rpm ?? ''} onChange={(e) => set({ rpm: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Factor de servicio</Label>
                <Input type="number" step="0.01" value={ficha.factorServicio ?? ''} onChange={(e) => set({ factorServicio: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Clase aislamiento</Label>
                <Input value={ficha.claseAislamiento ?? ''} onChange={(e) => set({ claseAislamiento: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Grado IP</Label>
                <Input value={ficha.gradoIP ?? ''} onChange={(e) => set({ gradoIP: e.target.value })} />
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Código SAP" value={equipment.codigo} />
              <Field label="Marca" value={equipment.marca} />
              <Field label="Modelo" value={equipment.modelo} />
              <Field label="N° de serie" value={equipment.numeroSerie} />
              <Field label="Instalación" value={fechaInstalacion} />
              <Field label="Potencia" value={ficha.potenciaKw != null ? `${ficha.potenciaKw} kW` : undefined} />
              <Field label="Voltaje" value={ficha.voltajeV != null ? `${ficha.voltajeV} V` : undefined} />
              <Field label="Corriente nominal" value={ficha.corrienteA != null ? `${ficha.corrienteA} A` : undefined} />
              <Field label="RPM" value={ficha.rpm} />
              <Field label="Factor de servicio" value={ficha.factorServicio} />
              <Field label="Clase aislamiento" value={ficha.claseAislamiento} />
              <Field label="Grado IP" value={ficha.gradoIP} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criticidad / RCM — NFPA 70B §2.4 + Cap. 9 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionTitle icon={Gauge} hint="NFPA 70B §2.4 + Cap. 9">
            Criticidad · RCM
          </SectionTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className={`${crit.cls} text-sm`}>
              Criticidad {crit.nivel} · {crit.label}
            </Badge>
            {editing ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground mr-1">Condición:</span>
                {([1, 2, 3] as const).map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant={ficha.condicion === c ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => set({ condicion: ficha.condicion === c ? undefined : c })}
                  >
                    {CONDICION[c].emoji} {c}
                  </Button>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                Condición actual:{' '}
                {ficha.condicion ? (
                  <span className="font-medium text-foreground">
                    {CONDICION[ficha.condicion].emoji} {CONDICION[ficha.condicion].label}
                  </span>
                ) : (
                  <span className="italic">por evaluar</span>
                )}
              </span>
            )}
          </div>

          {editing ? (
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Vida útil estimada (años)</Label>
                <Input type="number" value={ficha.vidaUtilAnios ?? ''} onChange={(e) => set({ vidaUtilAnios: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Frecuencia inspección (días)</Label>
                <Input type="number" value={ficha.frecuenciaInspeccionDias ?? ''} onChange={(e) => set({ frecuenciaInspeccionDias: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Próxima inspección</Label>
                <Input type="date" value={ficha.proximaInspeccion ?? ''} onChange={(e) => set({ proximaInspeccion: e.target.value })} />
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Vida útil estimada" value={ficha.vidaUtilAnios != null ? `${ficha.vidaUtilAnios} años` : undefined} />
              <Field label="Próxima inspección" value={proxima} />
              <Field label="Frecuencia" value={ficha.frecuenciaInspeccionDias != null ? `${ficha.frecuenciaInspeccionDias} días` : undefined} />
            </div>
          )}

          {!editing && (
            <div className="flex items-center justify-between gap-2 flex-wrap rounded-md border border-dashed p-2.5">
              <span className="text-xs text-muted-foreground">
                💡 Próxima inspección sugerida (Cap. 9):{' '}
                <span className="font-medium text-foreground">{sugeridaFecha.toLocaleDateString()}</span> — criticidad{' '}
                {crit.nivel} × condición {ficha.condicion ?? '—'} → {sugeridaDias} d desde {refFecha.toLocaleDateString()}
              </span>
              <Button size="sm" variant="outline" onClick={aplicarSugerida} disabled={saving}>
                Usar sugerida
              </Button>
            </div>
          )}

          {editing && (
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Check className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentos — heredados del nodo de jerarquía */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <SectionTitle icon={BookOpen} hint="manuales · planos · certificados · garantías">
            Documentos
          </SectionTitle>
          <p className="text-sm text-muted-foreground italic">
            {equipment.hierarchyNodeId
              ? 'Se heredan del nodo de jerarquía vinculado (manuales, planos, certificados, garantías).'
              : 'Equipo sin nodo de jerarquía vinculado — aún no hereda documentos.'}
          </p>
        </CardContent>
      </Card>

      {/* Historial — maintenanceLog */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={ClipboardList} hint="la historia del equipo">
              Historial de mantenimiento
            </SectionTitle>
            {!addingEntry && (
              <Button variant="outline" size="sm" onClick={() => setAddingEntry(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Registrar evento
              </Button>
            )}
          </div>

          {addingEntry && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={draft.tipo}
                    onChange={(e) => setDraft((d) => ({ ...d, tipo: e.target.value as MaintenanceLogEntry['tipo'] }))}
                  >
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Fecha</Label>
                  <Input type="date" value={draft.fecha} onChange={(e) => setDraft((d) => ({ ...d, fecha: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Técnico</Label>
                  <Input value={draft.tecnico} onChange={(e) => setDraft((d) => ({ ...d, tecnico: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Condición / severidad</Label>
                <div className="flex items-center gap-1.5 mt-1">
                  {(['verde', 'amarillo', 'rojo'] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={draft.severidad === s ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDraft((d) => ({ ...d, severidad: s }))}
                    >
                      {SEVERIDAD[s]} {s}
                    </Button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  🟢 Condición 1 · como nuevo, sin alertas — 🟡 Condición 2 · con desvíos, requiere atención — 🔴 Condición 3 ·
                  acción correctiva requerida.
                </p>
              </div>
              <div>
                <Label className="text-xs">Protocolo de inspección · {FAMILIA_LABEL[familiaDe(equipment)]}</Label>
                <div className="mt-1 space-y-1.5">
                  {draft.checklist.map((t, i) => {
                    const m = chkMetas.find((x) => x.id === t.id)
                    const medicion = m?.tipo === 'medicion'
                    const fuera = medicion && fueraDeRango(t.valor, m?.rango)
                    return (
                      <div key={t.id} className="rounded-md border p-2 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium">{t.tarea}</div>
                            {m?.nota && <div className="text-[10px] text-muted-foreground">{m.nota}</div>}
                          </div>
                          <div className="inline-flex shrink-0 overflow-hidden rounded-md border">
                            {CHK_ESTADO.map((st) => (
                              <button
                                key={st.value}
                                type="button"
                                onClick={() => setChkItem(i, { estado: st.value })}
                                className={`px-2 py-1 text-[11px] ${t.estado === st.value ? st.on : 'bg-background text-muted-foreground'}`}
                                title={st.value === 'ok' ? 'Conforme' : st.value === 'obs' ? 'Observación' : 'No evaluado / N/A'}
                              >
                                {st.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {medicion && (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                className={`h-7 w-24 text-xs ${fuera ? 'border-red-500 text-red-600' : ''}`}
                                placeholder="valor"
                                value={t.valor ?? ''}
                                onChange={(e) => setChkItem(i, { valor: e.target.value })}
                              />
                              {m?.unidad && <span className="text-[10px] text-muted-foreground">{m.unidad}</span>}
                              {m?.rango && (
                                <span className={`text-[10px] ${fuera ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                                  ok: {rangoText(m.rango)}
                                  {fuera ? ' · fuera' : ''}
                                </span>
                              )}
                            </div>
                          )}
                          <Input
                            className="h-7 flex-1 min-w-[120px] text-xs"
                            placeholder={m?.instrumento ? `Detalle / borne (req. ${m.instrumento})` : 'Detalle (opcional)'}
                            value={t.detalle ?? ''}
                            onChange={(e) => setChkItem(i, { detalle: e.target.value })}
                          />
                          {m?.instrumento && (
                            <button
                              type="button"
                              className="text-[10px] text-muted-foreground underline decoration-dotted"
                              onClick={() => setChkItem(i, { estado: 'na', detalle: 'falta de instrumento' })}
                              title={`Marcar N/A por falta de ${m.instrumento}`}
                            >
                              sin instrumento
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  ✓ conforme · ⚠ observación · – no evaluado/N/A. En medición anota el valor (se resalta si sale del rango
                  sugerido). Solo se guardan las tareas evaluadas o con valor. Rangos = sugeridos (afinar con el fabricante).
                </p>
              </div>
              <div>
                <Label className="text-xs">Hallazgo</Label>
                <Textarea
                  rows={2}
                  placeholder="Qué se observó / midió / reparó…"
                  value={draft.hallazgo}
                  onChange={(e) => setDraft((d) => ({ ...d, hallazgo: e.target.value }))}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Si el tipo es una inspección (inspección/termografía/medición/preventivo/predictivo), al guardar se
                actualiza la condición del equipo según la severidad y se reprograma la próxima inspección
                (criticidad × condición).
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleAddEntry} disabled={savingEntry || !draft.hallazgo.trim()}>
                  <Check className="h-3.5 w-3.5 mr-1.5" /> {savingEntry ? 'Guardando…' : 'Guardar evento'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAddingEntry(false)
                    setDraft(emptyDraft(equipment))
                  }}
                  disabled={savingEntry}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
                </Button>
              </div>
            </div>
          )}

          {loadingLog && timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Cargando historial…</p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Sin registros aún. Registra el primer evento; las incidencias del equipo aparecen aquí automáticamente.
            </p>
          ) : (
            <div className="space-y-1">
              {timeline.map((e) => {
                const lid = e.source === 'log' ? e.logId : undefined
                if (lid && editLogId === lid) {
                  return (
                    <div key={e.key} className="space-y-2 rounded-md border bg-muted/30 p-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="date"
                          value={editDraft.fecha}
                          onChange={(ev) => setEditDraft((d) => ({ ...d, fecha: ev.target.value }))}
                        />
                        <Input
                          placeholder="Técnico"
                          value={editDraft.tecnico}
                          onChange={(ev) => setEditDraft((d) => ({ ...d, tecnico: ev.target.value }))}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(['verde', 'amarillo', 'rojo'] as const).map((s) => (
                          <Button
                            key={s}
                            type="button"
                            size="sm"
                            variant={editDraft.severidad === s ? 'default' : 'outline'}
                            onClick={() => setEditDraft((d) => ({ ...d, severidad: s }))}
                          >
                            {SEVERIDAD[s]} {s}
                          </Button>
                        ))}
                      </div>
                      <Textarea
                        rows={2}
                        value={editDraft.hallazgo}
                        onChange={(ev) => setEditDraft((d) => ({ ...d, hallazgo: ev.target.value }))}
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={saveEditLog} disabled={!editDraft.hallazgo.trim()}>
                          <Check className="h-3.5 w-3.5 mr-1.5" /> Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditLogId(null)}>
                          <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
                        </Button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={e.key} className="flex items-start gap-3 py-2 border-t first:border-t-0">
                    <span className="text-sm leading-5">{SEVERIDAD[e.severidad]}</span>
                    <span className="text-xs text-muted-foreground min-w-[88px]">{e.fecha.toLocaleDateString()}</span>
                    <span className="text-sm flex-1 min-w-0">
                      <span className="font-semibold">{e.tipoLabel}</span>
                      {e.source === 'incidencia' && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground"> · incidencia</span>
                      )}
                      {' — '}
                      {e.texto}
                      {e.checklist && e.checklist.length > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          · {e.checklist.filter((t) => t.estado === 'ok').length}✓ {e.checklist.filter((t) => t.estado === 'obs').length}⚠
                        </span>
                      )}
                    </span>
                    {isAdmin && lid && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button
                          className="p-1 text-muted-foreground hover:text-foreground"
                          title="Editar entrada"
                          aria-label="Editar entrada"
                          onClick={() => startEditLog(lid)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="p-1 text-muted-foreground hover:text-destructive"
                          title="Eliminar entrada"
                          aria-label="Eliminar entrada"
                          onClick={() => delLog(lid)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Estructura según NFPA 70B (§2.2 placa · §2.4 + Cap. 9 criticidad/condición · historial). Las
          incidencias del equipo aparecen en el timeline automáticamente.
        </span>
      </div>
    </div>
  )
}
