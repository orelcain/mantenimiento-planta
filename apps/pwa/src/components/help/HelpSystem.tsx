import { useState, useEffect, createContext, useContext, ReactNode } from 'react'
import {
  HelpCircle,
  X,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  AlertTriangle,
  Map,
  Wrench,
  CalendarClock,
  Settings,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Badge,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuthStore, useIsAdmin } from '@/store'

// Contexto para el sistema de ayuda
interface HelpContextType {
  showHelp: boolean
  setShowHelp: (show: boolean) => void
  currentTip: string | null
  setCurrentTip: (tip: string | null) => void
  hasSeenTour: boolean
  completeTour: () => void
}

const HelpContext = createContext<HelpContextType | null>(null)

export function useHelp() {
  const context = useContext(HelpContext)
  if (!context) {
    throw new Error('useHelp must be used within HelpProvider')
  }
  return context
}

// Provider
export function HelpProvider({ children }: { children: ReactNode }) {
  const [showHelp, setShowHelp] = useState(false)
  const [currentTip, setCurrentTip] = useState<string | null>(null)
  const [hasSeenTour, setHasSeenTour] = useState(() => {
    return localStorage.getItem('help-tour-completed') === 'true'
  })

  const completeTour = () => {
    setHasSeenTour(true)
    localStorage.setItem('help-tour-completed', 'true')
  }

  return (
    <HelpContext.Provider 
      value={{ showHelp, setShowHelp, currentTip, setCurrentTip, hasSeenTour, completeTour }}
    >
      {children}
    </HelpContext.Provider>
  )
}

// Definición de pasos del tour
interface TourStep {
  id: string
  title: string
  description: string
  icon: typeof LayoutDashboard
  forAdmin?: boolean
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Vista general con estadísticas de incidencias, equipos y alertas críticas. Desde aquí puedes ver el estado general de la planta.',
    icon: LayoutDashboard,
  },
  {
    id: 'incidents',
    title: 'Incidencias',
    description: 'Reporta y gestiona problemas en la planta. Puedes crear nuevas incidencias, filtrar por estado/prioridad y dar seguimiento.',
    icon: AlertTriangle,
  },
  {
    id: 'preventive',
    title: 'Mantenimiento Preventivo',
    description: 'Programa y gestiona tareas de mantenimiento preventivo. Evita fallas configurando revisiones periódicas.',
    icon: CalendarClock,
  },
  {
    id: 'map',
    title: 'Mapa de Planta',
    description: 'Vista visual de las zonas de la planta. Los colores indican el estado: 🟢 Sin problemas, 🔵 Medio, 🟠 Alto, 🔴 Crítico.',
    icon: Map,
  },
  {
    id: 'equipment',
    title: 'Equipos',
    description: 'Inventario de maquinaria y equipos. Registra información técnica, ubicación y estado de cada equipo.',
    icon: Wrench,
  },
  {
    id: 'settings',
    title: 'Configuración',
    description: 'Solo administradores. Gestiona usuarios, zonas, categorías y configuración general del sistema.',
    icon: Settings,
    forAdmin: true,
  },
]

// Flujo de trabajo
const WORKFLOW_STEPS = [
  {
    step: 1,
    title: 'Configurar Planta',
    description: 'El administrador sube el plano y crea las zonas de trabajo',
    tasks: [
      'Subir imagen del plano de planta',
      'Dibujar zonas con la herramienta de polígonos',
      'Asignar nombres y tipos a cada zona',
    ],
    forAdmin: true,
  },
  {
    step: 2,
    title: 'Reportar Incidencias',
    description: 'Los usuarios reportan problemas encontrados',
    tasks: [
      'Ir a Incidencias → Nueva Incidencia',
      'Seleccionar la zona afectada',
      'Describir el problema y prioridad',
      'Agregar fotos si es necesario',
    ],
    forAdmin: false,
  },
  {
    step: 3,
    title: 'Gestionar Incidencias',
    description: 'Técnicos y supervisores dan seguimiento',
    tasks: [
      'Revisar incidencias pendientes',
      'Asignar técnico responsable',
      'Actualizar estado (en proceso → resuelta)',
      'Documentar la solución aplicada',
    ],
    forAdmin: false,
  },
  {
    step: 4,
    title: 'Monitorear Estado',
    description: 'Ver el estado general en el mapa',
    tasks: [
      'El mapa muestra zonas por color según incidencias',
      'Dashboard muestra estadísticas en tiempo real',
      'Alertas críticas aparecen destacadas',
    ],
    forAdmin: false,
  },
]

// Componente del botón de ayuda
export function HelpButton() {
  const { showHelp, setShowHelp } = useHelp()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setShowHelp(!showHelp)}
      className={cn(
        'relative',
        showHelp && 'bg-primary text-primary-foreground'
      )}
      title="Ayuda"
    >
      <HelpCircle className="h-5 w-5" />
    </Button>
  )
}

