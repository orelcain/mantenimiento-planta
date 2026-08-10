/**
 * Uso del link público del monitor — lo que se puede saber sin identificar a nadie.
 *
 * Responde "¿Control de Producción está usando esto?", que es lo que permite
 * defender la herramienta con datos. Deliberadamente NO hay identidad: quien
 * abre el link no tiene sesión, y lo único que lo distingue de otro es un
 * identificador aleatorio que generó su propio navegador.
 */

import { useMemo } from 'react'
import { Eye, Monitor, Smartphone, Users } from 'lucide-react'
import { contarMirandoAhora, type MonitorUsageStats } from '@/services/shoplogix/publicShiftMonitor.service'

function fmtDuracion(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

function fmtHace(ms: number | null | undefined): string {
  if (!ms) return '—'
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (sec < 60) return 'recién'
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function Dato({ icon, valor, label }: { icon: React.ReactNode; valor: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground/60">{icon}</span>
      <span className="tabular-nums font-medium text-foreground">{valor}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

export function MonitorUsagePanel({ stats }: { stats: MonitorUsageStats | null }) {
  const dias = useMemo(() => {
    const entradas = Object.entries(stats?.byDay ?? {}).sort(([a], [b]) => a.localeCompare(b))
    return entradas.slice(-14).map(([dia, d]) => ({ dia, opens: d?.opens ?? 0 }))
  }, [stats])

  if (!stats || (stats.opens ?? 0) === 0) {
    return (
      <p className="border-t border-border/40 pt-2 text-[11px] text-muted-foreground/60">
        Todavía nadie ha abierto este link. Acá aparecerá cuántas veces lo abren y desde
        cuántos aparatos.
      </p>
    )
  }

  const ahora = contarMirandoAhora(stats)
  // Los más recientes primero; se listan pocos para no convertir la tarjeta en
  // una tabla — el total ya está arriba.
  const todos = Object.entries(stats.viewers ?? {})
    .map(([id, v]) => ({ id, opens: v.opens ?? 0, secs: v.secs ?? 0, lastSeen: v.lastSeen, device: v.device }))
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
  const aparatos = todos.slice(0, 5)
  const sobran = Math.max(0, todos.length - aparatos.length)
  const maxDia = Math.max(...dias.map(d => d.opens), 1)
  const movil = stats.devices?.movil ?? 0
  const escritorio = stats.devices?.escritorio ?? 0
  const anteriores = stats.shiftViews?.anteriores ?? 0

  return (
    <div className="border-t border-border/40 pt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Dato icon={<Eye className="w-3.5 h-3.5" />} valor={String(stats.opens)} label="aperturas" />
        <Dato icon={<Users className="w-3.5 h-3.5" />} valor={String(stats.viewersCount ?? 0)} label="aparatos" />
        <Dato icon={<Monitor className="w-3.5 h-3.5" />} valor={fmtDuracion(stats.secondsViewed ?? 0)} label="mirando" />
        {ahora > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {ahora === 1 ? 'Alguien mirando ahora' : `${ahora} mirando ahora`}
          </span>
        )}
      </div>

      {/* Detalle por aparato: sin esto no se distingue "una persona que abrió
          12 veces" de "12 personas que abrieron una vez", que es justo lo que
          hay que saber para decir si la pantalla se usa o no. */}
      {aparatos.length > 0 && (
        <ul className="space-y-0.5">
          {aparatos.map((a, i) => (
            <li key={a.id} className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground/60">
                {a.device === 'movil' ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
              </span>
              <span className="text-muted-foreground">Aparato {i + 1}</span>
              <span className="tabular-nums text-foreground">
                {a.opens} {a.opens === 1 ? 'apertura' : 'aperturas'}
              </span>
              {a.secs > 0 && (
                <span className="tabular-nums text-muted-foreground/70">· {fmtDuracion(a.secs)}</span>
              )}
              <span className="ml-auto tabular-nums text-muted-foreground/60">{fmtHace(a.lastSeen)}</span>
            </li>
          ))}
          {sobran > 0 && (
            <li className="text-[11px] text-muted-foreground/50">
              +{sobran} {sobran === 1 ? 'aparato más' : 'aparatos más'}
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>Última vez {fmtHace(stats.lastOpenAt)}</span>
        {(movil > 0 || escritorio > 0) && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span className="inline-flex items-center gap-1">
              <Smartphone className="w-3 h-3" />{movil} celular{movil === 1 ? '' : 'es'}
              <span className="text-muted-foreground/30 mx-0.5">/</span>
              <Monitor className="w-3 h-3" />{escritorio} PC
            </span>
          </>
        )}
        {anteriores > 0 && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span>{anteriores} {anteriores === 1 ? 'vista' : 'vistas'} a turnos anteriores</span>
          </>
        )}
      </div>

      {dias.length > 1 && (
        <div>
          <div className="flex items-end gap-[3px] h-8">
            {dias.map(d => (
              <div
                key={d.dia}
                title={`${d.dia}: ${d.opens} aperturas`}
                className="flex-1 rounded-sm bg-sky-500/70 min-h-[2px]"
                style={{ height: `${Math.max(6, (d.opens / maxDia) * 100)}%` }}
              />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground/50">
            Aperturas por día · últimos {dias.length} días con actividad
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/40">
        Conteo anónimo: se distinguen aparatos, no personas.
      </p>
    </div>
  )
}
