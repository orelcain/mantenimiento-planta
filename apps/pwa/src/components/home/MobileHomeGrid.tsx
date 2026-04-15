import { Link } from 'react-router-dom'
import {
  AlertTriangle, Package, Camera, CalendarClock, Wrench,
  BarChart3, Map, Route, Activity, Settings, FileText,
  GraduationCap, ChevronRight, ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import type { UserRole } from '@/types'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TileColor = 'red' | 'blue' | 'amber' | 'green' | 'purple' | 'slate' | 'emerald' | 'orange'
type TileSize  = 'half' | 'full'

interface Tile {
  id:       string
  label:    string
  sublabel: string
  icon:     React.ElementType
  href:     string
  color:    TileColor
  size:     TileSize
}

// ─── Paleta de colores ────────────────────────────────────────────────────────

const COLOR: Record<TileColor, { bg: string; border: string; icon: string; label: string }> = {
  red:     { bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: 'text-red-500',     label: 'text-red-700 dark:text-red-400' },
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    icon: 'text-blue-500',    label: 'text-blue-700 dark:text-blue-400' },
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: 'text-amber-500',   label: 'text-amber-700 dark:text-amber-400' },
  green:   { bg: 'bg-green-500/10',   border: 'border-green-500/30',   icon: 'text-green-500',   label: 'text-green-700 dark:text-green-400' },
  purple:  { bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  icon: 'text-purple-500',  label: 'text-purple-700 dark:text-purple-400' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-500', label: 'text-emerald-700 dark:text-emerald-400' },
  orange:  { bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  icon: 'text-orange-500',  label: 'text-orange-700 dark:text-orange-400' },
  slate:   { bg: 'bg-muted/60',       border: 'border-border',          icon: 'text-foreground',  label: 'text-foreground' },
}

// ─── Tiles por rol ────────────────────────────────────────────────────────────

