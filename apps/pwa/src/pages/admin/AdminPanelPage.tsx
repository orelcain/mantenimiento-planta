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

import { useNavigate } from 'react-router-dom'
import { ListCell, ListGroup } from '@/components/piel'
import {
  Key,
  Shield,
  Map as MapIcon,
  Settings,
  Layers,
  FolderTree,
  Map,
  GraduationCap,
  FileText,
  Gauge,
  Bell,
  Wrench,
  LayoutDashboard,
  Send,
  BarChart3,
} from 'lucide-react'
import type { ReactNode } from 'react'

interface AdminItem {
  to: string
  title: string
  description: string
  icon: ReactNode
  /** Agrupador visual ("Sensibles" requieren re-auth, "Configuración" general). */
  section: 'sensible' | 'config'
}

const ADMIN_ITEMS: AdminItem[] = [
  // ── Sensibles (todas requieren re-auth) ─────────────────────────────────
  {
    to: '/admin/shoplogix-credentials',
    title: 'Credenciales Shoplogix',
    description: 'Inicio de sesión automático de la sincronización de las Baader 142',
    icon: <Key className="size-4" />,
    section: 'sensible',
  },
  {
    to: '/admin/permissions',
    title: 'Permisos por usuario',
    description: 'Qué módulos ve y edita cada persona, por sobre su rol',
    icon: <Shield className="size-4" />,
    section: 'sensible',
  },
  {
    to: '/admin/maps',
    title: 'Mapas y planos',
    description: 'Planos DXF, capas, ubicaciones y marcadores de equipos',
    icon: <MapIcon className="size-4" />,
    section: 'sensible',
  },
  {
    to: '/admin/mapa-terreno',
    title: 'Editor de terreno',
    description: 'Modelos DEM y terreno 3D de la planta',
    icon: <Map className="size-4" />,
    section: 'sensible',
  },
  {
    to: '/admin/ett',
    title: 'Configuración ETT',
    description: 'Parámetros de los Estudios Técnicos de Trabajo',
    icon: <FileText className="size-4" />,
    section: 'sensible',
  },
  {
    to: '/admin/sidebar',
    title: 'Barra lateral',
    description: 'Orden y visibilidad de los módulos del menú lateral',
    icon: <Layers className="size-4" />,
    section: 'sensible',
  },
  {
    to: '/admin/machine-capacity',
    title: 'Velocidad nameplate Baader',
    description: 'Capacidad máxima de cada evisceradora, como referencia',
    icon: <Gauge className="size-4" />,
    section: 'sensible',
  },
  {
    to: '/admin/notifications-shoplogix',
    title: 'Notificaciones Shoplogix',
    description: 'Canales, gracia de inicio, hitos de piezas y detenciones',
    icon: <Bell className="size-4" />,
    section: 'sensible',
  },

  // ── Configuración general (no requieren re-auth, son admin pero menos sensibles) ─
  {
    to: '/admin/sync-telegram',
    title: 'Sincronización Telegram',
    description: 'Baja lo nuevo del grupo a las carpetas de cada equipo',
    icon: <Send className="size-4" />,
    section: 'config',
  },
  {
    to: '/admin/powerbi-export',
    title: 'Actualizar Power BI',
    description: 'Exporta los KPIs de Mantención y refresca el informe',
    icon: <BarChart3 className="size-4" />,
    section: 'config',
  },
  {
    to: '/admin/dev-modules',
    title: 'Módulos en desarrollo',
    description: 'Muestra u oculta módulos en prueba en este dispositivo',
    icon: <Wrench className="size-4" />,
    section: 'config',
  },
  {
    to: '/admin/default-route',
    title: 'Página de inicio por defecto',
    description: 'Qué módulo abre la app al entrar',
    icon: <LayoutDashboard className="size-4" />,
    section: 'config',
  },
  {
    to: '/settings',
    title: 'Configuración',
    description: 'Ajustes generales del módulo de mantenimiento',
    icon: <Settings className="size-4" />,
    section: 'config',
  },
  {
    to: '/hierarchy',
    title: 'Jerarquías',
    description: 'Estructura de equipos y zonas de la planta',
    icon: <FolderTree className="size-4" />,
    section: 'config',
  },
  {
    to: '/aprendizaje/admin',
    title: 'Editor de aprendizaje',
    description: 'Contenido del Centro de Aprendizaje',
    icon: <GraduationCap className="size-4" />,
    section: 'config',
  },
]

const SECTION_LABELS: Record<AdminItem['section'], { title: string; footer?: string }> = {
  sensible: { title: 'Sensibles', footer: 'Al entrar a cada una se vuelve a confirmar tu identidad.' },
  config: { title: 'Configuración general' },
}

export function AdminPanelPage() {
  const navigate = useNavigate()
  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-title1 font-bold">Panel de administración</h1>
        <p className="text-subhead text-muted-foreground">
          Configuración sensible del sistema. Cada vez que entras a una opción se confirma tu identidad
          para evitar cambios accidentales.
        </p>
      </div>

      {/* Lista agrupada como Ajustes de iOS: ícono en recuadro neutro, título, una línea de
          descripción y chevron. El color queda para el estado, no para distinguir filas. */}
      {(['sensible', 'config'] as const).map((section) => {
        const items = ADMIN_ITEMS.filter((it) => it.section === section)
        if (items.length === 0) return null
        return (
          <ListGroup key={section} title={SECTION_LABELS[section].title} footer={SECTION_LABELS[section].footer}>
            {items.map((item) => (
              <ListCell
                key={item.to}
                leading={
                  <span className="flex size-7 items-center justify-center rounded-ctl bg-muted-foreground/[0.12] text-muted-foreground">
                    {item.icon}
                  </span>
                }
                title={item.title}
                subtitle={item.description}
                onClick={() => navigate(item.to)}
              />
            ))}
          </ListGroup>
        )
      })}
    </div>
  )
}
