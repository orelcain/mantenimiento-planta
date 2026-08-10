/**
 * ARIA Actions Dashboard — v1
 * Historial de todas las acciones ejecutadas por ARIA (el chatbot)
 * Muestra incidencias creadas, estados actualizados, técnicos asignados, etc.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ClipboardList,
  Compass,
  RefreshCw,
  ArrowLeft,
  Filter,
  Search,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { collection, getDocs, query, orderBy, limit, where } from '@/services/firestoreTracked'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import type { AriaActionLog } from '@/services/chatActions'
import { logger } from '@/lib/logger'

// ─── Tipos ───────────────────────────────────────────────────────────

interface ActionLogEntry extends AriaActionLog {
  id: string
}

// ─── Stats Card ──────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string
  value: number
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-background border border-border rounded-card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ─── Action Row ──────────────────────────────────────────────────────

function ActionRow({ action, onViewIncident }: {
  action: ActionLogEntry
  onViewIncident: (id: string) => void
}) {
  const typeLabels: Record<string, { icon: LucideIcon; label: string }> = {
    create_incident: { icon: ClipboardList, label: 'Incidencia creada' },
    update_incident_status: { icon: RefreshCw, label: 'Estado actualizado' },
    search_equipment: { icon: Search, label: 'Búsqueda de equipo' },
    search_repuestos: { icon: Wrench, label: 'Búsqueda de repuesto' },
    navigate: { icon: Compass, label: 'Navegación' },
  }
  const tipo = typeLabels[action.actionType]
  const TipoIcon = tipo?.icon

  const typeColors: Record<string, string> = {
    create_incident: 'text-blue-600 bg-blue-500/[0.15] dark:text-blue-400 dark:bg-primary/[0.15]',
    update_incident_status: 'text-amber-600 bg-amber-500/[0.15] dark:text-amber-400 dark:bg-amber-500/[0.15]',
    search_equipment: 'text-green-600 bg-emerald-500/[0.15] dark:text-green-400 dark:bg-green-500/[0.15]',
    search_repuestos: 'text-cat-6-ink bg-purple-50 dark:text-cat-6-ink dark:bg-cat-6-tint/[0.15]',
    navigate: 'text-muted-foreground bg-muted dark:text-muted-foreground dark:bg-muted-foreground/[0.10]',
  }

  const ts = action.timestamp instanceof Date
    ? action.timestamp
    : new Date((action.timestamp as any)?.seconds ? (action.timestamp as any).seconds * 1000 : action.timestamp)

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      {/* Status icon */}
      <div className="flex-shrink-0">
        {action.success ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-destructive" />
        )}
      </div>

      {/* Type badge */}
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${typeColors[action.actionType] || 'text-muted-foreground bg-muted'}`}>
        {TipoIcon && <TipoIcon className="h-3 w-3" />}
        {tipo?.label ?? action.actionType}
      </span>

      {/* Description */}
      <p className="flex-1 text-sm truncate">{action.description}</p>

      {/* Result link */}
      {action.resultId && (
        <button
          onClick={() => onViewIncident(action.resultId!)}
          className="text-xs text-primary hover:underline whitespace-nowrap"
        >
          Ver →
        </button>
      )}

      {/* Timestamp */}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {ts.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
        {' '}
        {ts.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

// ─── Componente Principal ────────────────────────────────────────────

export function AriaActionsPage() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const [actions, setActions] = useState<ActionLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterSuccess, setFilterSuccess] = useState<'all' | 'success' | 'failed'>('all')

  const loadActions = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const q = user.rol !== 'admin'
        ? query(collection(db, 'ariaActions'), where('userId', '==', user.id), orderBy('timestamp', 'desc'), limit(100))
        : query(collection(db, 'ariaActions'), orderBy('timestamp', 'desc'), limit(100))
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(doc => {
        const d = doc.data()
        return {
          ...d,
          id: doc.id,
          timestamp: d.timestamp?.toDate?.() || new Date(d.timestamp),
        } as ActionLogEntry
      })
      setActions(data)
    } catch (err) {
      logger.error('Error loading ARIA actions', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadActions()
  }, [loadActions])

  // Filtrar
  const filtered = actions.filter(a => {
    if (filterType !== 'all' && a.actionType !== filterType) return false
    if (filterSuccess === 'success' && !a.success) return false
    if (filterSuccess === 'failed' && a.success) return false
    return true
  })

  // Stats
  const totalActions = actions.length
  const successCount = actions.filter(a => a.success).length
  const incidentsCreated = actions.filter(a => a.actionType === 'create_incident' && a.success).length
  const todayCount = actions.filter(a => {
    const ts = a.timestamp instanceof Date ? a.timestamp : new Date()
    return ts.toDateString() === new Date().toDateString()
  }).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-card hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">ARIA — Dashboard de Acciones</h1>
              <p className="text-sm text-muted-foreground">
                Historial de acciones ejecutadas por la asistente
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={loadActions}
          disabled={loading}
          className="p-2 rounded-card hover:bg-muted transition-colors text-muted-foreground"
          title="Refrescar"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total acciones"
          value={totalActions}
          icon={TrendingUp}
          color="bg-primary/[0.15] text-ink-info"
        />
        <StatCard
          label="Exitosas"
          value={successCount}
          icon={CheckCircle}
          color="bg-green-500/[0.15] text-ink-ok"
        />
        <StatCard
          label="Incidencias creadas"
          value={incidentsCreated}
          icon={AlertTriangle}
          color="bg-amber-500/[0.15] text-ink-warn"
        />
        <StatCard
          label="Hoy"
          value={todayCount}
          icon={Clock}
          color="bg-cat-6-tint/[0.15] text-cat-6-ink"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="text-sm border border-border rounded-card px-3 py-1.5 bg-background"
        >
          <option value="all">Todos los tipos</option>
          <option value="create_incident">Incidencias creadas</option>
          <option value="update_incident_status">Estados actualizados</option>
          <option value="search_equipment">Búsquedas equipo</option>
          <option value="search_repuestos">Búsquedas repuesto</option>
        </select>
        <select
          value={filterSuccess}
          onChange={e => setFilterSuccess(e.target.value as any)}
          className="text-sm border border-border rounded-card px-3 py-1.5 bg-background"
        >
          <option value="all">Todos</option>
          <option value="success">Exitosas</option>
          <option value="failed">Fallidas</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} de {totalActions} acciones
        </span>
      </div>

      {/* Actions Table */}
      <div className="bg-background border border-border rounded-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Cargando acciones...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground text-sm">
              {totalActions === 0
                ? 'ARIA aún no ha ejecutado acciones. Prueba creando una incidencia desde el chat.'
                : 'No hay acciones que coincidan con los filtros.'}
            </p>
          </div>
        ) : (
          filtered.map(action => (
            <ActionRow
              key={action.id}
              action={action}
              onViewIncident={(id) => navigate(`/incidents?id=${id}`)}
            />
          ))
        )}
      </div>
    </div>
  )
}
