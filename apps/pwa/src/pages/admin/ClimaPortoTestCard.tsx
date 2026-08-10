import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button, Spinner } from '@/components/ui'
import { Bell, Clock } from 'lucide-react'
import { scheduleClimaPortoTestNotification } from '@/services/test-notifications'
import { useToast } from '@/hooks/useToast'

const DELAY_OPTIONS = [
  { label: '30 seg', value: 30 },
  { label: '1 min',  value: 60 },
  { label: '2 min',  value: 120 },
]

type State = 'idle' | 'scheduled' | 'done' | 'error'

export function ClimaPortoTestCard() {
  const [selectedDelay, setSelectedDelay] = useState(30)
  const [state, setState] = useState<State>('idle')
  const [countdown, setCountdown] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const { toast } = useToast()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearCountdown = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
  }

  useEffect(() => () => clearCountdown(), [])

  const handleSchedule = async () => {
    setState('scheduled')
    setCountdown(selectedDelay)

    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearCountdown(); return 0 }
        return prev - 1
      })
    }, 1000)

    try {
      const result = await scheduleClimaPortoTestNotification(selectedDelay)
      clearCountdown()
      if (result.success) {
        setState('done')
        toast({ description: 'Notificación de prueba enviada correctamente.' })
      } else {
        setState('error')
        setErrorMsg(result.message || 'No se pudo enviar la notificación')
        toast({ variant: 'destructive', title: 'Error', description: result.message })
      }
    } catch (e: any) {
      clearCountdown()
      setState('error')
      const msg = e.message && e.message !== 'internal'
        ? e.message
        : 'Error al llamar la función. Revisa que las notificaciones estén activadas.'
      setErrorMsg(msg)
      toast({ variant: 'destructive', title: 'Error', description: msg })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          Test de notificación · Clima Puerto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Programa una notificación push con el estado actual del puerto. Cierra la app antes de que llegue para verificar que funciona.
        </p>

        {/* Selector de delay */}
        <div className="flex gap-2">
          {DELAY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              disabled={state !== 'idle'}
              onClick={() => setSelectedDelay(opt.value)}
              className={`px-3 py-1.5 rounded-ctl text-sm border transition-colors ${
                selectedDelay === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-border'
              } disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {state === 'idle' && (
          <Button onClick={handleSchedule} variant="outline" className="w-full">
            <Clock className="h-4 w-4 mr-2" />
            Programar en {DELAY_OPTIONS.find(o => o.value === selectedDelay)?.label}
          </Button>
        )}

        {state === 'scheduled' && (
          <div className="flex items-center justify-between rounded-card border bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Spinner size="sm" />
              Cierra la app ahora
            </div>
            <span className="text-2xl font-bold tabular-nums">{countdown}s</span>
          </div>
        )}

        {state === 'done' && (
          <div className="flex items-center justify-between rounded-card border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950">
            <p className="text-sm text-ink-ok">Notificación enviada</p>
            <Button size="sm" variant="ghost" onClick={() => setState('idle')}>Reiniciar</Button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-start justify-between gap-3 rounded-card border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">{errorMsg || 'Error al enviar'}</p>
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setState('idle')}>Reintentar</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
