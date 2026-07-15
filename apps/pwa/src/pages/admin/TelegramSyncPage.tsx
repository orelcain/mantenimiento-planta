/**
 * TelegramSyncPage — control del ciclo Telegram → OneDrive → bandeja de novedades.
 *
 * La sincronización REAL corre en el PC de mantención (agente cada 15 min,
 * `_SYNC_TELEGRAM/agente_sync.py`): aquí solo se deja la orden y la periodicidad,
 * y se muestra lo que el agente reporta de vuelta (última corrida, ítems nuevos).
 * Si el PC está apagado, la orden queda pendiente hasta que encienda — Telegram
 * no pierde nada: el agente baja incremental desde el último mensaje procesado.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
} from '@/components/ui'
import { Send, Loader2, RefreshCw, CircleCheck, CircleAlert, CircleDashed, Laptop, History, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/store'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'
import {
  subscribeTelegramSyncConfig,
  subscribeTelegramSyncCorridas,
  saveTelegramSyncModo,
  requestTelegramSyncNow,
  TELEGRAM_SYNC_DEFAULTS,
  type TelegramSyncConfig,
  type TelegramSyncModo,
  type TelegramSyncCorrida,
} from '@/services/telegramSyncConfig.service'
import type { Timestamp } from 'firebase/firestore'

const MODOS: { value: TelegramSyncModo; label: string; hint: string }[] = [
  { value: 'manual', label: 'Manual', hint: 'Solo con el botón "Sincronizar ahora"' },
  { value: 'diaria', label: 'Diaria', hint: 'Una vez al día a la hora elegida' },
  { value: 'cada4h', label: 'Cada 4 h', hint: 'Durante el día, material fresco en la app' },
]

function fmt(ts: Timestamp | null): string {
  if (!ts) return '—'
  return ts.toDate().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

/** El agente corre cada 15 min: >25 min sin heartbeat = PC apagado/agente caído. */
function agenteEnLinea(ts: Timestamp | null): boolean {
  if (!ts) return false
  return Date.now() - ts.toDate().getTime() < 25 * 60 * 1000
}

