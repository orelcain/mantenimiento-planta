/**
 * Configuración GLOBAL del Grader — ruta propia, solo admin.
 *
 * Ruta: /analisis-grader/config?linea=<plantLineId>
 *
 * Por qué existe: hasta ahora estos parámetros solo se alcanzaban entrando a
 * UN turno → acordeón "Configuración de este turno" → botón de ajustes →
 * modal → tab "Línea física". Cuatro niveles, y con un turno como puerta de
 * entrada a algo que no es del turno: la línea física, los umbrales y los
 * rangos de calibre valen para TODOS los turnos de la línea.
 *
 * Lo que sí es del turno (umbrales del turno, rangos override, snapshot de
 * gates) se queda en la pestaña "Gates" del detalle de turno — no acá.
 */

import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Gauge, SlidersHorizontal, Ruler, Tag, Timer, Globe2 } from 'lucide-react'
import { Button, Card, CardContent, Badge } from '@/components/ui'
import { useIsAdmin } from '@/store/authStore'
import { usePermissionsStore } from '@/store'
import { PhysicalLineSection } from '@/components/grader/PhysicalLineSection'
import { GlobalSettingsModal, type SettingsTab } from '@/components/grader/GlobalSettingsModal'
import { getPlantLineConfig } from '@/config/plantLines'

/** Secciones globales que hoy viven dentro del modal de ajustes. */
const MODAL_SECTIONS: { id: SettingsTab; label: string; desc: string; Icon: typeof Gauge }[] = [
  {
    id: 'umbrales',
    label: 'Umbrales P0%',
    desc: 'Cuándo un turno se marca en alerta o crítico.',
    Icon: SlidersHorizontal,
  },
  {
    id: 'rangos',
    label: 'Rangos de calibre',
    desc: 'Pesos mínimo y máximo de cada calibre.',
    Icon: Ruler,
  },
  {
    id: 'tags',
    label: 'Tags de pausa',
    desc: 'Etiquetas con las que se clasifican los paros.',
    Icon: Tag,
  },
  {
    id: 'detector',
    label: 'Detector de pausas',
    desc: 'Sensibilidad con la que se detecta un paro.',
    Icon: Timer,
  },
]

export function AnalisisGraderConfigPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isAdmin = useIsAdmin()
  const canSee = usePermissionsStore(s => s.canSee)

  const [modalTab, setModalTab] = useState<SettingsTab | null>(null)

  const plantLineCfg = useMemo(
    () => getPlantLineConfig(searchParams.get('linea') ?? ''),
    [searchParams],
  )

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />
  // Estos parámetros afectan el cálculo de TODOS los turnos de la línea:
  // solo admin, y no solo los inputs deshabilitados como en el modal.
  if (!isAdmin) return <Navigate to="/analisis-grader" replace />

  return (
    <div className="container mx-auto p-3 sm:p-4 space-y-4 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/analisis-grader')}
          className="gap-1.5 shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Análisis de Turno</span>
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">Configuración del Grader</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {plantLineCfg.label}
          </Badge>
        </div>
      </div>

      {/* Aviso de alcance: esto no es de un turno */}
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-md bg-sky-500/10 border border-sky-500/30 text-sm">
        <Globe2 className="w-4 h-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Estos valores aplican a todos los turnos</span>{' '}
          de {plantLineCfg.label}, pasados y futuros: cambiar uno acá recalcula cómo se lee cualquier
          turno. Lo que corresponde a un turno puntual (sus umbrales, sus rangos, sus cambios de
          compuerta) se ajusta desde la pestaña <span className="font-medium text-foreground">Gates</span> de
          ese turno.
        </p>
      </div>

      {/* Línea física — la sección más pesada, self-contained */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Línea física</span>
            <span className="text-xs text-muted-foreground">
              · cambia solo en mantenciones o recalibraciones
            </span>
          </div>
          <PhysicalLineSection plantLineId={plantLineCfg.id} />
        </CardContent>
      </Card>

      {/* Resto de secciones globales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {MODAL_SECTIONS.map(({ id, label, desc, Icon }) => (
          <button
            key={id}
            onClick={() => setModalTab(id)}
            className="text-left rounded-lg border border-border bg-card p-3 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{label}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{desc}</p>
          </button>
        ))}
      </div>

      <GlobalSettingsModal
        open={modalTab !== null}
        onOpenChange={(open) => { if (!open) setModalTab(null) }}
        plantLineId={plantLineCfg.id}
        defaultTab={modalTab ?? undefined}
      />
    </div>
  )
}
