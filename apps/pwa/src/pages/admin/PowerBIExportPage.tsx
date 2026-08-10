/**
 * PowerBIExportPage — botón "Actualizar Power BI" y estado de la cadena de KPIs.
 *
 * La cadena AUTOMÁTICA ya corre sola (export c/3h en el PC de mantención +
 * refresh programado 4×/día en Power BI Service). Esta página agrega la corrida
 * A DEMANDA: deja una orden en Firestore y el agente del PC
 * (`automation/agente_powerbi.py`, cada 15 min) exporta los CSVs, los copia a
 * OneDrive empresa y dispara el refresh del dataset. Clic → datos frescos en
 * el informe en ~5-20 min (según el ciclo del agente).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
} from '@/components/ui'
import { BarChart3, Loader2, RefreshCw, CircleCheck, CircleAlert, CircleDashed, Laptop, History } from 'lucide-react'
import { useAuthStore } from '@/store'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'
import {
  subscribePowerBIExportConfig,
  subscribePowerBIExportCorridas,
  requestPowerBIExportNow,
  POWERBI_EXPORT_DEFAULTS,
  type PowerBIExportConfig,
  type PowerBIExportCorrida,
} from '@/services/powerbiExport.service'
import type { Timestamp } from 'firebase/firestore'

function fmt(ts: Timestamp | null): string {
  if (!ts) return '—'
  return ts.toDate().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

/** El agente corre cada 15 min: >25 min sin heartbeat = PC apagado/agente caído. */
function agenteEnLinea(ts: Timestamp | null): boolean {
  if (!ts) return false
  return Date.now() - ts.toDate().getTime() < 25 * 60 * 1000
}

function CorridaRow({ corrida }: { corrida: PowerBIExportCorrida }) {
  return (
    <div className="border-b border-border/60 last:border-0 flex items-center gap-2 py-2 text-sm">
      {corrida.ok
        ? <CircleCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        : <CircleAlert className="w-4 h-4 text-red-400 shrink-0" />}
      <span className="text-xs text-muted-foreground w-32 shrink-0">{fmt(corrida.at)}</span>
      <span className="flex-1 truncate">
        {corrida.ok ? 'Export OK' : (corrida.error ?? 'Error')}
        {corrida.ok && corrida.refreshOk !== null && (
          <span className={corrida.refreshOk ? 'text-emerald-400/90' : 'text-amber-400/90'}>
            {corrida.refreshOk ? ' · refresh OK' : ' · refresh falló'}
          </span>
        )}
        {corrida.motivo && <span className="text-muted-foreground"> · {corrida.motivo}</span>}
        {corrida.duracionSeg !== null && (
          <span className="text-muted-foreground"> · {Math.round(corrida.duracionSeg)} s</span>
        )}
      </span>
      {corrida.solicitadaPor && (
        <span className="text-caption text-muted-foreground hidden sm:inline truncate max-w-[10rem]">
          {corrida.solicitadaPor}
        </span>
      )}
    </div>
  )
}

