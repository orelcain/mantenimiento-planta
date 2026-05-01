/**
 * AdminPanelPage — Hub central del área de administración.
 *
 * Lista todas las opciones de configuración sensible disponibles para admins.
 * Cada item lleva a una sub-ruta protegida — todas envueltas en RequireReAuth
 * desde App.tsx, de modo que entrar a CUALQUIERA pide credenciales otra vez.
 *
 * El propósito es darle al admin un punto de entrada único en lugar de
 * tener que recordar paths como `/admin/shoplogix-credentials` o
 * `/admin/permissions` de memoria.
 */

import { Link } from 'react-router-dom'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import {
  Key,
  Shield,
  Map as MapIcon,
  Settings,
  Layers,
  ChevronRight,
  FolderTree,
  Map,
  GraduationCap,
  FileText,
  Gauge,
} from 'lucide-react'
import type { ReactNode } from 'react'

interface AdminItem {
  to: string
  title: string
  description: string
  icon: ReactNode
  /** Color tailwind para el ícono (ej: 'text-amber-400') */
  iconColor: string
  /** Agrupador visual ("Sensibles" requieren re-auth, "Configuración" general). */
  section: 'sensible' | 'config'
}

const ADMIN_ITEMS: AdminItem[] = [
  // ── Sensibles (todas requieren re-auth) ─────────────────────────────────
  {
    to: '/admin/shoplogix-credentials',
    title: 'Credenciales Shoplogix',
    description: 'Auto-login ROPC para sync de Evisceradoras Baader 142. Rota la pass cuando AquaChile la cambie.',
    icon: <Key className="w-5 h-5" />,
    iconColor: 'text-amber-400',
    section: 'sensible',
  },
  {
    to: '/admin/permissions',
    title: 'Permisos por usuario',
    description: 'Define qué módulos puede ver y editar cada usuario, anulando los defaults del rol.',
    icon: <Shield className="w-5 h-5" />,
    iconColor: 'text-emerald-400',
    section: 'sensible',
  },
  {
    to: '/admin/maps',
    title: 'Mapas y planos',
    description: 'Sube planos DXF, edita capas, gestiona ubicaciones y marcadores de equipos.',
    icon: <MapIcon className="w-5 h-5" />,
    iconColor: 'text-blue-400',
    section: 'sensible',
  },
  {
    to: '/admin/mapa-terreno',
    title: 'Editor de terreno',
    description: 'Modelos DEM y configuración del terreno 3D de la planta.',
    icon: <Map className="w-5 h-5" />,
    iconColor: 'text-blue-400',
    section: 'sensible',
  },
  {
    to: '/admin/ett',
    title: 'Configuración ETT',
    description: 'Parámetros del módulo de Estudios Técnicos de Trabajo.',
    icon: <FileText className="w-5 h-5" />,
    iconColor: 'text-slate-400',
    section: 'sensible',
  },
  {
    to: '/admin/sidebar',
    title: 'Editor de sidebar',
    description: 'Personaliza el orden y visibilidad de los items del menú lateral.',
    icon: <Layers className="w-5 h-5" />,
    iconColor: 'text-purple-400',
    section: 'sensible',
  },
  {
    to: '/admin/machine-capacity',
    title: 'Velocidad Nameplate Baader',
    description: 'Capacidad física máxima (pz/min) de cada Evisceradora. Usada para OEE y para detectar objetivos mal calibrados en Shoplogix.',
    icon: <Gauge className="w-5 h-5" />,
    iconColor: 'text-cyan-400',
    section: 'sensible',
  },

  // ── Configuración general (no requieren re-auth, son admin pero menos sensibles) ─
  {
    to: '/settings',
    title: 'Configuración',
    description: 'Configuración general del módulo de mantenimiento.',
    icon: <Settings className="w-5 h-5" />,
    iconColor: 'text-slate-400',
    section: 'config',
  },
  {
    to: '/hierarchy',
    title: 'Jerarquías',
    description: 'Estructura de equipos y zonas de la planta.',
    icon: <FolderTree className="w-5 h-5" />,
    iconColor: 'text-indigo-400',
    section: 'config',
  },
  {
    to: '/aprendizaje/admin',
    title: 'Editor de Aprendizaje',
    description: 'Edita el contenido del Centro de Aprendizaje.',
    icon: <GraduationCap className="w-5 h-5" />,
    iconColor: 'text-cyan-400',
    section: 'config',
  },
]

const SECTION_LABELS: Record<AdminItem['section'], string> = {
  sensible: 'Sensibles · re-confirmación al entrar',
  config: 'Configuración general',
}

export function AdminPanelPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-3xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield className="w-6 h-6 text-amber-400" />
          Panel de administración
        </h1>
        <p className="text-sm text-muted-foreground">
          Configuración sensible del sistema. Cada vez que entras a una opción se confirma tu identidad
          para evitar cambios accidentales.
        </p>
      </div>

      {/* Render por secciones para que el admin tenga claridad de qué requiere
          re-confirmación y qué no. */}
      {(['sensible', 'config'] as const).map((section) => {
        const items = ADMIN_ITEMS.filter((it) => it.section === section)
        if (items.length === 0) return null
        return (
          <section key={section} className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80 px-1">
              {SECTION_LABELS[section]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <Link key={item.to} to={item.to} className="group">
                  <Card className="h-full hover:border-amber-500/40 transition-colors">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <span className={item.iconColor}>{item.icon}</span>
                        <span className="flex-1">{item.title}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      {item.description}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
