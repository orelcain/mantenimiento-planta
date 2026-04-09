/**
 * LearningAdminMachinePage — Editor de contenido de una maquina
 * Ruta: /aprendizaje/admin/:slug (requiere admin)
 *
 * Permite crear/editar/eliminar procedimientos paso a paso.
 * A futuro: manual, flujos y diagnosticos.
 */
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Edit3, Save, X, ChevronUp, ChevronDown, Loader2,
  ListChecks, BookOpen, GitBranch, AlertTriangle,
} from 'lucide-react'
import { findMachineBySlug } from '@/data/learningMachines'
import {
  listProcedures,
  saveProcedure,
  deleteProcedure,
  generateContentId,
  type Procedure,
  type ProcedureStep,
} from '@/services/learningContent'

type AdminTab = 'procedures' | 'manual' | 'flows' | 'diagnosis'

const TAB_DEFS: { id: AdminTab; label: string; icon: React.ElementType; enabled: boolean }[] = [
  { id: 'procedures', label: 'Procedimientos', icon: ListChecks, enabled: true },
  { id: 'manual', label: 'Manual', icon: BookOpen, enabled: false },
  { id: 'flows', label: 'Flujos', icon: GitBranch, enabled: false },
  { id: 'diagnosis', label: 'Diagnóstico', icon: AlertTriangle, enabled: false },
]

