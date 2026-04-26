/**
 * LearningAdminPage — Admin del Centro de Aprendizaje
 * Ruta: /aprendizaje/admin (requiere rol admin)
 *
 * Lista de maquinas con enlace para editar contenido de cada una.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logger } from '@/lib/logger'
import { ArrowLeft, Edit3, GraduationCap, Loader2 } from 'lucide-react'
import {
  LEARNING_MACHINES,
  type LearningMachine,
} from '@/data/learningMachines'
import {
  getMachineContentCounts,
  type MachineContentCounts,
} from '@/services/learningContent'

export function LearningAdminPage() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState<Record<string, MachineContentCounts>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadCounts() {
      setLoading(true)
      try {
        const results = await Promise.all(
          LEARNING_MACHINES.map(async m => {
            try {
              const c = await getMachineContentCounts(m.slug)
              return [m.slug, c] as const
            } catch (err) {
              logger.error('Error cargando counts para máquina', err instanceof Error ? err : new Error(String(err)), { slug: m.slug })
              return [m.slug, { manual: 0, procedures: 0, flows: 0, diagnosis: 0 }] as const
            }
          })
        )
        if (cancelled) return
        const map: Record<string, MachineContentCounts> = {}
        for (const [slug, c] of results) map[slug] = c
        setCounts(map)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadCounts()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-full w-full p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <button
        onClick={() => navigate('/aprendizaje')}
        className="flex items-center gap-2 text-sm mb-4 -ml-2 px-2 py-3 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
        style={{ minHeight: '44px' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Centro de Aprendizaje
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20">
          <GraduationCap className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Administrar contenido</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona manuales, procedimientos, flujos y diagnósticos por máquina
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
        <p className="text-sm">
          <strong>MVP:</strong> Por ahora se pueden cargar{' '}
          <strong className="text-primary">Procedimientos</strong> (paso a paso).
          Las otras secciones (Manual, Flujos, Diagnóstico) se habilitarán en siguientes iteraciones.
        </p>
      </div>

      {/* Machine list */}
      <div className="mt-6">
        <h2 className="text-xs uppercase tracking-widest font-semibold mb-3 text-muted-foreground">
          Máquinas disponibles
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando conteos...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LEARNING_MACHINES.map(machine => (
              <MachineAdminCard
                key={machine.slug}
                machine={machine}
                counts={counts[machine.slug]}
                onClick={() => navigate(`/aprendizaje/admin/${machine.slug}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MachineAdminCard({
  machine,
  counts,
  onClick,
}: {
  machine: LearningMachine
  counts?: MachineContentCounts
  onClick: () => void
}) {
  const Icon = machine.icon
  const total = counts
    ? counts.manual + counts.procedures + counts.flows + counts.diagnosis
    : 0

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border border-border bg-card hover:border-primary/40 transition-all p-4 hover:bg-accent/20"
      style={{ minHeight: '88px' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
          style={{
            background: `${machine.color}18`,
            border: `1px solid ${machine.color}40`,
          }}
        >
          <Icon className="h-5 w-5" style={{ color: machine.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{machine.name}</h3>
          <p className="text-xs text-muted-foreground">{machine.area}</p>
          {counts && (
            <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
              <span>{counts.procedures} proced.</span>
              <span>·</span>
              <span>{counts.manual} manual</span>
              <span>·</span>
              <span>{counts.flows} flujos</span>
              <span>·</span>
              <span>{counts.diagnosis} diag.</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-primary">
          <Edit3 className="h-3.5 w-3.5" />
          {total === 0 ? 'Iniciar' : 'Editar'}
        </div>
      </div>
    </button>
  )
}
