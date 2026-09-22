import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Package, Camera, CalendarClock, Wrench,
  BarChart3, Map, Route, Activity, Settings, FileText,
  GraduationCap, ChevronRight, ClipboardList, CloudSun,
  Box, Cpu, FolderTree, MapPin, TrendingUp, Monitor, Menu,
  QrCode, Share2, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { cn } from '@/lib/utils'
import { ListGroup, ListCell, Pill } from '@/components/piel'
import { BitacoraTurnoCard } from '@/components/bitacora/BitacoraTurnoCard'
import { useAuthStore, useAppStore } from '@/store'
import { useWipOverrides } from '@/hooks/useWipOverrides'
import type { UserRole } from '@/types'
import { LEARNING_MACHINES } from '@/data/learningMachines'
import { PLANT_LINES, PLANTS, type PlantLineId } from '@/config/plantLines'
import { toast } from '@/hooks/useToast'
import {
  lineaConMonitor, rutaMonitor, tokenMonitorDeLinea, turnoEnCursoDePlanta,
} from '@/services/shoplogix/monitorDeLinea'

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
  /**
   * Accesos subordinados, siempre visibles (no acordeón): el padre sigue
   * siendo destino y llegar a una línea cuesta UN toque, que es lo que se
   * pidió. Se dibujan con `ListCell variant="child"`.
   */
  children?: Tile[]
  /**
   * La línea tiene acceso directo a su monitor: bajo la celda va «Monitor
   * <área>», que lo abre en UN toque (antes eran ~4 pasando por Análisis de
   * Turno). Ver `LINEAS_CON_MONITOR`.
   */
  monitorDe?: PlantLineId
}

/*
 * Las líneas con Shoplogix, tal como las declara `plantLines.ts`: si mañana se
 * instrumenta Empaque, aparece sola. Escribirlas a mano acá sería una segunda
 * fuente de verdad que se desincroniza en silencio.
 * El texto va PLANTA · PROCESO porque los labels del config mezclan los dos
 * ejes («P. Principal», «Filete») y en una lista de tres no se distinguen.
 */
const LINEAS_ANALISIS: Tile[] = PLANT_LINES
  .filter((l) => l.shoplogixEnabled)
  /* Agrupadas por planta: leer «Principal, Yal, Principal» obliga a volver
     atrás. Con las dos de la principal juntas la lista se lee 2 + 1. */
  .slice()
  .sort((a, b) => PLANTS.findIndex((p) => p.id === a.plant) - PLANTS.findIndex((p) => p.id === b.plant))
  .map((l) => ({
    id: `analisis-${l.id}`,
    label: `${PLANTS.find((p) => p.id === l.plant)?.label.replace(/^Planta /, '') ?? l.label} · ${l.areaLabel}`,
    sublabel: '',
    icon: BarChart3,
    href: `/analisis-grader?linea=${l.id}`,
    color: 'blue' as TileColor,
    monitorDe: lineaConMonitor(l.id)?.id,
  }))

interface TileGroup {
  label: string
  tiles: Tile[]
}

