/**
 * LearningHubPage — Centro de Aprendizaje
 * Hub con sub-módulos de capacitación para técnicos
 * Ruta: /aprendizaje (pública, sin autenticación)
 */
import { useNavigate } from 'react-router-dom'
import { BookOpen, Cpu, Shield, Fish, GraduationCap, ArrowRight, Lock, Home } from 'lucide-react'

interface LearningModule {
  id: string
  title: string
  subtitle: string
  description: string
  icon: React.ElementType
  href: string
  enabled: boolean
  stats?: string
  color: string
}

const modules: LearningModule[] = [
  {
    id: 'baader-200',
    title: 'Baader 200',
    subtitle: 'Manual de Ajustes Técnicos',
    description: 'Procedimientos paso a paso para ajuste y calibración de la máquina fileteadora Baader 200. Incluye diagramas técnicos, medidas clave y notas de experiencia.',
    icon: BookOpen,
    href: '/aprendizaje/baader-200',
    enabled: true,
    stats: '23 secciones · Diagramas interactivos',
    color: '#4499ff',
  },
  {
    id: 'hmi-knuro',
    title: 'HMI Knuro B2',
    subtitle: 'Simulador de Parámetros',
    description: 'Simulador interactivo del panel HMI Knuro para máquinas Baader. Presets de planta configurados, referencias de fábrica y modo de práctica.',
    icon: Cpu,
    href: '/aprendizaje/hmi-knuro',
    enabled: true,
    stats: '6 presets · Modo práctica',
    color: '#44ddaa',
  },
  {
    id: 'seguridad',
    title: 'Seguridad en Planta',
    subtitle: 'Protocolos y Procedimientos',
    description: 'Protocolos de seguridad industrial, uso de EPP, procedimientos de emergencia y bloqueo/etiquetado de equipos.',
    icon: Shield,
    href: '#',
    enabled: false,
    color: '#ff6644',
  },
  {
    id: 'marel',
    title: 'Marel',
    subtitle: 'Equipos de Procesamiento',
    description: 'Guías de operación y mantenimiento de equipos Marel instalados en planta.',
    icon: Fish,
    href: '#',
    enabled: false,
    color: '#aa66ff',
  },
]

export function LearningHubPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen w-full" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)' }}>
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-6 sm:px-6 sm:pt-16 sm:pb-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl" style={{ background: 'rgba(68,153,255,.12)', border: '1px solid rgba(68,153,255,.2)' }}>
              <GraduationCap className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Centro de Aprendizaje</h1>
              <p className="text-sm text-[#5a7a9a] mt-0.5">Conocimiento práctico para técnicos de planta</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
            style={{ background: 'rgba(68,153,255,.08)', border: '1px solid rgba(68,153,255,.2)', color: '#7ab8ff' }}
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Ir a la App</span>
          </button>
        </div>
      </div>

      {/* Module cards grid */}
      <div className="max-w-5xl mx-auto px-4 pb-16 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => mod.enabled && navigate(mod.href)}
              disabled={!mod.enabled}
              className="group text-left rounded-xl border transition-all duration-200"
              style={{
                background: mod.enabled
                  ? 'linear-gradient(135deg, rgba(22,28,42,0.9) 0%, rgba(18,24,38,0.95) 100%)'
                  : 'rgba(16,20,30,0.6)',
                borderColor: mod.enabled ? '#1e3a5f' : '#151a28',
                opacity: mod.enabled ? 1 : 0.55,
                cursor: mod.enabled ? 'pointer' : 'default',
              }}
            >
              {/* Card top accent line */}
              <div className="h-1 rounded-t-xl transition-all duration-200"
                style={{ background: mod.enabled ? mod.color : '#222', opacity: mod.enabled ? 0.6 : 0.3 }} />

              <div className="p-5 sm:p-6">
                {/* Icon + Title row */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 transition-colors"
                    style={{ background: `${mod.color}15`, border: `1px solid ${mod.color}30` }}>
                    <mod.icon className="h-5 w-5" style={{ color: mod.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-semibold text-white truncate">{mod.title}</h2>
                      {!mod.enabled && <Lock className="h-3.5 w-3.5 text-[#3a4a5a] flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-[#5a7a9a] mt-0.5">{mod.subtitle}</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-[#7a8a9a] leading-relaxed mb-4 line-clamp-2">
                  {mod.enabled ? mod.description : 'Próximamente — Este módulo está en desarrollo.'}
                </p>

                {/* Footer: stats + action */}
                <div className="flex items-center justify-between">
                  {mod.stats && mod.enabled ? (
                    <span className="text-xs text-[#4a6a8a]">{mod.stats}</span>
                  ) : (
                    <span />
                  )}
                  {mod.enabled && (
                    <span className="flex items-center gap-1 text-xs font-medium transition-all group-hover:gap-2"
                      style={{ color: mod.color }}>
                      Abrir <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-[10px] text-[#2a4a6a] mt-8 uppercase tracking-wider">
          No requiere inicio de sesión · Acceso libre para técnicos
        </p>
      </div>
    </div>
  )
}