export function PowerBIExportPage() {
  const { toast } = useToast()
  const user = useAuthStore((s) => s.user)
  const [config, setConfig] = useState<PowerBIExportConfig>(POWERBI_EXPORT_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [corridas, setCorridas] = useState<PowerBIExportCorrida[]>([])

  useEffect(() => {
    const unsub = subscribePowerBIExportConfig((c) => { setConfig(c); setLoading(false) })
    const unsubCorridas = subscribePowerBIExportCorridas(10, setCorridas)
    return () => { unsub(); unsubCorridas() }
  }, [])

  const online = agenteEnLinea(config.agenteVistoAt)

  const estadoUI = useMemo(() => {
    if (config.ordenPendiente) return { icon: <Loader2 className="w-4 h-4 animate-spin text-amber-400" />, texto: 'Orden pendiente — el agente la toma en ≤15 min' }
    switch (config.estado) {
      case 'corriendo': return { icon: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />, texto: 'Exportando y refrescando ahora…' }
      case 'ok':        return { icon: <CircleCheck className="w-4 h-4 text-emerald-400" />, texto: 'Última actualización exitosa' }
      case 'error':     return { icon: <CircleAlert className="w-4 h-4 text-red-400" />, texto: config.mensajeError ?? 'Error en la última corrida' }
      default:          return { icon: <CircleDashed className="w-4 h-4 text-muted-foreground" />, texto: 'Sin corridas a demanda aún' }
    }
  }, [config])

  const handleActualizarNow = async () => {
    setEnviando(true)
    try {
      await requestPowerBIExportNow(user?.email ?? null)
      toast({ title: 'Orden enviada', description: 'El agente del PC exporta y refresca en los próximos 15 minutos.' })
    } catch (e) {
      logger.error('PowerBIExport orden error', e instanceof Error ? e : new Error(String(e)))
      toast({ title: 'No se pudo enviar la orden', variant: 'destructive' })
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando estado…
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-yellow-400" />
          Actualizar Power BI
        </h1>
        <p className="text-sm text-muted-foreground">
          Exporta los KPIs de Mantención (CSVs modelo-estrella) a OneDrive empresa y refresca
          el dataset en Power BI Service. La cadena automática ya corre sola (export c/3 h +
          refresh 4×/día); este botón es para tener datos frescos AHORA, antes de una reunión.
        </p>
      </div>

      {/* Desktop: controles a la izquierda, historial a la derecha. Móvil: una columna. */}
      <div className="grid gap-4 items-start lg:grid-cols-2">
      <div className="space-y-4">
      {/* Estado del agente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Laptop className="w-4 h-4" />
            Agente del PC de mantención
            <span className={['ml-auto inline-flex items-center gap-1.5 text-xs font-normal',
              online ? 'text-emerald-400' : 'text-red-400'].join(' ')}>
              <span className={['w-2 h-2 rounded-full', online ? 'bg-emerald-400' : 'bg-red-400'].join(' ')} />
              {online ? 'En línea' : 'Sin señal'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">{estadoUI.icon}<span>{estadoUI.texto}</span></div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1">
            <div>Última corrida: <span className="text-foreground">{fmt(config.ultimaCorridaAt)}</span></div>
            <div>Refresh Power BI: <span className="text-foreground">
              {config.refreshOk === null ? '—' : (config.refreshOk ? 'OK' : 'falló')}
            </span></div>
            <div>Último latido del agente: <span className="text-foreground">{fmt(config.agenteVistoAt)}</span></div>
            <div>Solicitada por: <span className="text-foreground">{config.ordenSolicitadaPor ?? '—'}</span></div>
          </div>
          {!online && (
            <p className="text-xs text-amber-400/90 pt-1">
              El PC de mantención parece apagado. La orden queda guardada y se ejecuta
              cuando encienda.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actualizar ahora */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Actualizar ahora</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Deja una orden inmediata, independiente de la cadena automática. Power BI admite
            hasta 8 refreshes al día en total (4 quedan reservados a los programados) —
            usar con criterio.
          </p>
          <Button onClick={handleActualizarNow} disabled={enviando || config.ordenPendiente || config.estado === 'corriendo'} size="sm">
            {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {config.ordenPendiente ? 'Orden ya en cola' : 'Actualizar KPIs Power BI ahora'}
          </Button>
        </CardContent>
      </Card>
      </div>{/* fin columna controles */}

      {/* Historial de corridas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial de actualizaciones a demanda
          </CardTitle>
        </CardHeader>
        <CardContent>
          {corridas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aún no hay corridas a demanda — aparecerán aquí con la primera orden.
            </p>
          ) : (
            <div>
              {corridas.map((c) => <CorridaRow key={c.id} corrida={c} />)}
            </div>
          )}
        </CardContent>
      </Card>
      </div>{/* fin grid */}
    </div>
  )
}