export function LearningAdminMachinePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<AdminTab>('procedures')
  const machine = slug ? findMachineBySlug(slug) : undefined

  if (!machine) {
    return <Navigate to="/aprendizaje/admin" replace />
  }

  const Icon = machine.icon

  return (
    <div className="min-h-full w-full p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <button
        onClick={() => navigate('/aprendizaje/admin')}
        className="flex items-center gap-2 text-sm mb-4 -ml-2 px-2 py-3 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
        style={{ minHeight: '44px' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a máquinas
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div
          className="flex items-center justify-center w-14 h-14 rounded-2xl flex-shrink-0"
          style={{
            background: `${machine.color}18`,
            border: `1px solid ${machine.color}40`,
          }}
        >
          <Icon className="h-7 w-7" style={{ color: machine.color }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{machine.name}</h1>
          <p className="text-sm text-muted-foreground">Editor de contenido · {machine.area}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
        {TAB_DEFS.map(tab => {
          const TabIcon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => tab.enabled && setActiveTab(tab.id)}
              disabled={!tab.enabled}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-primary text-primary'
                  : tab.enabled
                  ? 'border-transparent text-muted-foreground hover:text-foreground'
                  : 'border-transparent text-muted-foreground/40 cursor-not-allowed'
              }`}
            >
              <TabIcon className="h-4 w-4" />
              {tab.label}
              {!tab.enabled && <span className="text-[10px] opacity-60">(próximo)</span>}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'procedures' && <ProceduresEditor machineSlug={machine.slug} />}
      {activeTab !== 'procedures' && (
        <div className="p-8 text-center rounded-xl border border-dashed border-border bg-accent/10">
          <p className="text-sm text-muted-foreground">
            Esta sección estará disponible en la próxima iteración del admin.
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PROCEDURES EDITOR
// ─────────────────────────────────────────────────────────────

function ProceduresEditor({ machineSlug }: { machineSlug: string }) {
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Procedure | null>(null)

  async function load() {
    setLoading(true)
    try {
      const list = await listProcedures(machineSlug)
      setProcedures(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineSlug])

  function handleNew() {
    setEditing({
      id: generateContentId('proc_'),
      title: '',
      description: '',
      steps: [{ order: 1, title: '', description: '' }],
      createdAt: 0,
      updatedAt: 0,
    })
  }

  async function handleSave(procedure: Procedure) {
    await saveProcedure(machineSlug, procedure)
    setEditing(null)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este procedimiento?')) return
    await deleteProcedure(machineSlug, id)
    await load()
  }

  if (editing) {
    return (
      <ProcedureForm
        initial={editing}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {procedures.length === 0
            ? 'Aún no hay procedimientos.'
            : `${procedures.length} procedimiento${procedures.length !== 1 ? 's' : ''}`}
        </p>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          style={{ minHeight: '40px' }}
        >
          <Plus className="h-4 w-4" />
          Nuevo procedimiento
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Cargando...
        </div>
      ) : procedures.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-border bg-accent/10">
          <ListChecks className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm font-medium mb-1">Sin procedimientos aún</p>
          <p className="text-xs text-muted-foreground">
            Crea el primer procedimiento paso a paso para esta máquina.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {procedures.map(proc => (
            <div
              key={proc.id}
              className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">{proc.title}</h3>
                  {proc.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {proc.description}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {proc.steps.length} paso{proc.steps.length !== 1 ? 's' : ''} ·{' '}
                    Actualizado {formatDate(proc.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(proc)}
                    className="p-2 rounded hover:bg-accent transition-colors"
                    title="Editar"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(proc.id)}
                    className="p-2 rounded hover:bg-destructive/20 text-destructive transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PROCEDURE FORM
// ─────────────────────────────────────────────────────────────

function ProcedureForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Procedure
  onSave: (p: Procedure) => void | Promise<void>
  onCancel: () => void
}) {
  const [procedure, setProcedure] = useState<Procedure>(initial)
  const [saving, setSaving] = useState(false)

  function updateStep(index: number, patch: Partial<ProcedureStep>) {
    setProcedure(p => ({
      ...p,
      steps: p.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }))
  }

  function addStep() {
    setProcedure(p => ({
      ...p,
      steps: [...p.steps, { order: p.steps.length + 1, title: '', description: '' }],
    }))
  }

  function removeStep(index: number) {
    setProcedure(p => {
      if (p.steps.length <= 1) return p
      const newSteps = p.steps.filter((_, i) => i !== index)
      return { ...p, steps: newSteps.map((s, i) => ({ ...s, order: i + 1 })) }
    })
  }

  function moveStep(index: number, direction: -1 | 1) {
    setProcedure(p => {
      const newIndex = index + direction
      if (newIndex < 0 || newIndex >= p.steps.length) return p
      const newSteps = [...p.steps]
      const tmp = newSteps[index]!
      newSteps[index] = newSteps[newIndex]!
      newSteps[newIndex] = tmp
      return { ...p, steps: newSteps.map((s, i) => ({ ...s, order: i + 1 })) }
    })
  }

  const canSave =
    procedure.title.trim().length > 0 &&
    procedure.steps.every(s => s.title.trim().length > 0)

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(procedure)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground">
          Título del procedimiento <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={procedure.title}
          onChange={e => setProcedure({ ...procedure, title: e.target.value })}
          placeholder="Ej: Calibración de celdas de carga"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground">
          Descripción breve (opcional)
        </label>
        <textarea
          value={procedure.description || ''}
          onChange={e => setProcedure({ ...procedure, description: e.target.value })}
          placeholder="Qué hace este procedimiento y cuándo se usa"
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pasos <span className="text-destructive">*</span>
          </label>
          <button
            onClick={addStep}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:bg-primary/10 px-2 py-1 rounded"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir paso
          </button>
        </div>

        <div className="space-y-3">
          {procedure.steps.map((step, index) => (
            <div
              key={index}
              className="p-3 rounded-lg border border-border bg-card/50"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-1">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 text-primary font-bold text-xs">
                    {step.order}
                  </span>
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
                      title="Subir"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => moveStep(index, 1)}
                      disabled={index === procedure.steps.length - 1}
                      className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
                      title="Bajar"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={step.title}
                    onChange={e => updateStep(index, { title: e.target.value })}
                    placeholder="Título del paso"
                    className="w-full px-2.5 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <textarea
                    value={step.description}
                    onChange={e => updateStep(index, { description: e.target.value })}
                    placeholder="Descripción detallada del paso"
                    rows={2}
                    className="w-full px-2.5 py-1.5 rounded border border-border bg-background text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
                <button
                  onClick={() => removeStep(index)}
                  disabled={procedure.steps.length <= 1}
                  className="p-1.5 hover:bg-destructive/20 text-destructive rounded disabled:opacity-30"
                  title="Eliminar paso"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSave || saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar procedimiento
        </button>
      </div>
    </div>
  )
}

function formatDate(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