// Modal principal de ayuda
export function HelpModal() {
  const { showHelp, setShowHelp, hasSeenTour, completeTour } = useHelp()
  const isAdmin = useIsAdmin()
  const [activeTab, setActiveTab] = useState<'tour' | 'workflow' | 'tips'>('tour')
  const [currentStep, setCurrentStep] = useState(0)

  const filteredTourSteps = TOUR_STEPS.filter(
    step => !step.forAdmin || isAdmin
  )

  const filteredWorkflow = WORKFLOW_STEPS.filter(
    step => !step.forAdmin || isAdmin
  )

  return (
    <Dialog open={showHelp} onOpenChange={setShowHelp}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Centro de Ayuda
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <Button
            variant={activeTab === 'tour' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('tour')}
          >
            Tour de la App
          </Button>
          <Button
            variant={activeTab === 'workflow' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('workflow')}
          >
            Flujo de Trabajo
          </Button>
          <Button
            variant={activeTab === 'tips' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('tips')}
          >
            Tips Rápidos
          </Button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto">
          {/* Tour */}
          {activeTab === 'tour' && (
            <div className="space-y-4 py-4">
              <div className="grid gap-3">
                {filteredTourSteps.map((step, index) => (
                  <Card 
                    key={step.id}
                    className={cn(
                      'cursor-pointer transition-all hover:border-primary',
                      currentStep === index && 'border-primary bg-primary/5'
                    )}
                    onClick={() => setCurrentStep(index)}
                  >
                    <CardContent className="p-4 flex items-start gap-4">
                      <div className={cn(
                        'p-2 rounded-lg',
                        currentStep === index ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}>
                        <step.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{step.title}</h3>
                          {step.forAdmin && (
                            <Badge variant="outline" className="text-xs">Admin</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {step.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {!hasSeenTour && (
                <div className="flex justify-end">
                  <Button onClick={completeTour}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como visto
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Workflow */}
          {activeTab === 'workflow' && (
            <div className="space-y-4 py-4">
              {filteredWorkflow.map((item, index) => (
                <Card key={item.step}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-3">
                      <span className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold',
                        'bg-primary text-primary-foreground'
                      )}>
                        {index + 1}
                      </span>
                      {item.title}
                      {item.forAdmin && (
                        <Badge variant="outline" className="text-xs">Solo Admin</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground mb-3">
                      {item.description}
                    </p>
                    <ul className="space-y-2">
                      {item.tasks.map((task, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <ChevronRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <span>{task}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Tips */}
          {activeTab === 'tips' && (
            <div className="space-y-3 py-4">
              <TipCard
                emoji="🗺️"
                title="Colores del Mapa"
                description="Verde = sin incidencias, Azul = medias, Naranja = altas, Rojo = críticas"
              />
              <TipCard
                emoji="📸"
                title="Fotos en Incidencias"
                description="Agrega fotos al reportar para documentar mejor el problema"
              />
              <TipCard
                emoji="⚡"
                title="Prioridades"
                description="Usa 'Crítica' solo para problemas que detengan la producción"
              />
              <TipCard
                emoji="🔔"
                title="Alertas"
                description="Las incidencias críticas aparecen destacadas en el Dashboard"
              />
              <TipCard
                emoji="📍"
                title="Zonas"
                description="Haz clic en una zona del mapa para ver sus incidencias activas"
              />
              {isAdmin && (
                <>
                  <TipCard
                    emoji="✏️"
                    title="Editar Zonas"
                    description="Usa 'Editar Zonas' en el mapa para dibujar polígonos punto a punto"
                  />
                  <TipCard
                    emoji="🗑️"
                    title="Eliminar Mapas"
                    description="En el selector de mapas, pasa el mouse sobre uno para ver el botón de eliminar"
                  />
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Componente de tip
function TipCard({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <span className="text-2xl">{emoji}</span>
        <div>
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// Componente de tooltip contextual
export function ContextualTip({ 
  id, 
  children, 
  tip 
}: { 
  id: string
  children: ReactNode
  tip: string 
}) {
  const { showHelp } = useHelp()

  if (!showHelp) {
    return <>{children}</>
  }

  return (
    <div className="relative group">
      {children}
      <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border rounded-lg shadow-lg text-sm max-w-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {tip}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-popover" />
      </div>
    </div>
  )
}

// Componente de bienvenida para nuevos usuarios
export function WelcomeModal() {
  const { hasSeenTour, setShowHelp, completeTour } = useHelp()
  const [showWelcome, setShowWelcome] = useState(!hasSeenTour)
  const user = useAuthStore(state => state.user)

  if (hasSeenTour || !showWelcome) {
    return null
  }

  return (
    <Dialog open={showWelcome} onOpenChange={setShowWelcome}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            👋 ¡Bienvenido, {user?.nombre}!
          </DialogTitle>
        </DialogHeader>
        <div className="text-center space-y-4 py-4">
          <p className="text-muted-foreground">
            Esta es tu primera vez en el Sistema de Mantenimiento Industrial.
          </p>
          <p className="text-muted-foreground">
            ¿Te gustaría ver un tour rápido de cómo funciona la aplicación?
          </p>
          <div className="flex gap-3 justify-center pt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowWelcome(false)
                completeTour()
              }}
            >
              Ahora no
            </Button>
            <Button 
              onClick={() => {
                setShowWelcome(false)
                setShowHelp(true)
              }}
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              Ver Tour
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
