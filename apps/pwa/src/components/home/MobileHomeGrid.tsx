import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Package, Camera, CalendarClock, Wrench,
  BarChart3, Map, Route, Activity, Settings, FileText,
  GraduationCap, ChevronRight, ClipboardList, CloudSun,
  Box, Cpu, FolderTree, MapPin, TrendingUp, Monitor, Menu,
  QrCode, Share2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { cn } from '@/lib/utils'
import { ListGroup, ListCell, Pill } from '@/components/piel'
import { useAuthStore, useAppStore } from '@/store'
import { useWipOverrides } from '@/hooks/useWipOverrides'
import type { UserRole } from '@/types'
import { LEARNING_MACHINES } from '@/data/learningMachines'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TileColor = 'red' | 'blue' | 'amber' | 'green' | 'purple' | 'slate' | 'emerald' | 'orange'

interface Tile {
  id:       string
  label:    string
  sublabel: string
  icon:     React.ElementType
  href:     string
  color:    TileColor
  cta?:     boolean
  /** WIP estático — se mezcla con overrides de Firestore */
  wip?:     boolean
}

interface TileGroup {
  label: string
  tiles: Tile[]
}

// ─── Paleta de colores ────────────────────────────────────────────────────────

const COLOR: Record<TileColor, { bg: string; border: string; icon: string; label: string }> = {
  red:     { bg: 'bg-red-500/15',     border: 'border-red-500/30',     icon: 'text-red-500',     label: 'text-red-700 dark:text-red-400' },
  blue:    { bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    icon: 'text-blue-500',    label: 'text-blue-700 dark:text-blue-400' },
  amber:   { bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   icon: 'text-amber-500',   label: 'text-amber-700 dark:text-amber-400' },
  green:   { bg: 'bg-green-500/15',   border: 'border-green-500/30',   icon: 'text-green-500',   label: 'text-green-700 dark:text-green-400' },
  purple:  { bg: 'bg-purple-500/15',  border: 'border-purple-500/30',  icon: 'text-purple-500',  label: 'text-purple-700 dark:text-purple-400' },
  emerald: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', icon: 'text-emerald-500', label: 'text-emerald-700 dark:text-emerald-400' },
  orange:  { bg: 'bg-orange-500/15',  border: 'border-orange-500/30',  icon: 'text-orange-500',  label: 'text-orange-700 dark:text-orange-400' },
  slate:   { bg: 'bg-muted/60',       border: 'border-border',          icon: 'text-muted-foreground',  label: 'text-foreground' },
}

// ─── Tiles de formación generados desde el catálogo ──────────────────────────

const MACHINE_TILES: Tile[] = LEARNING_MACHINES.map((m) => ({
  id:       `m-${m.slug}`,
  label:    m.name,
  sublabel: '',
  icon:     m.icon,
  href:     m.customRoute ?? `/aprendizaje/maquina/${m.slug}`,
  color:    'blue' as TileColor,
  // WIP automático si ninguna sección tiene contenido
  wip:      !Object.values(m.sections).some(Boolean),
}))

// HMI tiles para roles NO admin (admin los tiene en Herramientas sin duplicar)
const HMI_TILES_BASE: Tile[] = [
  { id: 'hmi-knuro',  label: 'HMI Knuro',  sublabel: '', icon: Cpu,     href: '/aprendizaje/hmi-knuro',  color: 'slate' },
  { id: 'hmi-grader', label: 'HMI Grader', sublabel: '', icon: Monitor, href: '/aprendizaje/hmi-grader', color: 'slate' },
]

// Para admin: sin HMI en Formación — ambos HMI están en Herramientas
const HMI_TILES_ADMIN: Tile[] = []

const FORMACION_TILES: Tile[] = [
  ...MACHINE_TILES,
  ...HMI_TILES_BASE,
  { id: 'hub', label: 'Ver hub →', sublabel: '', icon: GraduationCap, href: '/aprendizaje', color: 'purple' },
]

// Admin: Baader 200 ya está en MACHINE_TILES via formación — no duplicar en Herramientas
const FORMACION_TILES_ADMIN: Tile[] = [
  ...MACHINE_TILES,
  ...HMI_TILES_ADMIN,
  { id: 'hub', label: 'Ver hub →', sublabel: '', icon: GraduationCap, href: '/aprendizaje', color: 'purple' },
]

// ─── Grupos por rol ───────────────────────────────────────────────────────────

