import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ListCell, Pill } from '@/components/piel'
import { toast } from '@/hooks/useToast'
import type { PlantLineId } from '@/config/plantLines'
import {
  lineaConMonitor, rutaMonitor, tokenMonitorDeLinea, turnoEnCursoDePlanta,
} from '@/services/shoplogix/monitorDeLinea'

// ─── Acceso directo al monitor de una línea ──────────────────────────────────

/**
 * «Monitor Eviscerado» bajo su línea, con el estado del turno a la derecha.
 * Un poco más adentro que la línea y en el tinte de acción: es un destino
 * distinto del análisis, no otra línea. Título en subhead y sangría corta: a
 * 375 px, en body y con la sangría completa, «Monitor Eviscerado» se partía
 * en dos renglones junto a la píldora.
 */
export function MonitorCell({ lineId, anidada = true }: {
  lineId: PlantLineId
  /** Bajo su línea en la lista de Inicio (celular). `false` = lista propia (PC). */
  anidada?: boolean
}) {
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
        <span className={cn(anidada && 'ml-5', 'flex size-7 items-center justify-center')} aria-hidden>
          <Monitor className="size-[18px] text-primary" />
        </span>
      }
      className={anidada ? 'before:left-[4.75rem]' : undefined}
      title={<span className={cn('whitespace-nowrap font-semibold text-primary', anidada && 'text-subhead')}>Monitor {linea.areaLabel}</span>}
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
