/**
 * Uso del link público del monitor — lo que se puede saber sin identificar a nadie.
 *
 * Responde "¿Control de Producción está usando esto?", que es lo que permite
 * defender la herramienta con datos. Deliberadamente NO hay identidad: quien
 * abre el link no tiene sesión, y lo único que lo distingue de otro es un
 * identificador aleatorio que generó su propio navegador.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, Monitor, Pencil, Smartphone, Users, X } from 'lucide-react'
import {
  contarMirandoAhora,
  subscribeMonitorLabels,
  setMonitorLabel,
  type MonitorUsageStats,
} from '@/services/shoplogix/publicShiftMonitor.service'
import { cn } from '@/lib/utils'

function fmtDuracion(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  // Menos de medio minuto redondeaba a "0 min", que se lee como un error.
  if (sec < 60) return '<1 min'
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

/**
 * ¿Este aparato apareció recién?
 *
 * Solo tiene sentido marcarlo cuando el link YA lleva más de un día en uso: si
 * se acaba de crear, todos los aparatos son nuevos por definición y la etiqueta
 * no distingue nada — solo mete ruido.
 */
function esNuevo(firstSeen: number | undefined, linkDesde: number | null): boolean {
  if (!firstSeen || !linkDesde) return false
  if (Date.now() - linkDesde < 24 * 60 * 60 * 1000) return false
  return Date.now() - firstSeen < 24 * 60 * 60 * 1000
}

/** Fila de un aparato, con su apodo editable. */
function FilaAparato({
  token, id, indice, device, opens, secs, lastSeen, firstSeen, label, linkDesde, fusionados,
}: {
  token: string; id: string; indice: number; device?: string
  opens: number; secs: number; lastSeen: number; firstSeen?: number; label?: string
  linkDesde: number | null; fusionados: number
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(label ?? '')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setValor(label ?? '') }, [label])
  useEffect(() => { if (editando) inputRef.current?.focus() }, [editando])

  // Cerrar el editor pase lo que pase haría creer que se guardó. Si falla, el
  // editor se queda abierto con el texto escrito y lo dice.
  const guardar = () => {
    setError(false)
    setMonitorLabel(token, id, valor)
      .then(() => setEditando(false))
      .catch(() => setError(true))
  }

  return (
    <li className="flex items-center gap-2 text-[11px]">
      <span className="text-muted-foreground/60">
        {device === 'movil' ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
      </span>

      {editando ? (
        <>
          <input
            ref={inputRef}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardar()
              if (e.key === 'Escape') { setValor(label ?? ''); setEditando(false) }
            }}
            maxLength={40}
            placeholder="Ej: celular de Control"
            className={cn(
              'h-6 flex-1 min-w-0 rounded border bg-background px-1.5 text-[11px]',
              error ? 'border-destructive' : 'border-border',
            )}
          />
          {error && (
            <span className="text-[10px] text-destructive shrink-0">no se pudo guardar</span>
          )}
          <button onClick={guardar} className="text-ink-ok" title="Guardar">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setValor(label ?? ''); setEditando(false) }}
            className="text-muted-foreground" title="Cancelar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setEditando(true)}
            className="group flex items-center gap-1 min-w-0 text-left"
            title="Ponerle nombre a este aparato (solo lo ves tú)"
          >
            <span className={cn('truncate', label ? 'text-foreground' : 'text-muted-foreground')}>
              {label || `Aparato ${indice}`}
            </span>
            <Pencil className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
          <span className="tabular-nums text-foreground shrink-0">
            {opens} {opens === 1 ? 'apertura' : 'aperturas'}
          </span>
          {/* Distinguir el aparato de siempre del que entra por primera vez es
              justo lo que dice si la herramienta está sumando gente o si la
              mira el mismo de siempre. */}
          {fusionados > 1 && (
            <span
              className="shrink-0 text-[10px] text-muted-foreground/60"
              title={`${fusionados} navegadores distintos con el mismo nombre — se cuentan como un solo aparato`}
            >
              ({fusionados} navegadores)
            </span>
          )}
          {esNuevo(firstSeen, linkDesde) && (
            <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/15 px-1.5 text-[10px] text-sky-700 dark:text-sky-300">
              nuevo
            </span>
          )}
          {secs > 0 && (
            <span className="tabular-nums text-muted-foreground/70 shrink-0">· {fmtDuracion(secs)}</span>
          )}
          <span className="ml-auto tabular-nums text-muted-foreground/60 shrink-0">{fmtHace(lastSeen)}</span>
        </>
      )}
    </li>
  )
}