const TILES: Record<UserRole, Tile[]> = {
  // TÉCNICO — trabaja en planta, necesita reportar rápido y acceder a manuales/repuestos
  tecnico: [
    { id: 'incidents', label: 'Nueva Incidencia',   sublabel: 'Levantar problema',    icon: AlertTriangle, href: '/incidents',      color: 'red',     size: 'full'  },
    { id: 'repuestos', label: 'Repuestos',           sublabel: 'Piezas & manuales',   icon: Package,       href: '/repuestos',      color: 'blue',    size: 'half'  },
    { id: 'evidencia', label: 'Foto-evidencia',      sublabel: 'Registrar imagen',    icon: Camera,        href: '/photo-evidence', color: 'slate',   size: 'half'  },
    { id: 'prevntv',   label: 'Preventivo',          sublabel: 'Mis tareas',          icon: CalendarClock, href: '/preventive',     color: 'amber',   size: 'half'  },
    { id: 'equipos',   label: 'Equipos',             sublabel: 'Ficha técnica',       icon: Wrench,        href: '/equipment',      color: 'slate',   size: 'half'  },
  ],

  // SUPERVISOR — valida incidencias, monitorea rendimiento y planifica
  supervisor: [
    { id: 'incidents', label: 'Incidencias',         sublabel: 'Revisar & validar',   icon: AlertTriangle, href: '/incidents',          color: 'red',     size: 'half'  },
    { id: 'grader',    label: 'Análisis Grader',     sublabel: 'Rendimiento piezas',  icon: BarChart3,     href: '/analisis-grader',    color: 'blue',    size: 'half'  },
    { id: 'inspecc',   label: 'Inspecciones',        sublabel: 'Rondas pendientes',   icon: Route,         href: '/inspections',         color: 'amber',   size: 'half'  },
    { id: 'mapa',      label: 'Mapa Planta',         sublabel: 'Vista de zonas',      icon: Map,           href: '/map',                color: 'emerald', size: 'half'  },
    { id: 'prevntv',   label: 'Plan Preventivo',     sublabel: 'Mantención programada', icon: CalendarClock, href: '/preventive',       color: 'slate',   size: 'full'  },
  ],

  // ADMIN — control total: alertas, sensores, config y análisis
  admin: [
    { id: 'incidents', label: 'Incidencias',         sublabel: 'Ver todas',           icon: AlertTriangle, href: '/incidents',          color: 'red',     size: 'half'  },
    { id: 'sensores',  label: 'Sensores',            sublabel: 'Monitor tiempo real', icon: Activity,      href: '/sensors/monitor',    color: 'green',   size: 'half'  },
    { id: 'grader',    label: 'Grader',              sublabel: 'Análisis de piezas',  icon: BarChart3,     href: '/analisis-grader',    color: 'blue',    size: 'half'  },
    { id: 'ett',       label: 'ETT',                 sublabel: 'Evaluaciones',        icon: FileText,      href: '/admin/ett',          color: 'purple',  size: 'half'  },
    { id: 'inspecc',   label: 'Inspecciones',        sublabel: 'Rondas & seguimiento', icon: ClipboardList, href: '/inspections',        color: 'amber',   size: 'half'  },
    { id: 'settings',  label: 'Configuración',       sublabel: 'Permisos & módulos',  icon: Settings,      href: '/settings',           color: 'slate',   size: 'half'  },
  ],

  // USUARIO BÁSICO — solo reporta y consulta
  usuario: [
    { id: 'incidents', label: 'Reportar Incidencia', sublabel: 'Levantar problema',   icon: AlertTriangle, href: '/incidents',      color: 'red',     size: 'full'  },
    { id: 'repuestos', label: 'Repuestos',           sublabel: 'Piezas & manuales',   icon: Package,       href: '/repuestos',      color: 'blue',    size: 'half'  },
    { id: 'equipos',   label: 'Equipos',             sublabel: 'Ficha de máquina',    icon: Wrench,        href: '/equipment',      color: 'slate',   size: 'half'  },
    { id: 'aprende',   label: 'Aprendizaje',         sublabel: 'Cursos & guías',      icon: GraduationCap, href: '/aprendizaje',    color: 'purple',  size: 'half'  },
    { id: 'evidencia', label: 'Evidencia',           sublabel: 'Foto-registros',      icon: Camera,        href: '/photo-evidence', color: 'slate',   size: 'half'  },
  ],
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  tecnico:    'Técnico',
  usuario:    'Usuario',
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function MobileHomeGrid() {
  const user = useAuthStore((s) => s.user)
  const role: UserRole = user?.rol ?? 'usuario'
  const tiles = TILES[role] ?? TILES.usuario
  const firstName = user?.nombre?.split(' ')[0] ?? 'Usuario'

  return (
    <div className="md:hidden px-4 pt-4 pb-2 space-y-4">

      {/* Saludo */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{getGreeting()}</p>
          <h2 className="text-lg font-semibold leading-tight">{firstName} 👋</h2>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
          {ROLE_LABEL[role]}
        </span>
      </div>

      {/* Grid de accesos */}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => {
          const c = COLOR[tile.color]
          const Icon = tile.icon
          const isFull = tile.size === 'full'

          return (
            <Link
              key={tile.id}
              to={tile.href}
              className={cn(
                'flex rounded-2xl border transition-all active:scale-[0.97] touch-manipulation',
                'min-h-[88px] select-none',
                c.bg, c.border,
                isFull
                  ? 'col-span-2 flex-row items-center gap-4 px-5 py-4 min-h-[72px]'
                  : 'flex-col gap-2 p-4',
              )}
            >
              {/* Ícono */}
              <div className={cn(
                'rounded-xl flex items-center justify-center shrink-0',
                isFull ? 'w-10 h-10' : 'w-9 h-9',
                c.bg,
              )}>
                <Icon className={cn('h-5 w-5', c.icon)} />
              </div>

              {/* Texto */}
              <div className="flex-1 min-w-0">
                <p className={cn('font-semibold text-sm leading-tight', c.label)}>
                  {tile.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                  {tile.sublabel}
                </p>
              </div>

              {/* Flecha en tiles full-width */}
              {isFull && (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </Link>
          )
        })}
      </div>

    </div>
  )
}