const GROUPS: Record<UserRole, TileGroup[]> = {

  tecnico: [
    {
      label: 'Trabajo en planta',
      tiles: [
        { id: 'incidents', label: 'Nueva Incidencia',  sublabel: 'Levantar problema',   icon: AlertTriangle, href: '/incidents',      color: 'red',   cta: true },
        { id: 'repuestos', label: 'Repuestos',          sublabel: 'Piezas & manuales',  icon: Package,       href: '/repuestos',      color: 'blue'  },
        { id: 'equipos',   label: 'Equipos',            sublabel: 'Ficha técnica',      icon: Wrench,        href: '/equipment',      color: 'slate' },
        { id: 'prevntv',   label: 'Preventivo',         sublabel: 'Mis tareas',         icon: CalendarClock, href: '/preventive',     color: 'amber',  wip: true },
        { id: 'evidencia', label: 'Foto-evidencia',     sublabel: 'Registrar imagen',   icon: Camera,        href: '/photo-evidence', color: 'slate' },
      ],
    },
    { label: 'Formación', tiles: FORMACION_TILES },
  ],

  supervisor: [
    {
      label: 'Seguimiento',
      tiles: [
        { id: 'incidents', label: 'Incidencias',   sublabel: 'Revisar & validar',  icon: AlertTriangle, href: '/incidents',       color: 'red'    },
        { id: 'grader',    label: 'Grader',        sublabel: 'Rendimiento',         icon: BarChart3,     href: '/analisis-grader', color: 'blue'   },
        { id: 'inspecc',   label: 'Inspecciones',  sublabel: 'Rondas',             icon: Route,         href: '/inspections',     color: 'amber',  wip: true },
        { id: 'prevntv',   label: 'Preventivo',    sublabel: 'Plan mantención',    icon: CalendarClock, href: '/preventive',      color: 'amber',  wip: true },
        { id: 'sensores',  label: 'Sensores',      sublabel: 'Monitor real',       icon: Activity,      href: '/sensors/monitor', color: 'green',  wip: true },
        { id: 'ctd',       label: 'Centro Téc. Documental', sublabel: 'Programa EMP · NFPA 70B', icon: ClipboardList, href: '/centro-tecnico-documental', color: 'purple' },
      ],
    },
    {
      label: 'Recursos',
      tiles: [
        { id: 'repuestos', label: 'Repuestos',     sublabel: 'Stock & manuales',   icon: Package,       href: '/repuestos',       color: 'blue'    },
        { id: 'equipos',   label: 'Equipos',       sublabel: 'Ficha técnica',      icon: Wrench,        href: '/equipment',       color: 'slate'   },
        { id: 'mapa',      label: 'Mapa Planta',   sublabel: 'Vista de zonas',     icon: Map,           href: '/map',             color: 'emerald' },
        { id: 'clima',     label: 'Clima Puerto',  sublabel: 'Condiciones',        icon: CloudSun,      href: '/clima-puerto',    color: 'slate'   },
      ],
    },
    { label: 'Formación', tiles: FORMACION_TILES },
  ],

  admin: [
    {
      label: 'Operaciones',
      tiles: [
        { id: 'incidents', label: 'Incidencias',     sublabel: 'Ver todas',         icon: AlertTriangle, href: '/incidents',       color: 'red'   },
        { id: 'repuestos', label: 'Repuestos',        sublabel: 'Piezas & manuales', icon: Package,       href: '/repuestos',       color: 'blue'  },
        { id: 'equipos',   label: 'Equipos',          sublabel: 'Ficha técnica',     icon: Wrench,        href: '/equipment',       color: 'slate' },
        { id: 'evidencia', label: 'Foto-evidencia',   sublabel: 'Foto-registros',    icon: Camera,        href: '/photo-evidence',  color: 'slate' },
      ],
    },
    {
      label: 'Planificación',
      tiles: [
        { id: 'inspecc',   label: 'Inspecciones',  sublabel: 'Rondas',           icon: ClipboardList, href: '/inspections', color: 'amber',  wip: true },
        { id: 'prevntv',   label: 'Preventivo',    sublabel: 'Plan mantención',  icon: CalendarClock, href: '/preventive',  color: 'amber',  wip: true },
        { id: 'gantt',     label: 'Gantt',         sublabel: 'Planificador',     icon: TrendingUp,    href: '/gantt',       color: 'orange', wip: true },
      ],
    },
    {
      label: 'Análisis & monitoreo',
      tiles: [
        { id: 'grader',   label: 'Grader',        sublabel: 'Análisis de piezas', icon: BarChart3, href: '/analisis-grader', color: 'blue'    },
        { id: 'sensores', label: 'Sensores',       sublabel: 'Tiempo real',        icon: Activity,  href: '/sensors/monitor', color: 'green',  wip: true },
        { id: 'mapa',     label: 'Mapa Planta',   sublabel: 'Zonas',              icon: Map,       href: '/map',             color: 'emerald' },
        { id: 'clima',    label: 'Clima Puerto',  sublabel: 'Condiciones',        icon: CloudSun,  href: '/clima-puerto',    color: 'slate'   },
      ],
    },
    {
      label: 'Herramientas',
      tiles: [
        { id: 'visor3d',    label: 'Visor 3D',    sublabel: 'Modelos 3D',  icon: Box,     href: '/visor-3d',              color: 'slate' },
        { id: 'hmi',        label: 'HMI Knuro',   sublabel: 'Simulador',   icon: Cpu,     href: '/hmi-knuro',             color: 'slate' },
        { id: 'hmi-grader', label: 'HMI Grader',  sublabel: 'Simulador',   icon: Monitor, href: '/aprendizaje/hmi-grader', color: 'slate' },
        // Baader 200 NO aparece aquí — ya está en Formación via MACHINE_TILES
      ],
    },
    // Formación admin: sin HMI Knuro (está en Herramientas arriba)
    { label: 'Formación', tiles: FORMACION_TILES_ADMIN },
    {
      label: 'Administración',
      tiles: [
        { id: 'ett',      label: 'ETT',           sublabel: 'Evaluaciones',   icon: FileText,  href: '/admin/ett',    color: 'purple'  },
        { id: 'jerarq',   label: 'Jerarquías',    sublabel: 'Estructura SAP', icon: FolderTree, href: '/hierarchy',   color: 'slate'   },
        { id: 'mapas',    label: 'Editor Mapas',  sublabel: 'Zonas & áreas',  icon: MapPin,    href: '/admin/maps',   color: 'emerald' },
        { id: 'settings', label: 'Configuración', sublabel: 'Permisos',       icon: Settings,  href: '/settings',    color: 'slate'   },
      ],
    },
  ],

  usuario: [
    {
      label: 'Reportar',
      tiles: [
        { id: 'incidents', label: 'Reportar Incidencia', sublabel: 'Levantar problema', icon: AlertTriangle, href: '/incidents',      color: 'red',   cta: true },
        { id: 'evidencia', label: 'Foto-evidencia',       sublabel: 'Registrar imagen',  icon: Camera,       href: '/photo-evidence', color: 'slate' },
        { id: 'equipos',   label: 'Equipos',              sublabel: 'Ficha de máquina',  icon: Wrench,       href: '/equipment',      color: 'slate' },
      ],
    },
    {
      label: 'Consultar',
      tiles: [
        { id: 'repuestos', label: 'Repuestos',    sublabel: 'Piezas & manuales', icon: Package,  href: '/repuestos',    color: 'blue'  },
        { id: 'clima',     label: 'Clima Puerto', sublabel: 'Condiciones',       icon: CloudSun, href: '/clima-puerto', color: 'slate' },
      ],
    },
    { label: 'Formación', tiles: FORMACION_TILES },
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

// ─── WIP Ribbon ───────────────────────────────────────────────────────────────

interface WipRibbonProps {
  variant?: 'chip' | 'cta'
  /** Admin: callback para iniciar confirmación de liberación */
  onTap?: (e: React.MouseEvent) => void
}

function WipRibbon({ variant = 'chip', onTap }: WipRibbonProps) {
  if (variant === 'cta') {
    return (
      <button
        onClick={onTap}
        className={cn(
          'shrink-0 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 leading-none',
          onTap ? 'active:scale-95 cursor-pointer' : 'pointer-events-none',
        )}
      >
        🚧 en desarrollo
      </button>
    )
  }
  // Ribbon diagonal para chips
  return (
    <div
      onClick={onTap}
      className={cn(
        'absolute inset-0 overflow-hidden rounded-xl z-10',
        onTap ? 'cursor-pointer' : 'pointer-events-none',
      )}
    >
      <div
        className="absolute bg-amber-400 text-amber-950 font-bold text-[6.5px] tracking-tight uppercase text-center leading-none py-[3.5px] shadow-sm"
        style={{ width: '88px', top: '12px', right: '-22px', transform: 'rotate(38deg)' }}
      >
        en desarrollo
      </div>
    </div>
  )
}

// ─── CTA Tile ─────────────────────────────────────────────────────────────────

function CtaTile({ tile, showWip, onRelease }: { tile: Tile; showWip: boolean; onRelease?: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const c = COLOR[tile.color]
  const Icon = tile.icon

  return (
    <Link
      to={tile.href}
      className={cn(
        'flex items-center gap-3 px-4 py-3.5 rounded-xl border mb-2 overflow-hidden relative',
        'transition-all active:scale-[0.98] touch-manipulation select-none',
        c.bg, c.border,
      )}
    >
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', c.bg)}>
        <Icon className={cn('h-5 w-5', c.icon)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('font-semibold text-sm leading-tight', c.label)}>{tile.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{tile.sublabel}</p>
      </div>
      {showWip && !confirming && (
        <WipRibbon
          variant="cta"
          onTap={onRelease ? (e) => { e.preventDefault(); setConfirming(true) } : undefined}
        />
      )}
      {confirming && (
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={(e) => { e.preventDefault(); onRelease?.(); setConfirming(false) }}
            className="text-[11px] bg-emerald-500 text-white rounded-lg w-7 h-7 flex items-center justify-center active:scale-90 font-bold"
          >✓</button>
          <button
            onClick={(e) => { e.preventDefault(); setConfirming(false) }}
            className="text-[11px] bg-muted text-muted-foreground rounded-lg w-7 h-7 flex items-center justify-center active:scale-90"
          >✗</button>
        </div>
      )}
      {!confirming && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </Link>
  )
}

// ─── QR Compartir App ─────────────────────────────────────────────────────────

function AppShareCard() {
  const [open, setOpen] = useState(false)
  const appUrl = `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`.replace(/([^:])\/\/+/g, '$1/')

  async function handleShare() {
    if (navigator.share) {
      await navigator.share({ title: 'App Planta Antarfood', url: appUrl }).catch(() => {/* cancelado */})
    } else {
      await navigator.clipboard.writeText(appUrl)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 active:bg-muted/80 transition-colors touch-manipulation"
      >
        <QrCode className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-medium text-left">Compartir app</span>
        <span className="text-[10px] text-muted-foreground mr-1">Invitar usuarios</span>
        {open
          ? <ChevronUp   className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col items-center gap-3 border-t border-border/60 pt-3">
          <div className="p-2 bg-white rounded-xl shadow-sm">
            <QRCodeSVG value={appUrl} size={148} level="M" />
          </div>
          <p className="text-xs text-center text-muted-foreground leading-snug max-w-[200px]">
            Escanea para abrir la app.<br />
            Inicia sesión con <strong>Google</strong> o con tu cuenta si ya estás registrado.
          </p>
          <p className="text-[10px] text-muted-foreground truncate max-w-[240px] font-mono">{appUrl}</p>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground active:opacity-80 transition-opacity touch-manipulation"
          >
            <Share2 className="h-3.5 w-3.5" />
            Compartir enlace
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MobileHomeGrid() {
  const navigate = useNavigate()
  const user           = useAuthStore((s) => s.user)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const role: UserRole = user?.rol ?? 'usuario'
  const groups         = GROUPS[role] ?? GROUPS.usuario
  const firstName      = user?.nombre?.split(' ')[0] ?? 'Usuario'
  const { isWip, toggleRelease, isAdmin } = useWipOverrides()

  return (
    <div className="md:hidden px-4 pt-4 pb-6 space-y-5">

      {/* Saludo + botón menú */}
      <div className="flex items-center gap-3">
        {/* Botón Menú — a la izquierda del nombre */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 active:scale-90 transition-transform touch-manipulation"
          aria-label="Menú"
        >
          <Menu className="h-4 w-4 text-foreground" />
        </button>

        {/* Nombre */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{getGreeting()}</p>
          <h2 className="text-lg font-semibold leading-tight truncate">{firstName} 👋</h2>
        </div>

        {/* Badge de rol */}
        <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium shrink-0">
          {ROLE_LABEL[role]}
        </span>
      </div>

      {/* Grupos */}
      {groups.map((group) => {
        const ctaTile   = group.tiles.find((t) => t.cta)
        const chipTiles = group.tiles.filter((t) => !t.cta)

        return (
          <div key={group.label} className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5">
              {group.label}
            </p>

            {ctaTile && (
              <CtaTile
                tile={ctaTile}
                showWip={isWip(ctaTile.id, ctaTile.wip)}
                onRelease={isAdmin ? () => toggleRelease(ctaTile.id) : undefined}
              />
            )}

            {chipTiles.length > 0 && (
              /*
                LISTA AGRUPADA, no una grilla de mosaicos de color.
                Esta es LA diferencia que se nota al comparar con un iPhone:
                dentro de una app de iOS no hay mosaicos tintados —eso es
                lenguaje de launcher— hay filas con ícono, título y chevron,
                como Ajustes. La grilla obligaba además a desplazar en
                horizontal, que en iOS solo se usa para carruseles de
                contenido, nunca para navegar.
              */
              <ListGroup>
                {chipTiles.map((tile) => {
                  const c = COLOR[tile.color]
                  const Icon = tile.icon
                  const wip = isWip(tile.id, tile.wip)
                  return (
                    <ListCell
                      key={tile.id}
                      leading={
                        <span className={cn('flex size-7 items-center justify-center rounded-ctl', c.bg)}>
                          <Icon className={cn('size-4', c.icon)} />
                        </span>
                      }
                      title={tile.label}
                      trailing={wip ? <Pill tone="warning">En desarrollo</Pill> : undefined}
                      onClick={() => navigate(tile.href)}
                    />
                  )
                })}
              </ListGroup>
            )}
          </div>
        )
      })}

      {/* Compartir QR */}
      <AppShareCard />

    </div>
  )
}