export function MonitorUsagePanel({ stats, token }: { stats: MonitorUsageStats | null; token: string | null }) {
  const [labels, setLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!token) { setLabels({}); return }
    return subscribeMonitorLabels(token, setLabels)
  }, [token])

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

  // El mismo celular puede figurar dos veces: cada navegador guarda su propio
  // identificador, y abrir el link desde WhatsApp o Telegram usa el navegador
  // interno de esas apps, no el de siempre. No se puede resolver por medios
  // técnicos sin ponerse a identificar aparatos por su huella —que es
  // justamente lo que esta pantalla no hace—, así que se resuelve con lo que
  // el usuario SÍ sabe: si le pone el mismo nombre a dos filas, son el mismo
  // aparato y se muestran fusionadas.
  const crudos = Object.entries(stats.viewers ?? {})
    .map(([id, v]) => ({ id, opens: v.opens ?? 0, secs: v.secs ?? 0, lastSeen: v.lastSeen, firstSeen: v.firstSeen, device: v.device }))

  const porNombre = new Map<string, typeof crudos[number] & { ids: string[]; fusionados: number }>()
  for (const v of crudos) {
    const nombre = (labels[v.id] ?? '').trim().toLowerCase()
    const clave = nombre || `__${v.id}`
    const prev = porNombre.get(clave)
    if (!prev) {
      porNombre.set(clave, { ...v, ids: [v.id], fusionados: 1 })
    } else {
      prev.opens += v.opens
      prev.secs += v.secs
      prev.ids.push(v.id)
      prev.fusionados += 1
      prev.lastSeen = Math.max(prev.lastSeen ?? 0, v.lastSeen ?? 0)
      prev.firstSeen = Math.min(prev.firstSeen ?? Infinity, v.firstSeen ?? Infinity)
    }
  }

  const todos = [...porNombre.values()].sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
  const aparatos = todos.slice(0, 6)
  const sobran = Math.max(0, todos.length - aparatos.length)
  // El total de arriba cuenta aparatos ya fusionados, no navegadores sueltos.
  const totalAparatos = todos.length
  const maxDia = Math.max(...dias.map(d => d.opens), 1)
  const movil = stats.devices?.movil ?? 0
  const escritorio = stats.devices?.escritorio ?? 0
  const anteriores = stats.shiftViews?.anteriores ?? 0

  return (
    <div className="border-t border-border/40 pt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Dato icon={<Eye className="w-3.5 h-3.5" />} valor={String(stats.opens)} label="aperturas" />
        <Dato icon={<Users className="w-3.5 h-3.5" />} valor={String(totalAparatos)} label="aparatos" />
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
            <FilaAparato
              key={a.id}
              token={token!}
              id={a.id}
              indice={i + 1}
              device={a.device}
              opens={a.opens}
              secs={a.secs}
              lastSeen={a.lastSeen}
              firstSeen={a.firstSeen}
              linkDesde={stats.firstOpenAt ?? null}
              fusionados={a.fusionados}
              label={labels[a.id]}
            />
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
        Se distinguen <b className="font-medium">navegadores</b>, no personas. El mismo celular puede
        aparecer dos veces si lo abriste desde WhatsApp y desde el navegador:
        <b className="font-medium"> ponles el mismo nombre y se cuentan como uno solo</b>. Los nombres
        son una nota tuya — quien abre el link no los ve.
      </p>
    </div>
  )
}
