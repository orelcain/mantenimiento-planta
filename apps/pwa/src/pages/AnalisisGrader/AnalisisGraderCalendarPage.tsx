/**
 * Página dedicada del calendario histórico del Grader.
 *
 * Wrapper sobre `<GraderHistoricalCalendar />` que agrega el header
 * con "Volver" y el botón "Carga masiva". La lógica del calendario vive
 * en el componente compartido para que pueda reusarse embebido dentro del
 * Wizard (home del Grader).
 *
 * Parámetros URL soportados:
 *   ?goto=YYYY-MM-DD  → abrir el calendario en el mes de esa fecha y
 *                       pre-seleccionar el día (viene de carga masiva).
 */

import { useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import { Calendar, ArrowLeft, Upload } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { GraderHistoricalCalendar } from '@/components/grader/GraderHistoricalCalendar'

export function AnalisisGraderCalendarPage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  if (!canSee('analisisGrader')) {
    return <Navigate to="/" replace />
  }

  const gotoDate = searchParams.get('goto')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendario Grader
            </h1>
            <p className="text-xs text-muted-foreground">
              Archivos guardados por día y turno · datos históricos
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader/carga-masiva')}>
          <Upload className="h-4 w-4 mr-1" />
          Carga masiva
        </Button>
      </div>

      <GraderHistoricalCalendar initialDateKey={gotoDate} />
    </div>
  )
}
