/**
 * LearningAdminMachinePage — Editor de contenido de una maquina
 * Ruta: /aprendizaje/admin/:slug (requiere admin)
 *
 * Tabs:
 *   - Procedimientos (con upload de imagenes por paso)
 *   - Manual (secciones de texto ordenadas)
 *   - Flujos (trigger + lista de acciones)
 *   - Diagnostico (sintoma -> causas -> solucion)
 */
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Edit3, Save, X, ChevronUp, ChevronDown, Loader2,
  ListChecks, BookOpen, GitBranch, AlertTriangle, ImagePlus, Eye, Image as ImageIcon,
} from 'lucide-react'
import { findMachineBySlug } from '@/data/learningMachines'
import { LC } from '@/data/learningTheme'
import {
  listProcedures,
  saveProcedure,
  deleteProcedure,
  listManualSections,
  saveManualSection,
  deleteManualSection,
  listFlows,
  saveFlow,
  deleteFlow,
  listDiagnosis,
  saveDiagnosis,
  deleteDiagnosis,
  listComponentPhotos,
  saveComponentPhoto,
  deleteComponentPhoto,
  generateContentId,
  uploadLearningImage,
  deleteLearningImage,
  type Procedure,
  type ProcedureStep,
  type ManualSection,
  type SectionQuizItem,
  type Flow,
  type DiagnosisEntry,
  type ComponentPhoto,
  type ComponentHotspotPoint,
} from '@/services/learningContent'
import { logger } from '@/lib/logger'

type AdminTab = 'procedures' | 'manual' | 'flows' | 'diagnosis' | 'components'

const TAB_DEFS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: 'procedures', label: 'Procedimientos', icon: ListChecks },
  { id: 'manual', label: 'Manual', icon: BookOpen },
  { id: 'flows', label: 'Flujos', icon: GitBranch },
  { id: 'diagnosis', label: 'Diagnóstico', icon: AlertTriangle },
  { id: 'components', label: 'Componentes', icon: ImageIcon },
]

function isAdminTab(value: string | null): value is AdminTab {
  return value === 'procedures' || value === 'manual' || value === 'flows' || value === 'diagnosis' || value === 'components'
}

export function LearningAdminMachinePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<AdminTab>(isAdminTab(initialTab) ? initialTab : 'procedures')
  const machine = slug ? findMachineBySlug(slug) : undefined

  if (!machine) {
    return <Navigate to="/aprendizaje/admin" replace />
  }

  const Icon = machine.icon
  const previewPath = machine.customRoute || `/aprendizaje/maquina/${machine.slug}`
  const previewUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}${previewPath}`

  return (
    <div className="min-h-full w-full p-4 sm:p-6 max-w-5xl mx-auto" style={{ color: LC.ink }}>
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
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{machine.name}</h1>
          <p className="text-sm text-muted-foreground">Editor de contenido · {machine.area}</p>
        </div>
        <button
          onClick={() => window.open(previewUrl, '_blank', 'noopener')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-primary-700 dark:text-[#9DC3E6] hover:bg-muted transition-colors flex-shrink-0"
          title="Ver como lo ve el técnico — solo lectura, abre en pestaña nueva"
          style={{ minHeight: '40px' }}
        >
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">Vista previa</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
        {TAB_DEFS.map(tab => {
          const TabIcon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setSearchParams({ tab: tab.id }, { replace: true })
              }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-ring text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-muted-foreground/80 hover:text-foreground'
              }`}
            >
              <TabIcon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'procedures' && <ProceduresEditor machineSlug={machine.slug} />}
      {activeTab === 'manual' && <ManualEditor machineSlug={machine.slug} />}
      {activeTab === 'flows' && <FlowsEditor machineSlug={machine.slug} />}
      {activeTab === 'diagnosis' && <DiagnosisEditor machineSlug={machine.slug} />}
      {activeTab === 'components' && <ComponentsEditor machineSlug={machine.slug} />}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// PROCEDURES EDITOR
// ═════════════════════════════════════════════════════════════

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
        machineSlug={machineSlug}
        initial={editing}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <CollectionListView
      emptyIcon={ListChecks}
      emptyTitle="Sin procedimientos aún"
      emptyHint="Crea el primer procedimiento paso a paso para esta máquina."
      newLabel="Nuevo procedimiento"
      loading={loading}
      count={procedures.length}
      onNew={handleNew}
      singular="procedimiento"
      plural="procedimientos"
    >
      {procedures.map(proc => (
        <ItemCard
          key={proc.id}
          title={proc.title}
          subtitle={proc.description || undefined}
          meta={`${proc.steps.length} paso${proc.steps.length !== 1 ? 's' : ''} · Actualizado ${formatDate(proc.updatedAt)}`}
          onEdit={() => setEditing(proc)}
          onDelete={() => handleDelete(proc.id)}
        />
      ))}
    </CollectionListView>
  )
}

