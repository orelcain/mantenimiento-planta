/**
 * LearningHubPage — Centro de Aprendizaje
 * Hub con sub-módulos de capacitación para técnicos
 * Ruta: /aprendizaje (pública, sin autenticación)
 */
import { useNavigate } from 'react-router-dom'
import { BookOpen, Cpu, Shield, Fish, GraduationCap, ArrowRight, Lock } from 'lucide-react'

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
    href: '/aprendizaje/seguridad',
    enabled: true,
    stats: 'EPP · LOTO · Emergencias · Riesgos',
    color: '#ff6644',
  },
  {
    id: 'marel',
    title: 'Marel',
    subtitle: 'Equipos de Procesamiento',
    description: 'Guías de operación y mantenimiento de equipos Marel instalados en planta.',
    icon: Fish,
    href: '/aprendizaje/marel',
    enabled: true,
    stats: 'MX · Stork Trim · Scanvaegt',
    color: '#aa66ff',
  },
]

export function LearningHubPage() {
  const navigate = useNavigate()

  return (
    // min-h-dvh: respeta barras de navegación mobile (iOS/Android)
    // flex flex-col: permite centrar verticalmente el contenido en desktop
    <div className="min-h-dvh w-full flex flex-col" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)' }}>

      {/* Header — centrado, sin div vacío */}
      <div className="max-w-5xl w-full mx-auto px-4 pt-8 pb-6 sm:px-6 sm:pt-12 sm:pb-8 flex flex-col items-center text-center gap-3">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl"
          style={{ background: 'rgba(68,153,255,.14)', border: '1px solid rgba(68,153,255,.28)' }}>
          <GraduationCap className="h-8 w-8 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Centro de Aprendizaje</h1>
          <p className="text-sm text-[#7a9ab8] mt-1">Conocimiento práctico para técnicos de planta</p>
        </div>
      </div>

      {/* Module cards — flex-1 centra verticalmente en desktop */}
      <main className="flex-1 flex flex-col justify-center max-w-5xl w-full mx-auto px-4 pb-6 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => mod.enabled && navigate(mod.href)}
              disabled={!mod.enabled}
              className="group text-left rounded-xl border transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: mod.enabled
                  ? 'linear-gradient(135deg, rgba(22,28,42,0.9) 0%, rgba(18,24,38,0.95) 100%)'
                  : 'rgba(16,20,30,0.6)',
                borderColor: mod.enabled ? '#1e3a5f' : '#151a28',
                opacity: mod.enabled ? 1 : 0.55,
                cursor: mod.enabled ? 'pointer' : 'default',
                minHeight: '80px',
              }}
            >
              {/* Línea top — opacidad completa para visibilidad en planta */}
              <div className="h-1.5 rounded-t-xl transition-all duration-200"
                style={{ background: mod.enabled ? mod.color : '#222', opacity: mod.enabled ? 0.9 : 0.3 }} />

              <div className="p-5 sm:p-6">
                {/* Icon + Title */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0 transition-colors"
                    style={{ background: `${mod.color}18`, border: `1px solid ${mod.color}40` }}>
                    <mod.icon className="h-6 w-6" style={{ color: mod.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-semibold text-white truncate">{mod.title}</h2>
                      {!mod.enabled && <Lock className="h-3.5 w-3.5 text-[#3a4a5a] flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-[#7a9ab8] mt-0.5">{mod.subtitle}</p>
                  </div>
                </div>

                {/* Descripción */}
                <p className="text-sm text-[#8a9aaa] leading-relaxed mb-4">
                  {mod.enabled ? mod.description : 'Próximamente — Este módulo está en desarrollo.'}
                </p>

                {/* Footer: stats + pill acción — py-2 px-4 para touch con guantes */}
                <div className="flex items-center justify-between">
                  {mod.stats && mod.enabled ? (
                    <span className="text-xs text-[#6a90b8]">{mod.stats}</span>
                  ) : (
                    <span />
                  )}
                  {mod.enabled && (
                    <span className="flex items-center gap-1.5 text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
                      style={{ background: `${mod.color}25`, color: mod.color }}>
                      Abrir <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>

      {/* Footer fijo al bottom del flex container */}
      <div className="pb-6 sm:pb-8 text-center">
        <p className="text-xs text-[#4a7aaa] uppercase tracking-wider">
          No requiere inicio de sesión · Acceso libre para técnicos
        </p>
      </div>

    </div>
  )
}
