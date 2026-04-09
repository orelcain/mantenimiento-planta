/**
 * MarelPage — Módulo de Equipos Marel
 * Ruta pública: /aprendizaje/marel
 */
import { useNavigate } from 'react-router-dom'
import { Fish, ArrowLeft, Settings, BookOpen, Clock, Scale } from 'lucide-react'

const EQUIPOS = [
  {
    id: 'mx',
    color: '#aa66ff',
    icon: Scale,
    title: 'Marel MX',
    subtitle: 'Sistema de pesaje y clasificación',
    status: 'proxim' as const,
    items: [
      'Calibración de celdas de carga',
      'Ajuste de tolerancias por rango de peso',
      'Limpieza y sanitización de platos',
      'Diagnóstico de errores de pesaje',
    ],
  },
  {
    id: 'stork',
    color: '#4499ff',
    icon: Settings,
    title: 'Marel Stork Trim',
    subtitle: 'Cortadora de porciones',
    status: 'proxim' as const,
    items: [
      'Ajuste de cuchilla y espesor de corte',
      'Limpieza diaria y semanal',
      'Cambio de cuchillas — procedimiento seguro',
      'Alarmas frecuentes y solución',
    ],
  },
  {
    id: 'scanvagt',
    color: '#44ddaa',
    icon: BookOpen,
    title: 'Marel Scanvaegt',
    subtitle: 'Sistema de control de producción',
    status: 'proxim' as const,
    items: [
      'Configuración de líneas y recetas',
      'Gestión de operadores y turnos',
      'Exportación de reportes de producción',
      'Reset y reinicio del sistema',
    ],
  },
]

export function MarelPage() {
  const navigate = useNavigate()

  return (
    <div
      className="min-h-dvh w-full"
      style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)' }}
    >
      {/* Header */}
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-4 sm:px-6 sm:pt-12">
        <button
          onClick={() => navigate('/aprendizaje')}
          className="flex items-center gap-2 text-sm mb-3 -ml-2 px-2 py-3 rounded-lg transition-colors"
          style={{ color: '#5a7a9a', minHeight: '44px' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#7ab8ff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#5a7a9a')}
        >
          <ArrowLeft className="h-5 w-5" />
          Centro de Aprendizaje
        </button>
        <div className="flex items-center gap-1.5 text-xs mb-4" style={{ color: '#6a90b8' }}>
          <span>Aprendizaje</span>
          <span>/</span>
          <span style={{ color: '#aa66ff' }}>Marel</span>
        </div>

        <div className="flex items-center gap-4 mb-2">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(170,102,255,.12)', border: '1px solid rgba(170,102,255,.25)' }}
          >
            <Fish className="h-6 w-6" style={{ color: '#aa66ff' }} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Equipos Marel</h1>
            <p className="text-sm mt-0.5" style={{ color: '#7a9ab8' }}>
              Operación · Ajuste · Mantenimiento · Diagnóstico
            </p>
          </div>
        </div>

        {/* Work-in-progress banner */}
        <div
          className="mt-5 rounded-lg px-4 py-3 flex items-start gap-3 text-sm"
          style={{ background: 'rgba(170,102,255,.08)', border: '1px solid rgba(170,102,255,.2)', color: '#c084fc' }}
        >
          <Clock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Guías en desarrollo — Se publicarán con fotos y videos de referencia.
            Para agregar documentación, usar el módulo de <strong>Evidencias</strong> en la app.
          </span>
        </div>
      </div>

      {/* Equipment cards */}
      <div className="max-w-3xl mx-auto px-4 pb-10 sm:px-6">
        <h2 className="text-sm uppercase tracking-widest font-semibold mb-4 mt-2" style={{ color: '#6a90b8' }}>
          Equipos instalados en planta
        </h2>

        <div className="flex flex-col gap-5">
          {EQUIPOS.map(({ id, color, icon: Icon, title, subtitle }) => (
            <div
              key={id}
              className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(22,28,42,0.8)', border: '1px solid #1e3a5f' }}
            >
              <div className="h-1.5" style={{ background: color, opacity: 0.9 }} />
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
                      style={{ background: `${color}18`, border: `1px solid ${color}35` }}
                    >
                      <Icon className="h-5 w-5" style={{ color }} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">{title}</h3>
                      <p className="text-xs" style={{ color: '#5a7a9a' }}>{subtitle}</p>
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-1 rounded-full font-medium"
                    style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
                  >
                    Próximamente
                  </span>
                </div>

                <p className="text-sm" style={{ color: '#6a90b8' }}>
                  Guía en preparación — cubrirá ajuste, limpieza, diagnóstico de fallas y procedimientos de seguridad específicos del equipo.
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs mt-8 uppercase tracking-wider" style={{ color: '#4a7aaa' }}>
          No requiere inicio de sesión · Acceso libre para técnicos
        </p>
      </div>
    </div>
  )
}
