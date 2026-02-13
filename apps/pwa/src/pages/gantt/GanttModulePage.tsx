import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { GanttPlannerPage } from '@/pages/gantt/GanttPlannerPage'
import { GanttExecutiveDashboardPage } from '@/pages/gantt/GanttExecutiveDashboardPage'
import { GanttMobilePage } from '@/pages/gantt/GanttMobilePage'

type GanttViewTab = 'planificador' | 'ejecutivo' | 'movil'

function normalizeTab(value: string | null): GanttViewTab {
  if (value === 'ejecutivo') return 'ejecutivo'
  if (value === 'movil') return 'movil'
  return 'planificador'
}

export function GanttModulePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = useMemo(() => normalizeTab(searchParams.get('tab')), [searchParams])

  function onTabChange(next: string) {
    const tab = normalizeTab(next)
    setSearchParams({ tab })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Gantt</h1>
        <p className="text-sm text-muted-foreground">Módulo único de planificación industrial con vistas internas</p>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="planificador">Planificador</TabsTrigger>
          <TabsTrigger value="ejecutivo">Ejecutivo</TabsTrigger>
          <TabsTrigger value="movil">Móvil</TabsTrigger>
        </TabsList>

        <TabsContent value="planificador" className="pt-2">
          <GanttPlannerPage />
        </TabsContent>

        <TabsContent value="ejecutivo" className="pt-2">
          <GanttExecutiveDashboardPage />
        </TabsContent>

        <TabsContent value="movil" className="pt-2">
          <GanttMobilePage />
        </TabsContent>
      </Tabs>
    </div>
  )
}
