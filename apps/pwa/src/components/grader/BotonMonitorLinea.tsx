/**
 * BotonMonitorLinea — abre el monitor en vivo de la línea elegida desde el
 * inicio de Análisis de turno, sin entrar a un turno (opción B, elegida por
 * Orel el 11-11-2026: es de lo más usado cada día).
 *
 * Usa el monitor de LÍNEA: el backend resuelve el turno vigente y reutiliza el
 * token de la línea (`ensureLineMonitor` solo extiende la vigencia), así que el
 * enlace es el mismo de siempre y los QR impresos siguen sirviendo.
 *
 * La pestaña se abre ANTES del await: un `window.open` después de una promesa
 * ya no cuenta como gesto del usuario y el bloqueador de ventanas lo cierra.
 */
import { useState } from 'react'
import { Loader2, Radio } from 'lucide-react'
import { Button } from '@/components/piel'
import type { PlantLineConfig } from '@/config/plantLines'
import { createPublicShiftMonitor } from '@/services/shoplogix/publicShiftMonitor.service'

/** Misma vigencia que el botón de monitor de la página del turno (30 días). */
const VIGENCIA_HORAS = 720

export function BotonMonitorLinea({ linea }: { linea: PlantLineConfig }) {
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!linea.shoplogixEnabled) return null

  const abrir = async () => {
    const ventana = window.open('', '_blank')
    setAbriendo(true)
    setError(null)
    try {
      const { token } = await createPublicShiftMonitor({
        mode: 'line',
        plantSlug: linea.plantSlug,
        plantLineId: linea.id,
        areaLabel: linea.areaLabel,
        lineLabel: linea.label,
        machineKindLong: linea.machineKind?.long,
        targetPieces: linea.shiftTargetPieces,
        ttlHours: VIGENCIA_HORAS,
      })
      const url = `${window.location.origin}${import.meta.env.BASE_URL}monitor/${token}`
      if (ventana) ventana.location.href = url
      else window.location.assign(url)
    } catch (err) {
      ventana?.close()
      setError(err instanceof Error ? err.message : 'No se pudo abrir el monitor')
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button variant="filled" onClick={abrir} disabled={abriendo} title={`Abrir el monitor en vivo de ${linea.label}`}>
        {abriendo ? <Loader2 className="animate-spin" aria-hidden /> : <Radio aria-hidden />}
        <span className="max-sm:hidden">Monitor en vivo</span>
        <span className="sm:hidden">Monitor</span>
      </Button>
      {error && <p role="alert" className="text-footnote text-ink-crit">{error}</p>}
    </div>
  )
}
