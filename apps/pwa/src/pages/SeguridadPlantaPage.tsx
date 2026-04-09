/**
 * SeguridadPlantaPage — Módulo de Seguridad en Planta
 * Ruta pública: /aprendizaje/seguridad
 */
import { useNavigate } from 'react-router-dom'
import {
  Shield, ArrowLeft, HardHat, Zap, Flame, AlertTriangle,
  Eye, Wind, Footprints, Hand, Clock, FileText,
} from 'lucide-react'

const EPP_ITEMS = [
  { icon: HardHat,     label: 'Casco de seguridad',         desc: 'Obligatorio en toda el área de producción.' },
  { icon: Eye,         label: 'Lentes de protección',        desc: 'Anti-impacto, uso obligatorio en zonas de corte.' },
  { icon: Hand,        label: 'Guantes de corte',            desc: 'Nivel de corte 5 para manejo de cuchillas.' },
  { icon: Footprints,  label: 'Zapatos de seguridad',        desc: 'Punta de acero y suela antideslizante.' },
  { icon: Wind,        label: 'Protección auditiva',         desc: 'Tapones o casco en zonas > 85 dB.' },
]

const SECTIONS = [
  {
    id: 'loto',
    color: '#f59e0b',
    icon: Zap,
    title: 'LOTO — Bloqueo y Etiquetado',
    subtitle: 'Lockout / Tagout',
    items: [
      'Desenergizar completamente el equipo antes de intervenir',
      'Aplicar candado personal en el punto de corte de energía',
      'Colocar tarjeta de advertencia con nombre y fecha',
      'Verificar ausencia de energía antes de trabajar',
      'Retirar el candado solo quien lo instaló',
    ],
  },
  {
    id: 'emergencia',
    color: '#ef4444',
    icon: Flame,
    title: 'Procedimientos de Emergencia',
    subtitle: 'Incendio · Lesiones · Derrame',
    items: [
      'Accionar alarma y evacuar por rutas señalizadas',
      'Llamar al responsable de emergencias: interno 111',
      'Uso de extintores CO₂ (equipos eléctricos) o ABC (resto)',
      'Primeros auxilios: botiquín en acceso planta y sala de máquinas',
      'Punto de reunión: estacionamiento principal (señal verde)',
    ],
  },
  {
    id: 'riesgos',
    color: '#8b5cf6',
    icon: AlertTriangle,
    title: 'Riesgos Críticos de Planta',
    subtitle: 'Identificación y control',
    items: [
      'Pisos húmedos y resbaladizos — usar calzado antideslizante',
      'Cuchillas expuestas en fileteadoras — distancia de seguridad 50 cm',
      'Agua a presión — no dirigir a personas ni equipos eléctricos',
      'Amoniaco (refrigeración) — detector de fugas en sala de máquinas',
      'Atrapamientos en cintas transportadoras — guardas siempre en posición',
    ],
  },
]

export function SeguridadPlantaPage() {
  const navigate = useNavigate()

  return (
    <div
      className="min-h-screen w-full"
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
          <span style={{ color: '#7ab8ff' }}>Seguridad</span>
        </div>

        <div className="flex items-center gap-4 mb-2">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(255,102,68,.12)', border: '1px solid rgba(255,102,68,.25)' }}
          >
            <Shield className="h-6 w-6" style={{ color: '#ff6644' }} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Seguridad en Planta</h1>
            <p className="text-sm mt-0.5" style={{ color: '#5a7a9a' }}>
              Protocolos · EPP · Emergencias · Riesgos críticos
            </p>
          </div>
        </div>

      </div>

      {/* EPP Section */}
      <div className="max-w-3xl mx-auto px-4 pb-6 sm:px-6">
        <h2 className="text-sm uppercase tracking-widest font-semibold mb-3" style={{ color: '#6a90b8' }}>
          Equipos de Protección Personal (EPP)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {EPP_ITEMS.map(({ icon: Icon, label, desc }, idx) => (
            <div
              key={label}
              className={`flex items-start gap-3 rounded-xl p-4${EPP_ITEMS.length % 2 !== 0 && idx === EPP_ITEMS.length - 1 ? ' sm:col-span-2' : ''}`}
              style={{ background: 'rgba(22,28,42,0.8)', border: '1px solid #1e3a5f' }}
            >
              <div
                className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
                style={{ background: 'rgba(255,102,68,.1)', border: '1px solid rgba(255,102,68,.2)' }}
              >
                <Icon className="h-4 w-4" style={{ color: '#ff6644' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#7a8a9a' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Protocol sections */}
        <div className="flex flex-col gap-5">
          {SECTIONS.map(({ id, color, icon: Icon, title, subtitle, items }) => (
            <div
              key={id}
              className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(22,28,42,0.8)', border: '1px solid #1e3a5f' }}
            >
              <div className="h-1" style={{ background: color, opacity: 0.6 }} />
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
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
                <ul className="flex flex-col gap-2">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#8a9aaa' }}>
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* WIP note */}
        <div
          className="mt-6 rounded-lg px-4 py-3 flex items-center gap-3 text-xs"
          style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.15)', color: '#ca8a04' }}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>Se agregarán fichas PDF descargables y videos de EPP próximamente.</span>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-4 text-xs" style={{ color: '#4a7aaa' }}>
          <FileText className="h-3.5 w-3.5" />
          <span>Contenido sujeto a los procedimientos internos vigentes de la planta.</span>
        </div>
      </div>
    </div>
  )
}