function ProcedureForm({
  machineSlug,
  initial,
  onSave,
  onCancel,
}: {
  machineSlug: string
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
      <FormField label="Título del procedimiento" required>
        <input
          type="text"
          value={procedure.title}
          onChange={e => setProcedure({ ...procedure, title: e.target.value })}
          placeholder="Ej: Calibración de celdas de carga"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
      </FormField>

      <FormField label="Descripción breve (opcional)">
        <textarea
          value={procedure.description || ''}
          onChange={e => setProcedure({ ...procedure, description: e.target.value })}
          placeholder="Qué hace este procedimiento y cuándo se usa"
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
      </FormField>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pasos <span className="text-destructive dark:text-[#e0697d]">*</span>
          </label>
          <button
            onClick={addStep}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-400/10 px-2 py-1 rounded"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir paso
          </button>
        </div>

        <div className="space-y-3">
          {procedure.steps.map((step, index) => (
            <div key={index} className="p-3 rounded-lg border border-border bg-card/50">
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-1">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary-400/15 text-primary-600 dark:text-primary-400 font-bold text-xs">
                    {step.order}
                  </span>
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                      title="Subir"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => moveStep(index, 1)}
                      disabled={index === procedure.steps.length - 1}
                      className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
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
                    className="w-full px-2.5 py-1.5 rounded border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ring/60"
                  />
                  <textarea
                    value={step.description}
                    onChange={e => updateStep(index, { description: e.target.value })}
                    placeholder="Descripción detallada del paso"
                    rows={2}
                    className="w-full px-2.5 py-1.5 rounded border border-border bg-card text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring/60"
                  />
                  <StepImageUploader
                    machineSlug={machineSlug}
                    procedureId={procedure.id}
                    imageUrl={step.imageUrl || null}
                    onChange={url => updateStep(index, { imageUrl: url })}
                  />
                </div>
                <button
                  onClick={() => removeStep(index)}
                  disabled={procedure.steps.length <= 1}
                  className="p-1.5 hover:bg-destructive/15 text-destructive dark:text-[#e0697d] rounded disabled:opacity-30"
                  title="Eliminar paso"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <FormActions saving={saving} canSave={canSave} onCancel={onCancel} onSave={handleSubmit} />
    </div>
  )
}

/** Uploader de imagen para un paso — usa Firebase Storage */
function StepImageUploader({
  machineSlug,
  procedureId,
  imageUrl,
  onChange,
}: {
  machineSlug: string
  procedureId: string
  imageUrl: string | null
  onChange: (url: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const url = await uploadLearningImage(machineSlug, 'procedures', procedureId, file)
      // Si habia una imagen previa, borrarla del storage
      if (imageUrl) {
        await deleteLearningImage(imageUrl)
      }
      onChange(url)
    } catch (e) {
      logger.error('Error al subir imagen', e instanceof Error ? e : new Error(String(e)))
      setError('Error al subir imagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    if (!imageUrl) return
    if (!confirm('¿Eliminar imagen de este paso?')) return
    const previous = imageUrl
    onChange(null)
    await deleteLearningImage(previous)
  }

  return (
    <div className="mt-1">
      {imageUrl ? (
        <div className="relative inline-block">
          <img
            src={imageUrl}
            alt="Imagen del paso"
            className="max-h-32 rounded border border-border"
          />
          <button
            onClick={handleRemove}
            className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full text-white hover:opacity-90"
            style={{ background: '#e0697d' }}
            title="Eliminar imagen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-400/10 px-2 py-1 rounded disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Subiendo…
            </>
          ) : (
            <>
              <ImagePlus className="h-3.5 w-3.5" />
              Añadir imagen
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
      {error && <p className="text-[11px] text-destructive dark:text-[#e0697d] mt-1">{error}</p>}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// MANUAL EDITOR
// ═════════════════════════════════════════════════════════════

function ManualEditor({ machineSlug }: { machineSlug: string }) {
  const [sections, setSections] = useState<ManualSection[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ManualSection | null>(null)

  async function load() {
    setLoading(true)
    try {
      const list = await listManualSections(machineSlug)
      setSections(list)
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
      id: generateContentId('sec_'),
      title: '',
      content: '',
      order: sections.length + 1,
      createdAt: 0,
      updatedAt: 0,
    })
  }

  async function handleSave(section: ManualSection) {
    await saveManualSection(machineSlug, section)
    setEditing(null)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta sección del manual?')) return
    await deleteManualSection(machineSlug, id)
    await load()
  }

  if (editing) {
    return (
      <ManualSectionForm
        initial={editing}
        machineSlug={machineSlug}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <CollectionListView
      emptyIcon={BookOpen}
      emptyTitle="Sin secciones de manual"
      emptyHint="Crea la primera sección con texto explicativo (ajustes, medidas, notas)."
      newLabel="Nueva sección"
      loading={loading}
      count={sections.length}
      onNew={handleNew}
      singular="sección"
      plural="secciones"
    >
      {sections.map(sec => (
        <ItemCard
          key={sec.id}
          title={`${sec.order}. ${sec.title}`}
          subtitle={sec.content.slice(0, 140) + (sec.content.length > 140 ? '…' : '')}
          meta={`Actualizado ${formatDate(sec.updatedAt)}`}
          onEdit={() => setEditing(sec)}
          onDelete={() => handleDelete(sec.id)}
        />
      ))}
    </CollectionListView>
  )
}

function ManualSectionForm({
  initial,
  machineSlug,
  onSave,
  onCancel,
}: {
  initial: ManualSection
  machineSlug: string
  onSave: (s: ManualSection) => void | Promise<void>
  onCancel: () => void
}) {
  const [section, setSection] = useState<ManualSection>(initial)
  const [manualFields, setManualFields] = useState<ManualFields>(() => parseManualFields(initial.content))
  const [saving, setSaving] = useState(false)
  const canSave = section.title.trim().length > 0 && hasManualFieldsContent(manualFields)

  function updateArrayField(
    key: 'measurements' | 'keyPoints' | 'notes',
    index: number,
    value: string,
  ) {
    setManualFields(fields => ({
      ...fields,
      [key]: fields[key].map((item, i) => (i === index ? value : item)),
    }))
  }

  function addArrayField(key: 'measurements' | 'keyPoints' | 'notes') {
    setManualFields(fields => ({ ...fields, [key]: [...fields[key], ''] }))
  }

  function removeArrayField(key: 'measurements' | 'keyPoints' | 'notes', index: number) {
    setManualFields(fields => {
      const next = fields[key].filter((_, i) => i !== index)
      return { ...fields, [key]: next.length > 0 ? next : [''] }
    })
  }

  function updateImage(index: number, patch: Partial<ManualImageField>) {
    setManualFields(fields => ({
      ...fields,
      images: fields.images.map((image, i) => (i === index ? { ...image, ...patch } : image)),
    }))
  }

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({ ...section, content: buildManualContent(manualFields) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <FormField label="Orden" className="w-24 flex-shrink-0">
          <input
            type="number"
            min={1}
            value={section.order}
            onChange={e => setSection({ ...section, order: Number(e.target.value) || 1 })}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
        </FormField>
        <FormField label="Título de la sección" required className="flex-1">
          <input
            type="text"
            value={section.title}
            onChange={e => setSection({ ...section, title: e.target.value })}
            placeholder="Ej: Ajuste de cuchillas"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
        </FormField>
      </div>

      <FormField label="Descripcion" required>
        <textarea
          value={manualFields.description}
          onChange={e => setManualFields(fields => ({ ...fields, description: e.target.value }))}
          placeholder="Texto del manual. Soporta saltos de línea."
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
      </FormField>

      <EditableTextList
        label="Medidas / tolerancias"
        addLabel="Anadir medida"
        items={manualFields.measurements}
        placeholder="Ej: Distancia entre ventrales y dorsales: 12 mm"
        onAdd={() => addArrayField('measurements')}
        onChange={(index, value) => updateArrayField('measurements', index, value)}
        onRemove={index => removeArrayField('measurements', index)}
      />

      <EditableTextList
        label="Puntos clave"
        addLabel="Anadir punto"
        items={manualFields.keyPoints}
        placeholder="Ej: Verificar con silleta en posicion de reposo."
        onAdd={() => addArrayField('keyPoints')}
        onChange={(index, value) => updateArrayField('keyPoints', index, value)}
        onRemove={index => removeArrayField('keyPoints', index)}
      />

      <EditableTextList
        label="Notas operativas"
        addLabel="Anadir nota"
        items={manualFields.notes}
        placeholder="Ej: Con materia prima bajo 0C se requiere mayor presion."
        onAdd={() => addArrayField('notes')}
        onChange={(index, value) => updateArrayField('notes', index, value)}
        onRemove={index => removeArrayField('notes', index)}
      />

      <ManualImagesEditor
        images={manualFields.images}
        machineSlug={machineSlug}
        sectionId={section.id}
        onAdd={() => setManualFields(fields => ({ ...fields, images: [...fields.images, { label: '', url: '' }] }))}
        onChange={updateImage}
        onRemove={index => setManualFields(fields => ({ ...fields, images: fields.images.filter((_, i) => i !== index) }))}
      />

      {/* ─ Bloque didáctico (Dossier de campo): Objetivo · Por qué importa · Autoevaluación ─ */}
      <div className="pt-3 mt-1 border-t border-dashed border-border space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          Didáctico · se muestra como Objetivo (arriba), Por qué importa y Autoevaluación al pie
        </p>

        <FormField label="Objetivo de aprendizaje">
          <textarea
            value={section.objetivo ?? ''}
            onChange={e => setSection({ ...section, objetivo: e.target.value })}
            placeholder="Qué sabrá hacer quien lea la sección. Ej: Al terminar vas a poder calibrar un pocket con la fórmula fsWc."
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
        </FormField>

        <FormField label="El porqué (por qué importa, no solo el qué)">
          <textarea
            value={section.porque ?? ''}
            onChange={e => setSection({ ...section, porque: e.target.value })}
            placeholder="Ej: un pocket descalibrado manda pescado al calibre equivocado todo el turno y arruina la contrastación."
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
        </FormField>

        <SectionQuizEditor quiz={section.quiz ?? []} onChange={quiz => setSection({ ...section, quiz })} />
      </div>

      <FormActions saving={saving} canSave={canSave} onCancel={onCancel} onSave={handleSubmit} />
    </div>
  )
}

/**
 * SectionQuizEditor — edita la autoevaluación de una sección de manual: lista de
 * preguntas, cada una con su texto, opciones (2+), la marca de opción correcta y
 * la explicación. Se guarda como `section.quiz` (SectionQuizItem[]).
 */
function SectionQuizEditor({ quiz, onChange }: { quiz: SectionQuizItem[]; onChange: (quiz: SectionQuizItem[]) => void }) {
  const items = quiz

  function updateItem(i: number, patch: Partial<SectionQuizItem>) {
    onChange(items.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  }
  function addQuestion() {
    onChange([...items, { question: '', options: ['', ''], correctIndex: 0, explanation: '' }])
  }
  function removeQuestion(i: number) {
    onChange(items.filter((_, idx) => idx !== i))
  }
  function updateOption(qi: number, oi: number, value: string) {
    const q = items[qi]
    if (!q) return
    updateItem(qi, { options: q.options.map((o, idx) => (idx === oi ? value : o)) })
  }
  function addOption(qi: number) {
    const q = items[qi]
    if (!q) return
    updateItem(qi, { options: [...q.options, ''] })
  }
  function removeOption(qi: number, oi: number) {
    const q = items[qi]
    if (!q) return
    const options = q.options.filter((_, idx) => idx !== oi)
    const safe = options.length > 0 ? options : ['']
    const correctIndex = oi < q.correctIndex ? q.correctIndex - 1 : Math.min(q.correctIndex, safe.length - 1)
    updateItem(qi, { options: safe, correctIndex: Math.max(0, correctIndex) })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Autoevaluación</label>
        <button
          onClick={addQuestion}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-400/10 px-2 py-1 rounded"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir pregunta
        </button>
      </div>

      {items.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground/80">Sin preguntas. La sección no mostrará autoevaluación.</p>
      ) : (
        <div className="space-y-4">
          {items.map((q, qi) => (
            <div key={qi} className="space-y-2.5 rounded-lg border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-400/15 text-[11px] font-bold text-primary-600 dark:text-primary-400">
                  {qi + 1}
                </span>
                <textarea
                  value={q.question}
                  onChange={e => updateItem(qi, { question: e.target.value })}
                  placeholder="Pregunta"
                  rows={2}
                  className="flex-1 resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
                />
                <button
                  onClick={() => removeQuestion(qi)}
                  className="mt-0.5 flex-shrink-0 rounded p-1.5 text-destructive dark:text-[#e0697d] hover:bg-destructive/15"
                  title="Eliminar pregunta"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 pl-8">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Opciones · marcá la correcta</p>
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <button
                      onClick={() => updateItem(qi, { correctIndex: oi })}
                      title={oi === q.correctIndex ? 'Opción correcta' : 'Marcar como correcta'}
                      className={oi === q.correctIndex
                        ? 'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold'
                        : 'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold text-muted-foreground'}
                      style={oi === q.correctIndex
                        ? { background: LC.nuevo, borderColor: LC.nuevo, color: '#0d1722' }
                        : undefined}
                    >
                      {oi === q.correctIndex ? '✓' : String.fromCharCode(65 + oi)}
                    </button>
                    <input
                      type="text"
                      value={opt}
                      onChange={e => updateOption(qi, oi, e.target.value)}
                      placeholder={`Opción ${String.fromCharCode(65 + oi)}`}
                      className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
                    />
                    <button
                      onClick={() => removeOption(qi, oi)}
                      disabled={q.options.length <= 2}
                      className="flex-shrink-0 rounded p-1 text-destructive dark:text-[#e0697d] hover:bg-destructive/15 disabled:opacity-30"
                      title="Eliminar opción"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addOption(qi)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-400/10"
                >
                  <Plus className="h-3 w-3" /> Añadir opción
                </button>

                <textarea
                  value={q.explanation}
                  onChange={e => updateItem(qi, { explanation: e.target.value })}
                  placeholder="Explicación (se muestra al responder)"
                  rows={2}
                  className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// FLOWS EDITOR
// ═════════════════════════════════════════════════════════════

interface ManualImageField {
  label: string
  url: string
}

interface ManualFields {
  description: string
  measurements: string[]
  keyPoints: string[]
  notes: string[]
  images: ManualImageField[]
}

function parseManualFields(content: string): ManualFields {
  const fields: ManualFields = {
    description: '',
    measurements: [''],
    keyPoints: [''],
    notes: [''],
    images: [],
  }
  let current: 'description' | 'measurements' | 'keyPoints' | 'notes' | 'images' = 'description'
  const description: string[] = []
  const measurements: string[] = []
  const keyPoints: string[] = []
  const notes: string[] = []

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line === 'Medidas / tolerancias:') { current = 'measurements'; continue }
    if (line === 'Puntos clave:') { current = 'keyPoints'; continue }
    if (line === 'Notas operativas:') { current = 'notes'; continue }
    if (line === 'Referencias visuales:') { current = 'images'; continue }

    const value = line.startsWith('- ') ? line.slice(2) : line
    if (current === 'description') {
      description.push(value)
    } else if (current === 'measurements') {
      measurements.push(value)
    } else if (current === 'keyPoints') {
      keyPoints.push(value)
    } else if (current === 'notes') {
      notes.push(value)
    } else {
      const match = value.match(/^(.*?):\s*(https?:\/\/\S+|\/\S+)$/)
      fields.images.push(match ? { label: match[1] || 'Imagen', url: match[2] ?? '' } : { label: value, url: '' })
    }
  }

  fields.description = description.join('\n')
  fields.measurements = measurements.length > 0 ? measurements : ['']
  fields.keyPoints = keyPoints.length > 0 ? keyPoints : ['']
  fields.notes = notes.length > 0 ? notes : ['']
  return fields
}

function buildManualContent(fields: ManualFields): string {
  return [
    fields.description.trim(),
    ...buildListBlock('Medidas / tolerancias:', fields.measurements),
    ...buildListBlock('Puntos clave:', fields.keyPoints),
    ...buildListBlock('Notas operativas:', fields.notes),
    ...buildImageBlock(fields.images),
  ].filter(Boolean).join('\n\n')
}

function buildListBlock(title: string, items: string[]): string[] {
  const clean = items.map(item => item.trim()).filter(Boolean)
  return clean.length > 0 ? [title, ...clean.map(item => `- ${item}`)] : []
}

function buildImageBlock(images: ManualImageField[]): string[] {
  const clean = images.filter(image => image.label.trim().length > 0 || image.url.trim().length > 0)
  return clean.length > 0
    ? ['Referencias visuales:', ...clean.map(image => `- ${image.label.trim() || 'Imagen'}: ${image.url.trim()}`)]
    : []
}

function hasManualFieldsContent(fields: ManualFields): boolean {
  return fields.description.trim().length > 0 ||
    fields.measurements.some(item => item.trim().length > 0) ||
    fields.keyPoints.some(item => item.trim().length > 0) ||
    fields.notes.some(item => item.trim().length > 0) ||
    fields.images.some(image => image.label.trim().length > 0 || image.url.trim().length > 0)
}

function EditableTextList({
  label,
  addLabel,
  items,
  placeholder,
  onAdd,
  onChange,
  onRemove,
}: {
  label: string
  addLabel: string
  items: string[]
  placeholder: string
  onAdd: () => void
  onChange: (index: number, value: string) => void
  onRemove: (index: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-400/10 px-2 py-1 rounded"
        >
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className="flex items-center justify-center w-6 h-6 mt-2 rounded-full bg-primary-400/15 text-primary-600 dark:text-primary-400 font-bold text-[11px]">
              {index + 1}
            </span>
            <textarea
              value={item}
              onChange={e => onChange(index, e.target.value)}
              placeholder={placeholder}
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring/60"
            />
            <button
              onClick={() => onRemove(index)}
              className="p-1.5 mt-1 hover:bg-destructive/15 text-destructive dark:text-[#e0697d] rounded"
              title="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ManualImagesEditor({
  images,
  machineSlug,
  sectionId,
  onAdd,
  onChange,
  onRemove,
}: {
  images: ManualImageField[]
  machineSlug: string
  sectionId: string
  onAdd: () => void
  onChange: (index: number, patch: Partial<ManualImageField>) => void
  onRemove: (index: number) => void
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(index: number, file: File) {
    setUploadingIndex(index)
    setError(null)
    try {
      const previous = images[index]?.url
      const url = await uploadLearningImage(machineSlug, 'manual', sectionId, file)
      onChange(index, { url })
      if (previous) await deleteLearningImage(previous)
    } catch (e) {
      logger.error('Error al subir referencia visual', e instanceof Error ? e : new Error(String(e)))
      setError('No se pudo subir la imagen. Intenta nuevamente.')
    } finally {
      setUploadingIndex(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Referencias visuales</label>
          <p className="mt-1 text-xs text-muted-foreground/80">
            Agrega una o varias imagenes. Puedes subir archivo o pegar una URL existente.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-400/10 px-2 py-1 rounded"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar referencia
        </button>
      </div>
      {error && (
        <p className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive/80 dark:text-[#f1a3ae]">
          {error}
        </p>
      )}
      {images.length === 0 ? (
        <p className="text-xs text-muted-foreground/80 rounded-lg border border-dashed border-border px-3 py-3">
          Sin imagenes asociadas.
        </p>
      ) : (
        <div className="space-y-3">
          {images.map((image, index) => (
            <div key={index} className="grid gap-3 p-3 rounded-lg border border-border bg-card/50 lg:grid-cols-[132px_1fr_auto]">
              <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                {image.url ? (
                  <img src={image.url} alt={image.label || 'Referencia visual'} className="h-full w-full object-contain" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground/80" />
                )}
              </div>
              <div className="grid gap-2">
                <input
                  type="text"
                  value={image.label}
                  onChange={e => onChange(index, { label: e.target.value })}
                  placeholder="Etiqueta visible"
                  className="px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
                />
                <input
                  type="text"
                  value={image.url}
                  onChange={e => onChange(index, { url: e.target.value })}
                  placeholder="URL de imagen o ruta publica"
                  className="px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
                />
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-400/10">
                    <ImagePlus className="h-3.5 w-3.5" />
                    {uploadingIndex === index ? 'Subiendo...' : 'Subir imagen'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingIndex !== null}
                      onChange={event => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) void handleUpload(index, file)
                      }}
                    />
                  </label>
                  {image.url && (
                    <a
                      href={image.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Probar enlace
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="p-2 hover:bg-destructive/15 text-destructive dark:text-[#e0697d] rounded justify-self-start"
                title="Eliminar imagen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FlowsEditor({ machineSlug }: { machineSlug: string }) {
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Flow | null>(null)

  async function load() {
    setLoading(true)
    try {
      setFlows(await listFlows(machineSlug))
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
      id: generateContentId('flow_'),
      title: '',
      trigger: '',
      actions: [''],
      createdAt: 0,
      updatedAt: 0,
    })
  }

  async function handleSave(flow: Flow) {
    // Filtrar acciones vacias antes de guardar
    const clean = { ...flow, actions: flow.actions.filter(a => a.trim().length > 0) }
    await saveFlow(machineSlug, clean)
    setEditing(null)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este flujo?')) return
    await deleteFlow(machineSlug, id)
    await load()
  }

  if (editing) {
    return (
      <FlowForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
    )
  }

  return (
    <CollectionListView
      emptyIcon={GitBranch}
      emptyTitle="Sin flujos aún"
      emptyHint="Crea flujos tipo '¿Qué hago cuando…?' con trigger + acciones."
      newLabel="Nuevo flujo"
      loading={loading}
      count={flows.length}
      onNew={handleNew}
      singular="flujo"
      plural="flujos"
    >
      {flows.map(flow => (
        <ItemCard
          key={flow.id}
          title={flow.title}
          subtitle={flow.trigger}
          meta={`${flow.actions.length} acción${flow.actions.length !== 1 ? 'es' : ''} · Actualizado ${formatDate(flow.updatedAt)}`}
          onEdit={() => setEditing(flow)}
          onDelete={() => handleDelete(flow.id)}
        />
      ))}
    </CollectionListView>
  )
}

function FlowForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Flow
  onSave: (f: Flow) => void | Promise<void>
  onCancel: () => void
}) {
  const [flow, setFlow] = useState<Flow>(initial)
  const [saving, setSaving] = useState(false)

  function updateAction(index: number, value: string) {
    setFlow(f => ({ ...f, actions: f.actions.map((a, i) => (i === index ? value : a)) }))
  }

  function addAction() {
    setFlow(f => ({ ...f, actions: [...f.actions, ''] }))
  }

  function removeAction(index: number) {
    setFlow(f => {
      if (f.actions.length <= 1) return f
      return { ...f, actions: f.actions.filter((_, i) => i !== index) }
    })
  }

  function moveAction(index: number, direction: -1 | 1) {
    setFlow(f => {
      const newIndex = index + direction
      if (newIndex < 0 || newIndex >= f.actions.length) return f
      const next = [...f.actions]
      const tmp = next[index]!
      next[index] = next[newIndex]!
      next[newIndex] = tmp
      return { ...f, actions: next }
    })
  }

  const canSave =
    flow.title.trim().length > 0 &&
    flow.trigger.trim().length > 0 &&
    flow.actions.some(a => a.trim().length > 0)

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(flow)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <FormField label="Título del flujo" required>
        <input
          type="text"
          value={flow.title}
          onChange={e => setFlow({ ...flow, title: e.target.value })}
          placeholder="Ej: ¿Qué hago cuando el motor se detiene?"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
      </FormField>

      <FormField label="Trigger / Situación" required>
        <textarea
          value={flow.trigger}
          onChange={e => setFlow({ ...flow, trigger: e.target.value })}
          placeholder="Condición que dispara este flujo (ej: alarma de sobretemperatura)"
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
      </FormField>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Acciones a seguir <span className="text-destructive dark:text-[#e0697d]">*</span>
          </label>
          <button
            onClick={addAction}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-400/10 px-2 py-1 rounded"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir acción
          </button>
        </div>

        <div className="space-y-2">
          {flow.actions.map((action, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex flex-col items-center pt-1.5">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-400/15 text-primary-600 dark:text-primary-400 font-bold text-[11px]">
                  {index + 1}
                </span>
                <div className="flex flex-col">
                  <button
                    onClick={() => moveAction(index, -1)}
                    disabled={index === 0}
                    className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => moveAction(index, 1)}
                    disabled={index === flow.actions.length - 1}
                    className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <textarea
                value={action}
                onChange={e => updateAction(index, e.target.value)}
                placeholder="Describir acción"
                rows={2}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/60"
              />
              <button
                onClick={() => removeAction(index)}
                disabled={flow.actions.length <= 1}
                className="p-1.5 hover:bg-destructive/15 text-destructive dark:text-[#e0697d] rounded disabled:opacity-30"
                title="Eliminar acción"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <FormActions saving={saving} canSave={canSave} onCancel={onCancel} onSave={handleSubmit} />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// DIAGNOSIS EDITOR
// ═════════════════════════════════════════════════════════════

function DiagnosisEditor({ machineSlug }: { machineSlug: string }) {
  const [entries, setEntries] = useState<DiagnosisEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<DiagnosisEntry | null>(null)

  async function load() {
    setLoading(true)
    try {
      setEntries(await listDiagnosis(machineSlug))
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
      id: generateContentId('diag_'),
      title: '',
      symptom: '',
      possibleCauses: [''],
      solution: '',
      createdAt: 0,
      updatedAt: 0,
    })
  }

  async function handleSave(entry: DiagnosisEntry) {
    const clean = { ...entry, possibleCauses: entry.possibleCauses.filter(c => c.trim().length > 0) }
    await saveDiagnosis(machineSlug, clean)
    setEditing(null)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este diagnóstico?')) return
    await deleteDiagnosis(machineSlug, id)
    await load()
  }

  if (editing) {
    return (
      <DiagnosisForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
    )
  }

  return (
    <CollectionListView
      emptyIcon={AlertTriangle}
      emptyTitle="Sin diagnósticos aún"
      emptyHint="Crea entradas tipo Síntoma → Causas posibles → Solución."
      newLabel="Nuevo diagnóstico"
      loading={loading}
      count={entries.length}
      onNew={handleNew}
      singular="diagnóstico"
      plural="diagnósticos"
    >
      {entries.map(entry => (
        <ItemCard
          key={entry.id}
          title={entry.title || entry.symptom}
          subtitle={entry.symptom || entry.possibleCauses.slice(0, 2).join(' · ')}
          meta={`${entry.possibleCauses.length} causa${entry.possibleCauses.length !== 1 ? 's' : ''} · Actualizado ${formatDate(entry.updatedAt)}`}
          onEdit={() => setEditing(entry)}
          onDelete={() => handleDelete(entry.id)}
        />
      ))}
    </CollectionListView>
  )
}

function DiagnosisForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: DiagnosisEntry
  onSave: (e: DiagnosisEntry) => void | Promise<void>
  onCancel: () => void
}) {
  const [entry, setEntry] = useState<DiagnosisEntry>(initial)
  const [saving, setSaving] = useState(false)

  function updateCause(index: number, value: string) {
    setEntry(e => ({
      ...e,
      possibleCauses: e.possibleCauses.map((c, i) => (i === index ? value : c)),
    }))
  }

  function addCause() {
    setEntry(e => ({ ...e, possibleCauses: [...e.possibleCauses, ''] }))
  }

  function removeCause(index: number) {
    setEntry(e => {
      if (e.possibleCauses.length <= 1) return e
      return { ...e, possibleCauses: e.possibleCauses.filter((_, i) => i !== index) }
    })
  }

  const canSave =
    entry.title.trim().length > 0 &&
    entry.symptom.trim().length > 0 &&
    entry.solution.trim().length > 0 &&
    entry.possibleCauses.some(c => c.trim().length > 0)

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(entry)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <FormField label="Título" required>
        <input
          type="text"
          value={entry.title}
          onChange={e => setEntry({ ...entry, title: e.target.value })}
          placeholder="Ej: Mal corte / apertura de vientre deficiente"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
      </FormField>

      <FormField label="Síntoma" required>
        <textarea
          value={entry.symptom}
          onChange={e => setEntry({ ...entry, symptom: e.target.value })}
          placeholder="Ej: El pescado sale con el corte de vientre irregular o incompleto"
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
      </FormField>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Causas posibles <span className="text-destructive dark:text-[#e0697d]">*</span>
          </label>
          <button
            onClick={addCause}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-400/10 px-2 py-1 rounded"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir causa
          </button>
        </div>

        <div className="space-y-2">
          {entry.possibleCauses.map((cause, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="flex items-center justify-center w-6 h-6 mt-2 rounded-full bg-orange-500/15 text-orange-500 font-bold text-[11px]">
                {index + 1}
              </span>
              <input
                type="text"
                value={cause}
                onChange={e => updateCause(index, e.target.value)}
                placeholder="Causa probable"
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
              />
              <button
                onClick={() => removeCause(index)}
                disabled={entry.possibleCauses.length <= 1}
                className="p-1.5 hover:bg-destructive/15 text-destructive dark:text-[#e0697d] rounded disabled:opacity-30"
                title="Eliminar causa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <FormField label="Solución" required>
        <textarea
          value={entry.solution}
          onChange={e => setEntry({ ...entry, solution: e.target.value })}
          placeholder="Procedimiento de corrección recomendado"
          rows={4}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
      </FormField>

      <FormActions saving={saving} canSave={canSave} onCancel={onCancel} onSave={handleSubmit} />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// COMPONENTES DEL EQUIPO (fotos reales + hotspots)
// ═════════════════════════════════════════════════════════════

function ComponentsEditor({ machineSlug }: { machineSlug: string }) {
  const [photos, setPhotos] = useState<ComponentPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ComponentPhoto | null>(null)

  async function load() {
    setLoading(true)
    try {
      setPhotos(await listComponentPhotos(machineSlug))
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
      id: generateContentId('comp_'),
      file: '',
      title: '',
      aspectRatio: 4 / 3,
      order: photos.length + 1,
      points: [],
      createdAt: 0,
      updatedAt: 0,
    })
  }

  async function handleSave(photo: ComponentPhoto) {
    await saveComponentPhoto(machineSlug, photo)
    setEditing(null)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta foto y sus puntos?')) return
    await deleteComponentPhoto(machineSlug, id)
    await load()
  }

  if (editing) {
    return (
      <ComponentPhotoForm
        machineSlug={machineSlug}
        initial={editing}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    )
  }

  const sorted = [...photos].sort((a, b) => a.order - b.order)

  return (
    <CollectionListView
      emptyIcon={ImageIcon}
      emptyTitle="Sin fotos aún"
      emptyHint="Agrega la primera foto real de la máquina con sus puntos numerados."
      newLabel="Nueva foto"
      loading={loading}
      count={photos.length}
      onNew={handleNew}
      singular="foto"
      plural="fotos"
    >
      {sorted.map(photo => (
        <ItemCard
          key={photo.id}
          title={`${photo.order}. ${photo.title}`}
          subtitle={`${photo.file || '(sin archivo)'} · ${photo.points.length} punto${photo.points.length !== 1 ? 's' : ''}`}
          meta={`Actualizado ${formatDate(photo.updatedAt)}`}
          onEdit={() => setEditing(photo)}
          onDelete={() => handleDelete(photo.id)}
        />
      ))}
    </CollectionListView>
  )
}

function ComponentPhotoForm({
  machineSlug,
  initial,
  onSave,
  onCancel,
}: {
  machineSlug: string
  initial: ComponentPhoto
  onSave: (p: ComponentPhoto) => void | Promise<void>
  onCancel: () => void
}) {
  const [photo, setPhoto] = useState<ComponentPhoto>(initial)
  const [saving, setSaving] = useState(false)
  const [imgError, setImgError] = useState(false)

  function updatePoint(id: string, patch: Partial<ComponentHotspotPoint>) {
    setPhoto(p => ({ ...p, points: p.points.map(pt => (pt.id === id ? { ...pt, ...patch } : pt)) }))
  }

  function removePoint(id: string) {
    setPhoto(p => ({ ...p, points: p.points.filter(pt => pt.id !== id) }))
  }

  function addPoint(x: number, y: number) {
    const id = generateContentId('pt_')
    setPhoto(p => ({
      ...p,
      points: [...p.points, { id, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, label: 'Nuevo punto', description: '' }],
    }))
  }

  const previewUrl = photo.file.trim()
    ? `${import.meta.env.BASE_URL}learning-assets/${machineSlug}/${photo.file.trim()}`
    : ''

  const canSave = photo.title.trim().length > 0 && photo.file.trim().length > 0

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(photo)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <FormField label="Orden" className="w-24 flex-shrink-0">
          <input
            type="number"
            min={1}
            value={photo.order}
            onChange={e => setPhoto({ ...photo, order: Number(e.target.value) || 1 })}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
        </FormField>
        <FormField label="Título" required className="flex-1">
          <input
            type="text"
            value={photo.title}
            onChange={e => setPhoto({ ...photo, title: e.target.value })}
            placeholder="Ej: Fotocélula — receptor"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
        </FormField>
      </div>

      <FormField label={`Archivo (en public/learning-assets/${machineSlug}/)`} required>
        <input
          type="text"
          value={photo.file}
          onChange={e => { setPhoto({ ...photo, file: e.target.value }); setImgError(false) }}
          placeholder="grader-foto-ejemplo.jpg"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
        <p className="mt-1 text-xs text-muted-foreground/80">
          El archivo debe subirse manualmente a esa carpeta del repo (esta pantalla aún no sube fotos).
        </p>
      </FormField>

      {previewUrl && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Puntos — clic en la foto para agregar uno, arrastra para moverlo
            </label>
            <span className="text-xs text-muted-foreground/80 font-mono">
              {photo.points.length} punto{photo.points.length !== 1 ? 's' : ''}
            </span>
          </div>
          {imgError ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground/80">
              No se encontró la foto en esa ruta. Verifica el nombre del archivo.
            </p>
          ) : (
            <PointEditorImage
              src={previewUrl}
              points={photo.points}
              onAddPoint={addPoint}
              onMovePoint={(id, x, y) => updatePoint(id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })}
              onImageLoad={(w, h) => setPhoto(p => ({ ...p, aspectRatio: w / h }))}
              onImageError={() => setImgError(true)}
            />
          )}

          {photo.points.length > 0 && (
            <div className="mt-3 space-y-2">
              {photo.points.map((pt, i) => (
                <div key={pt.id} className="p-3 rounded-lg border border-border bg-card/50">
                  <div className="flex items-start gap-2">
                    <span className="flex items-center justify-center w-6 h-6 mt-1 rounded-full bg-primary-400/15 text-primary-600 dark:text-primary-400 font-bold text-[11px] flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 space-y-2 min-w-0">
                      <input
                        type="text"
                        value={pt.label}
                        onChange={e => updatePoint(pt.id, { label: e.target.value })}
                        placeholder="Nombre del punto"
                        className="w-full px-2.5 py-1.5 rounded border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ring/60"
                      />
                      <textarea
                        value={pt.description}
                        onChange={e => updatePoint(pt.id, { description: e.target.value })}
                        placeholder="Nota que se muestra al tocar el punto"
                        rows={2}
                        className="w-full px-2.5 py-1.5 rounded border border-border bg-card text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring/60"
                      />
                    </div>
                    <button
                      onClick={() => removePoint(pt.id)}
                      className="p-1.5 hover:bg-destructive/15 text-destructive dark:text-[#e0697d] rounded flex-shrink-0"
                      title="Eliminar punto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <FormActions saving={saving} canSave={canSave} onCancel={onCancel} onSave={handleSubmit} />
    </div>
  )
}

/**
 * PointEditorImage — clic sobre la foto agrega un punto en esa posicion (%);
 * arrastrar un punto existente lo reposiciona. Coordenadas 0-100 relativas al
 * elemento (no a la foto original), por eso `onImageLoad` reporta el
 * ancho/alto real para guardar `aspectRatio` — igual que ve el técnico.
 */
function PointEditorImage({
  src,
  points,
  onAddPoint,
  onMovePoint,
  onImageLoad,
  onImageError,
}: {
  src: string
  points: ComponentHotspotPoint[]
  onAddPoint: (x: number, y: number) => void
  onMovePoint: (id: string, x: number, y: number) => void
  onImageLoad: (naturalWidth: number, naturalHeight: number) => void
  onImageError: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingId = useRef<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function toPercent(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    }
  }

  function handleContainerClick(e: React.MouseEvent) {
    if (draggingId.current) return
    const { x, y } = toPercent(e.clientX, e.clientY)
    onAddPoint(x, y)
  }

  function handlePointMouseDown(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    draggingId.current = id
    setSelectedId(id)

    function handleMove(ev: MouseEvent) {
      const { x, y } = toPercent(ev.clientX, ev.clientY)
      onMovePoint(id, x, y)
    }
    function handleUp() {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      setTimeout(() => { draggingId.current = null }, 0)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className="relative rounded-lg border border-border overflow-hidden bg-background"
      style={{ cursor: 'crosshair', userSelect: 'none', maxWidth: 480 }}
    >
      <img
        src={src}
        alt="Foto a editar"
        draggable={false}
        className="w-full block pointer-events-none"
        onLoad={e => onImageLoad(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
        onError={onImageError}
      />
      {points.map((p, i) => (
        <div
          key={p.id}
          onMouseDown={e => handlePointMouseDown(p.id, e)}
          title={p.label}
          className="absolute flex items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: 24,
            height: 24,
            marginLeft: -12,
            marginTop: -12,
            background: p.id === selectedId ? LC.aqua : 'rgba(0,0,0,0.65)',
            border: '2px solid #fff',
            cursor: 'grab',
          }}
        >
          {i + 1}
        </div>
      ))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// SHARED UI PRIMITIVES
// ═════════════════════════════════════════════════════════════

function CollectionListView({
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyHint,
  newLabel,
  loading,
  count,
  onNew,
  singular,
  plural,
  children,
}: {
  emptyIcon: React.ElementType
  emptyTitle: string
  emptyHint: string
  newLabel: string
  loading: boolean
  count: number
  onNew: () => void
  singular: string
  plural: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {count === 0 ? `Aún no hay ${plural}.` : `${count} ${count !== 1 ? plural : singular}`}
        </p>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ minHeight: '40px', background: `linear-gradient(90deg, ${LC.aqua}, ${LC.aquaBright})`, color: '#fff' }}
        >
          <Plus className="h-4 w-4" />
          {newLabel}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Cargando...
        </div>
      ) : count === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-border bg-card/40">
          <EmptyIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground/80 opacity-60" />
          <p className="text-sm font-medium mb-1">{emptyTitle}</p>
          <p className="text-xs text-muted-foreground">{emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </div>
  )
}

function ItemCard({
  title,
  subtitle,
  meta,
  onEdit,
  onDelete,
}: {
  title: string
  subtitle?: string
  meta?: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="group p-4 rounded-xl border border-border bg-card hover:border-border hover:bg-muted transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{subtitle}</p>
          )}
          {meta && <p className="text-[11px] text-muted-foreground mt-1.5">{meta}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-2 rounded hover:bg-muted transition-colors"
            title="Editar"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded hover:bg-destructive/15 text-destructive dark:text-[#e0697d] transition-colors"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function FormField({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground">
        {label} {required && <span className="text-destructive dark:text-[#e0697d]">*</span>}
      </label>
      {children}
    </div>
  )
}

function FormActions({
  saving,
  canSave,
  onCancel,
  onSave,
}: {
  saving: boolean
  canSave: boolean
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
      <button
        onClick={onCancel}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
      >
        <X className="h-4 w-4" />
        Cancelar
      </button>
      <button
        onClick={onSave}
        disabled={!canSave || saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
        style={{ background: `linear-gradient(90deg, ${LC.aqua}, ${LC.aquaBright})`, color: '#fff' }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar
      </button>
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