/** Fila del historial, expandible al detalle por grupo/tema. */
function CorridaRow({ corrida }: { corrida: TelegramSyncCorrida }) {
  const [abierta, setAbierta] = useState(false)
  const expandible = corrida.porTema.length > 0
  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        onClick={() => expandible && setAbierta((v) => !v)}
        className={['w-full flex items-center gap-2 py-2 text-left text-sm',
          expandible ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default'].join(' ')}
      >
        {corrida.ok
          ? <CircleCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          : <CircleAlert className="w-4 h-4 text-red-400 shrink-0" />}
        <span className="text-xs text-muted-foreground w-32 shrink-0">{fmt(corrida.at)}</span>
        <span className="flex-1 truncate">
          {corrida.itemsNuevos > 0
            ? `${corrida.itemsNuevos} ítems nuevos`
            : (corrida.ok ? 'Sin novedades' : (corrida.error ?? 'Error'))}
          {corrida.motivo && <span className="text-muted-foreground"> · {corrida.motivo}</span>}
        </span>
        {corrida.solicitadaPor && (
          <span className="text-[11px] text-muted-foreground hidden sm:inline truncate max-w-[10rem]">
            {corrida.solicitadaPor}
          </span>
        )}
        {expandible && (abierta
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />)}
      </button>
      {abierta && (
        <div className="pb-2 pl-6 space-y-0.5">
          {corrida.porTema.map((t, i) => (
            <div key={i} className="text-xs text-muted-foreground flex gap-2">
              <span className="text-sky-400/80">{t.grupo}</span>
              <span>·</span>
              <span className="text-foreground">{t.tema}</span>
              <span className="ml-auto tabular-nums">{t.nuevos}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TelegramSyncPage() {
  const { toast } = useToast()
  const user = useAuthStore((s) => s.user)
  const [config, setConfig] = useState<TelegramSyncConfig>(TELEGRAM_SYNC_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  // borrador local del modo (se aplica con "Guardar periodicidad")
  const [modoDraft, setModoDraft] = useState<TelegramSyncModo | null>(null)
  const [horaDraft, setHoraDraft] = useState<string | null>(null)

  const [corridas, setCorridas] = useState<TelegramSyncCorrida[]>([])

  useEffect(() => {
    const unsub = subscribeTelegramSyncConfig((c) => { setConfig(c); setLoading(false) })
    const unsubCorridas = subscribeTelegramSyncCorridas(10, setCorridas)
    return () => { unsub(); unsubCorridas() }
  }, [])

  const modo = modoDraft ?? config.modo
  const hora = horaDraft ?? config.horaDiaria
  const dirty = modo !== config.modo || (modo === 'diaria' && hora !== config.horaDiaria)
  const online = agenteEnLinea(config.agenteVistoAt)

  const estadoUI = useMemo(() => {
    if (config.ordenPendiente) return { icon: <Loader2 className="w-4 h-4 animate-spin text-amber-400" />, texto: 'Orden pendiente — el agente la toma en ≤15 min' }
    switch (config.estado) {
      case 'corriendo': return { icon: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />, texto: 'Sincronizando ahora…' }
      case 'ok':        return { icon: <CircleCheck className="w-4 h-4 text-emerald-400" />, texto: 'Última sincronización exitosa' }
      case 'error':     return { icon: <CircleAlert className="w-4 h-4 text-red-400" />, texto: config.mensajeError ?? 'Error en la última corrida' }
      default:          return { icon: <CircleDashed className="w-4 h-4 text-muted-foreground" />, texto: 'Sin corridas aún' }
    }
  }, [config])

  const handleSyncNow = async () => {
    setEnviando(true)
    try {
      await requestTelegramSyncNow(user?.email ?? null)
      toast({ title: 'Orden enviada', description: 'El agente del PC la ejecutará en los próximos 15 minutos.' })
    } catch (e) {
      logger.error('TelegramSync orden error', e instanceof Error ? e : new Error(String(e)))
      toast({ title: 'No se pudo enviar la orden', variant: 'destructive' })
    } finally {
      setEnviando(false)
    }
  }

  const handleGuardarModo = async () => {
    setGuardando(true)
    try {
      await saveTelegramSyncModo(modo, hora)
      setModoDraft(null); setHoraDraft(null)
      toast({ title: 'Periodicidad guardada', description: MODOS.find((m) => m.value === modo)?.hint })
    } catch (e) {
      logger.error('TelegramSync guardar modo error', e instanceof Error ? e : new Error(String(e)))
      toast({ title: 'No se pudo guardar', variant: 'destructive' })
    } finally {
      setGuardando(false)
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
          <Send className="w-6 h-6 text-sky-400" />
          Sincronización Telegram
        </h1>
        <p className="text-sm text-muted-foreground">
          Baja lo nuevo de los temas del grupo de mantención a las carpetas de cada equipo
          (OneDrive) y alimenta la bandeja de novedades de la app.
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
            <div>Ítems nuevos: <span className="text-foreground">{config.itemsNuevos ?? '—'}</span></div>
            <div>Último latido del agente: <span className="text-foreground">{fmt(config.agenteVistoAt)}</span></div>
            <div>Solicitada por: <span className="text-foreground">{config.ordenSolicitadaPor ?? '—'}</span></div>
          </div>
          {!online && (
            <p className="text-xs text-amber-400/90 pt-1">
              El PC de mantención parece apagado. Las órdenes quedan guardadas y se ejecutan
              cuando encienda — no se pierde ningún mensaje de Telegram.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sincronizar ahora */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Sincronizar ahora</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Deja una orden inmediata, independiente de la periodicidad configurada.
          </p>
          <Button onClick={handleSyncNow} disabled={enviando || config.ordenPendiente || config.estado === 'corriendo'} size="sm">
            {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {config.ordenPendiente ? 'Orden ya en cola' : 'Sincronizar ahora'}
          </Button>
        </CardContent>
      </Card>

      {/* Periodicidad */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Periodicidad automática</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
            {MODOS.map((m) => (
              <button
                key={m.value}
                onClick={() => setModoDraft(m.value)}
                className={[
                  'px-3 py-1.5 text-sm rounded-md transition-colors',
                  modo === m.value
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{MODOS.find((m) => m.value === modo)?.hint}</p>
          {modo === 'diaria' && (
            <div className="flex items-center gap-3">
              <Label htmlFor="hora-diaria" className="text-sm whitespace-nowrap">Hora</Label>
              <Input
                id="hora-diaria"
                type="time"
                className="w-32 h-8 text-sm"
                value={hora}
                onChange={(e) => setHoraDraft(e.target.value || '07:30')}
              />
              <span className="text-xs text-muted-foreground">hora de Chile continental</span>
            </div>
          )}
          <Button onClick={handleGuardarModo} disabled={!dirty || guardando} size="sm" variant="outline">
            {guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar periodicidad
          </Button>
        </CardContent>
      </Card>
      </div>{/* fin columna controles */}

      {/* Historial de corridas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial de sincronizaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {corridas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aún no hay corridas registradas — aparecerán aquí desde la próxima sincronización.
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