// ─── Paleta de colores ────────────────────────────────────────────────────────


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
        { id: 'incidents', label: 'Nueva incidencia',  sublabel: 'Levantar problema',   icon: AlertTriangle, href: '/incidents',      color: 'red',   cta: true },
        { id: 'repuestos', label: 'Repuestos',          sublabel: 'Piezas y manuales',  icon: Package,       href: '/repuestos',      color: 'blue'  },
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
        { id: 'incidents', label: 'Incidencias',   sublabel: 'Revisar y validar',  icon: AlertTriangle, href: '/incidents',       color: 'red'    },
        { id: 'grader',    label: 'Análisis de turno', sublabel: 'Rendimiento',      icon: BarChart3,     href: '/analisis-grader', color: 'blue', children: LINEAS_ANALISIS },
        { id: 'inspecc',   label: 'Inspecciones',  sublabel: 'Rondas',             icon: Route,         href: '/inspections',     color: 'amber',  wip: true },
        { id: 'prevntv',   label: 'Preventivo',    sublabel: 'Plan mantención',    icon: CalendarClock, href: '/preventive',      color: 'amber',  wip: true },
        { id: 'sensores',  label: 'Sensores',      sublabel: 'Monitor real',       icon: Activity,      href: '/sensors/monitor', color: 'green',  wip: true },
        { id: 'ctd',       label: 'Centro téc. documental', sublabel: 'Programa EMP · NFPA 70B', icon: ClipboardList, href: '/centro-tecnico-documental', color: 'purple' },
      ],
    },
    {
      label: 'Recursos',
      tiles: [
        { id: 'repuestos', label: 'Repuestos',     sublabel: 'Stock y manuales',   icon: Package,       href: '/repuestos',       color: 'blue'    },
        { id: 'equipos',   label: 'Equipos',       sublabel: 'Ficha técnica',      icon: Wrench,        href: '/equipment',       color: 'slate'   },
        { id: 'mapa',      label: 'Mapa de planta',   sublabel: 'Vista de zonas',     icon: Map,           href: '/map',             color: 'emerald' },
        { id: 'clima',     label: 'Clima del puerto',  sublabel: 'Condiciones',        icon: CloudSun,      href: '/clima-puerto',    color: 'slate'   },
      ],
    },
    { label: 'Formación', tiles: FORMACION_TILES },
  ],

  admin: [
    {
      label: 'Operaciones',
      tiles: [
        { id: 'incidents', label: 'Incidencias',     sublabel: 'Ver todas',         icon: AlertTriangle, href: '/incidents',       color: 'red'   },
        { id: 'repuestos', label: 'Repuestos',        sublabel: 'Piezas y manuales', icon: Package,       href: '/repuestos',       color: 'blue'  },
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
      label: 'Análisis y monitoreo',
      tiles: [
        { id: 'grader',   label: 'Análisis de turno', sublabel: '',                icon: BarChart3, href: '/analisis-grader', color: 'blue', children: LINEAS_ANALISIS },
        { id: 'sensores', label: 'Sensores',       sublabel: 'Tiempo real',        icon: Activity,  href: '/sensors/monitor', color: 'green',  wip: true },
        { id: 'mapa',     label: 'Mapa de planta',   sublabel: 'Zonas',              icon: Map,       href: '/map',             color: 'emerald' },
        { id: 'clima',    label: 'Clima del puerto',  sublabel: 'Condiciones',        icon: CloudSun,  href: '/clima-puerto',    color: 'slate'   },
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
        { id: 'mapas',    label: 'Editor de mapas',  sublabel: 'Zonas y áreas',  icon: MapPin,    href: '/admin/maps',   color: 'emerald' },
        { id: 'settings', label: 'Configuración', sublabel: 'Permisos',       icon: Settings,  href: '/settings',    color: 'slate'   },
      ],
    },
  ],

  usuario: [
    {
      label: 'Reportar',
      tiles: [
        { id: 'incidents', label: 'Reportar incidencia', sublabel: 'Levantar problema', icon: AlertTriangle, href: '/incidents',      color: 'red',   cta: true },
        { id: 'evidencia', label: 'Foto-evidencia',       sublabel: 'Registrar imagen',  icon: Camera,       href: '/photo-evidence', color: 'slate' },
        { id: 'equipos',   label: 'Equipos',              sublabel: 'Ficha de máquina',  icon: Wrench,       href: '/equipment',      color: 'slate' },
      ],
    },
    {
      label: 'Consultar',
      tiles: [
        { id: 'repuestos', label: 'Repuestos',    sublabel: 'Piezas y manuales', icon: Package,  href: '/repuestos',    color: 'blue'  },
        { id: 'clima',     label: 'Clima del puerto', sublabel: 'Condiciones',       icon: CloudSun, href: '/clima-puerto', color: 'slate' },
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

// ─── CTA Tile ─────────────────────────────────────────────────────────────────

function CtaTile({ tile, showWip, onRelease }: { tile: Tile; showWip: boolean; onRelease?: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const Icon = tile.icon

  // DESIGN.md §10: el tile del Home es NEUTRO (igual que el móvil). El color de
  // estado no vive en un acceso directo; la cinta rotada de 6,5 px pasa a ser
  // una etiqueta de 11 px en formato oración.
  return (
    <Link
      to={tile.href}
      className={cn(
        'relative mb-2 flex min-h-[44px] items-center gap-3 overflow-hidden rounded-card border border-border bg-card px-4 py-3.5',
        'transition-all active:scale-[0.98] touch-manipulation select-none hover:bg-accent',
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-ctl bg-muted-foreground/[0.12]">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-semibold leading-tight text-foreground">{tile.label}</p>
        {tile.sublabel && <p className="mt-0.5 text-footnote text-muted-foreground">{tile.sublabel}</p>}
      </div>
      {showWip && !confirming && (
        <span
          onClick={onRelease ? (e) => { e.preventDefault(); setConfirming(true) } : undefined}
          className={cn('shrink-0 rounded-full bg-muted px-2 py-0.5 text-caption font-semibold text-muted-foreground', onRelease && 'cursor-pointer')}
        >
          En desarrollo
        </span>
      )}
      {confirming && (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            aria-label="Liberar"
            onClick={(e) => { e.preventDefault(); onRelease?.(); setConfirming(false) }}
            className="flex size-9 items-center justify-center rounded-full bg-emerald-500/[0.15] text-ink-ok active:scale-90"
          >✓</button>
          <button
            type="button"
            aria-label="Cancelar"
            onClick={(e) => { e.preventDefault(); setConfirming(false) }}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground active:scale-90"
          >✗</button>
        </div>
      )}
      {!confirming && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </Link>
  )
}

// ─── Acceso directo al monitor de una línea ──────────────────────────────────

/**
 * «Monitor Eviscerado» bajo su línea, con el estado del turno a la derecha.
 * Un poco más adentro que la línea y en el tinte de acción: es un destino
 * distinto del análisis, no otra línea. Título en subhead y sangría corta: a
 * 375 px, en body y con la sangría completa, «Monitor Eviscerado» se partía
 * en dos renglones junto a la píldora.
 */
function MonitorCell({ lineId }: { lineId: PlantLineId }) {
  const navigate = useNavigate()
  const linea = lineaConMonitor(lineId)
  const [enTurno, setEnTurno] = useState<boolean | null>(null)
  const [abriendo, setAbriendo] = useState(false)

  useEffect(() => {
    if (!linea) return
    let vivo = true
    // Sin el estado la fila igual sirve: un error de lectura deja la píldora fuera.
    turnoEnCursoDePlanta(linea.plantSlug)
      .then((v) => { if (vivo) setEnTurno(v) })
      .catch(() => { /* sin estado */ })
    return () => { vivo = false }
  }, [linea])

  if (!linea) return null

  const abrir = async () => {
    if (abriendo) return
    setAbriendo(true)
    try {
      navigate(rutaMonitor(await tokenMonitorDeLinea(linea)))
    } catch (err) {
      toast({
        title: 'No se pudo abrir el monitor',
        description: err instanceof Error ? err.message : 'Inténtalo de nuevo en un momento.',
        variant: 'destructive',
      })
      setAbriendo(false)
    }
  }

  return (
    <ListCell
      leading={
        <span className="ml-5 flex size-7 items-center justify-center" aria-hidden>
          <Monitor className="size-[18px] text-primary" />
        </span>
      }
      className="before:left-[4.75rem]"
      title={<span className="whitespace-nowrap text-subhead font-semibold text-primary">Monitor {linea.areaLabel}</span>}
      trailing={
        abriendo
          ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Abriendo" />
          : enTurno == null
            ? undefined
            : <Pill tone={enTurno ? 'ok' : 'neutral'} dot>{enTurno ? 'En turno' : 'Sin turno'}</Pill>
      }
      chevron={false}
      onClick={() => { void abrir() }}
    />
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
    <div className="rounded-card border border-border bg-muted overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 active:bg-muted/80 transition-colors touch-manipulation"
      >
        <QrCode className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-medium text-left">Compartir app</span>
        <span className="text-caption text-muted-foreground mr-1">Invitar usuarios</span>
        {open
          ? <ChevronUp   className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col items-center gap-3 border-t border-border/60 pt-3">
          <div className="p-2 bg-white rounded-card shadow-sm">
            <QRCodeSVG value={appUrl} size={148} level="M" />
          </div>
          <p className="text-xs text-center text-muted-foreground leading-snug max-w-[200px]">
            Escanea para abrir la app.<br />
            Inicia sesión con <strong>Google</strong> o con tu cuenta si ya estás registrado.
          </p>
          <p className="text-caption text-muted-foreground truncate max-w-[240px] font-mono">{appUrl}</p>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-card bg-primary text-primary-foreground active:opacity-80 transition-opacity touch-manipulation"
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
          className="size-11 rounded-full bg-muted flex items-center justify-center shrink-0 active:scale-90 transition-transform touch-manipulation"
          aria-label="Menú"
        >
          <Menu className="h-4 w-4 text-foreground" />
        </button>

        {/* Nombre */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{getGreeting()}</p>
          <h2 className="text-lg font-semibold leading-tight truncate">{firstName}</h2>
        </div>

        {/* Badge de rol */}
        <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium shrink-0">
          {ROLE_LABEL[role]}
        </span>
      </div>

      {/* Bitácora del turno en curso: lo primero al abrir la app en el celular. */}
      <BitacoraTurnoCard />

      {/* Grupos */}
      {groups.map((group) => {
        const ctaTile   = group.tiles.find((t) => t.cta)
        const chipTiles = group.tiles.filter((t) => !t.cta)

        return (
          <div key={group.label} className="space-y-1.5">
            <p className="text-caption font-semibold tracking-widest text-muted-foreground px-0.5">
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
                {chipTiles.flatMap((tile) => {
                  const Icon = tile.icon
                  const wip = isWip(tile.id, tile.wip)
                  // Tile NEUTRO (systemFill + glifo secundario), no tintado con el
                  // glifo en el tono 500 vivo: con 12 filas era neon sobre oscuro
                  // (13 glifos #FF9F0A a saturacion 1.0, mas rojo, verde y purpura).
                  // DESIGN.md §3: el color no va en el icono de una celda. El mapa
                  // COLOR sigue vivo para la variante de escritorio (~linea 296).
                  // Y "En desarrollo" va en Pill neutral, no warning: es un estado,
                  // no una advertencia — con warning eran 13 textos en amber vivo.
                  return [
                    <ListCell
                      key={tile.id}
                      leading={
                        <span className="flex size-7 items-center justify-center rounded-ctl bg-muted-foreground/[0.12]">
                          <Icon className="size-4 text-muted-foreground" />
                        </span>
                      }
                      title={tile.label}
                      trailing={wip ? <Pill tone="neutral">En desarrollo</Pill> : undefined}
                      onClick={() => navigate(tile.href)}
                    />,
                    /* Los hijos van en la MISMA tarjeta que el padre: una card
                       aparte los volvería un grupo hermano y se perdería de
                       quién dependen (§7). */
                    ...(tile.children ?? []).flatMap((hijo) => [
                      <ListCell
                        key={hijo.id}
                        variant="child"
                        title={hijo.label}
                        onClick={() => navigate(hijo.href)}
                      />,
                      ...(hijo.monitorDe && (role === 'admin' || role === 'supervisor')
                        ? [<MonitorCell key={`monitor-${hijo.monitorDe}`} lineId={hijo.monitorDe} />]
                        : []),
                    ]),
                  ]
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
