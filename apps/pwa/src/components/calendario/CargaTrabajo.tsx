import { useMemo, useState } from 'react'
import { Check, Minus, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { ListGroup, ListCell, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import {
  balance,
  cargaSemanalMinutos,
  minutosAHorasDecimal,
  minutosAHorasTexto,
  type ConfigCarga,
  type TareaMantencion,
} from '@/services/ruedaCarga'
import { sinConfirmar, type MaquinaRueda } from '@/services/ruedaVentanas'
import { ProgramacionSemana } from './ProgramacionSemana'
import {
  MOTIVO_TEXTO,
  moverOcurrencia,
  programarSemana,
  sinAnclaje,
  veredictoDe,
  type Anclaje,
} from '@/services/ruedaProgramacion'

/**
 * «¿Alcanza el tiempo?» — capacidad contra carga.
 *
 * La pregunta que cierra el módulo: con la gente del turno y las ventanas que
 * las otras áreas dejan, ¿cabe el trabajo rutinario y preventivo? Y si no cabe,
 * ¿qué hay que sacar?
 *
 * Todo se mide en horas-hombre, y se muestran DOS balances, no uno: el total y
 * el de máquina detenida. Puede sobrar tiempo en total y aun así no haber horas
 * suficientes con la máquina parada, que es donde se hace el trabajo pesado —
 * decir «alcanza» mirando solo el total sería engañar.
 */

export interface CargaTrabajoProps {
  maquinas: MaquinaRueda[]
  tareas: TareaMantencion[]
  config: ConfigCarga
  anclajes: Anclaje[]
  onCambiarTareas: (t: TareaMantencion[]) => void
  onCambiarConfig: (c: ConfigCarga) => void
  onCambiarAnclajes: (a: Anclaje[]) => void
}

export function CargaTrabajo({
  maquinas,
  tareas,
  config,
  anclajes,
  onCambiarTareas,
  onCambiarConfig,
  onCambiarAnclajes,
}: CargaTrabajoProps) {
  const [nuevoNombre, setNuevoNombre] = useState('')
  const b = useMemo(() => balance(maquinas, tareas, config), [maquinas, tareas, config])
  // Una sola programación para toda la vista: la calcula el padre y la baja,
  // para que el veredicto y el detalle no puedan contarse historias distintas.
  const prog = useMemo(
    () => programarSemana(maquinas, tareas, config, anclajes),
    [maquinas, tareas, config, anclajes],
  )
  const v = useMemo(() => veredictoDe(prog), [prog])

  const nombrePorId = useMemo(() => new Map(maquinas.map((m) => [m.id, m.nombre])), [maquinas])

  const actualizar = (id: string, cambio: Partial<TareaMantencion>) =>
    onCambiarTareas(tareas.map((t) => (t.id === id ? { ...t, ...cambio } : t)))

  const agregar = () => {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    onCambiarTareas([
      ...tareas,
      {
        id: `t-${Date.now()}`,
        nombre,
        maquinaId: null,
        tipo: 'rutina',
        minutos: 30,
        personas: 1,
        vecesPorSemana: 1,
        requiereDetencion: true,
        activa: true,
      },
    ])
    setNuevoNombre('')
  }

  const activas = tareas.filter((t) => t.activa)
  const pendientes = sinConfirmar(maquinas)

  /*
   * Mover se valida corriendo el mismo motor que dibuja el plan: si la
   * ejecución no queda exactamente donde se pidió, el movimiento se descarta
   * entero. Así nunca se guarda un anclaje que la vista no pueda honrar.
   */
  const mover = (destino: Anclaje) => {
    const r = moverOcurrencia(maquinas, tareas, config, anclajes, destino)
    if (r.ok) onCambiarAnclajes(r.anclajes)
    return { ok: r.ok, motivo: r.motivo }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Veredicto ────────────────────────────────────────────────────── */}
      <section
        className={cn(
          'flex flex-col gap-4 rounded-card border-l-[3px] bg-card p-4',
          v.cabe ? 'border-l-cat-2-ink' : 'border-l-destructive',
        )}
      >
        <div className="flex items-start gap-3">
          {v.cabe ? (
            <Check className="mt-0.5 h-6 w-6 shrink-0 text-cat-2-ink" />
          ) : (
            <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
          )}
          <div className="flex flex-col gap-1">
            <p className="text-title3 text-foreground">
              {v.cabe
                ? 'Todo el trabajo tiene hora'
                : `${v.pedidas - v.ubicadas} de ${v.pedidas} ejecuciones se quedan sin hora`}
            </p>
            <p className="text-body text-muted-foreground">
              {v.cabe ? (
                <>
                  Las {v.pedidas} ejecuciones de la semana caben en las ventanas, sin pisar a
                  higiene. Quedan{' '}
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {minutosAHorasTexto(Math.max(b.holguraTotalMin, 0))}
                  </span>{' '}
                  de holgura tras la reserva para correctivas.
                </>
              ) : (
                <>
                  {v.motivoPrincipal ? MOTIVO_TEXTO[v.motivoPrincipal] : 'No entran'}.{' '}
                  {v.motivoPrincipal === 'sin-gente'
                    ? 'Es un problema de dotación, no de horario: hay ventana, falta gente.'
                    : 'Es un problema de horario: hay que negociar ventana o mover la tarea.'}
                </>
              )}
            </p>
          </div>
        </div>

        <p className="text-caption text-muted-foreground">
          Las horas sueltas, como contexto: que alcancen no garantiza que quepan.
        </p>
        <BarraCarga
          etiqueta="Total"
          cargaMin={b.cargaTotalMin}
          disponibleMin={b.disponibleTotalMin}
          reservaMin={b.reservaMin}
        />
        <BarraCarga
          etiqueta="Con la máquina detenida"
          cargaMin={b.cargaConDetencionMin}
          disponibleMin={b.disponibleConDetencionMin}
        />

        {b.capacidad.pisandoHigieneMin > 0 && (
          <p className="text-footnote text-muted-foreground">
            Entrando donde higiene lava se ganarían{' '}
            <span className="font-mono tabular-nums">
              {minutosAHorasDecimal(b.capacidad.pisandoHigieneMin)} h
            </span>{' '}
            más, pero se los retrasa: no está contado en la capacidad de arriba.
          </p>
        )}
      </section>

      {pendientes.length > 0 && (
        <p className="flex items-start gap-2 px-1 text-footnote text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cat-4-ink" />
          <span>
            Este cálculo se apoya en {pendientes.length}{' '}
            {pendientes.length === 1 ? 'horario todavía sin confirmar' : 'horarios todavía sin confirmar'}{' '}
            en terreno ({pendientes.map((m) => m.nombre).join(', ')}). Las ventanas pueden no ser las
            reales, y con ellas cambia lo que cabe.
          </span>
        </p>
      )}

      <ProgramacionSemana
        prog={prog}
        maquinas={maquinas}
        anclajes={anclajes}
        onMover={mover}
        onSoltarAnclaje={(tareaId, ocurrencia) => onCambiarAnclajes(sinAnclaje(anclajes, tareaId, ocurrencia))}
        onRestablecer={() => onCambiarAnclajes([])}
      />

      {/* ── Palancas ─────────────────────────────────────────────────────── */}
      <ListGroup title="Con qué contamos" footer="Sube o baja la dotación para ver cuánto cambia lo que cabe.">
        <ListCell
          title="Personas por turno"
          subtitle="Nadie puede estar en dos máquinas a la vez: sumar gente no ayuda si no hay máquinas libres."
          value={
            <Contador
              valor={config.dotacion}
              min={1}
              max={20}
              onCambiar={(dotacion) => onCambiarConfig({ ...config, dotacion })}
            />
          }
        />
        <ListCell
          title="Reserva para correctivas"
          subtitle="Sin esto el plan alcanza justo, y la primera falla lo tumba."
          value={
            <Contador
              valor={config.reservaCorrectivasPct}
              min={0}
              max={90}
              paso={5}
              sufijo="%"
              onCambiar={(reservaCorrectivasPct) =>
                onCambiarConfig({ ...config, reservaCorrectivasPct })
              }
            />
          }
        />
      </ListGroup>

      {/* ── Tareas ───────────────────────────────────────────────────────── */}
      <ListGroup
        title={`Trabajo de la semana · ${activas.length} de ${tareas.length} activas`}
        footer="Apaga una tarea para ver qué pasa con el plan sin borrarla."
      >
        {tareas.map((t) => (
          <FilaTarea
            key={t.id}
            tarea={t}
            nombreMaquina={t.maquinaId ? nombrePorId.get(t.maquinaId) : null}
            maquinas={maquinas}
            onActualizar={(cambio) => actualizar(t.id, cambio)}
            onEliminar={() => onCambiarTareas(tareas.filter((x) => x.id !== t.id))}
          />
        ))}

        <div className="flex items-center gap-2 p-3">
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') agregar()
            }}
            placeholder="Agregar tarea…"
            className="h-11 min-w-0 flex-1 rounded-ctl border border-border bg-background px-3 text-body text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={agregar}
            disabled={!nuevoNombre.trim()}
            className="flex h-11 items-center gap-1.5 rounded-ctl bg-primary px-3.5 text-body font-medium text-primary-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </div>
      </ListGroup>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */

function BarraCarga({
  etiqueta,
  cargaMin,
  disponibleMin,
  reservaMin,
}: {
  etiqueta: string
  cargaMin: number
  disponibleMin: number
  reservaMin?: number
}) {
  const totalEscala = Math.max(disponibleMin + (reservaMin ?? 0), cargaMin, 1)
  const pctCarga = (cargaMin * 100) / totalEscala
  const pctDisponible = (Math.max(disponibleMin - cargaMin, 0) * 100) / totalEscala
  const pctReserva = ((reservaMin ?? 0) * 100) / totalEscala
  const excede = cargaMin > disponibleMin

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-footnote text-muted-foreground">{etiqueta}</span>
        <span className="font-mono text-footnote tabular-nums text-muted-foreground">
          <span className={cn('font-semibold', excede ? 'text-destructive' : 'text-foreground')}>
            {minutosAHorasDecimal(cargaMin)} h
          </span>{' '}
          de {minutosAHorasDecimal(disponibleMin)} h disponibles
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={excede ? 'bg-destructive' : 'bg-cat-2-tint'}
          style={{ width: `${Math.min(pctCarga, 100)}%` }}
        />
        <div className="bg-cat-2-tint/25" style={{ width: `${pctDisponible}%` }} />
        {pctReserva > 0 && (
          <div
            className="bg-muted-foreground/25"
            style={{ width: `${pctReserva}%` }}
            title="Reserva para correctivas"
          />
        )}
      </div>
    </div>
  )
}

function Contador({
  valor,
  min,
  max,
  paso = 1,
  sufijo,
  onCambiar,
}: {
  valor: number
  min: number
  max: number
  paso?: number
  sufijo?: string
  onCambiar: (v: number) => void
}) {
  const btn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-border text-muted-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  return (
    <span className="flex items-center gap-2">
      <button
        className={btn}
        onClick={() => onCambiar(Math.max(min, valor - paso))}
        disabled={valor <= min}
        aria-label="Menos"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-12 text-center font-mono text-headline tabular-nums text-foreground">
        {valor}
        {sufijo}
      </span>
      <button
        className={btn}
        onClick={() => onCambiar(Math.min(max, valor + paso))}
        disabled={valor >= max}
        aria-label="Más"
      >
        <Plus className="h-4 w-4" />
      </button>
    </span>
  )
}

function FilaTarea({
  tarea,
  nombreMaquina,
  maquinas,
  onActualizar,
  onEliminar,
}: {
  tarea: TareaMantencion
  nombreMaquina: string | null | undefined
  maquinas: MaquinaRueda[]
  onActualizar: (cambio: Partial<TareaMantencion>) => void
  onEliminar: () => void
}) {
  const [abierta, setAbierta] = useState(false)
  const carga = cargaSemanalMinutos(tarea)

  const campo =
    'h-10 w-full rounded-ctl border border-border bg-background px-2 text-body text-foreground'

  return (
    <div className={cn('flex flex-col', !tarea.activa && 'opacity-55')}>
      <ListCell
        title={tarea.nombre}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {tarea.minutos} min · {tarea.personas}{' '}
              {tarea.personas === 1 ? 'persona' : 'personas'} · {tarea.vecesPorSemana}×/semana
            </span>
            {nombreMaquina && <Pill tone="neutral">{nombreMaquina}</Pill>}
            {tarea.requiereDetencion && <Pill tone="warning">Máquina detenida</Pill>}
          </span>
        }
        value={
          <span className={tarea.activa ? undefined : 'line-through'}>
            {minutosAHorasTexto(carga)}
          </span>
        }
        valueSub="por semana"
        onClick={() => setAbierta((v) => !v)}
        chevron={false}
        trailing={
          <button
            onClick={(e) => {
              e.stopPropagation()
              onActualizar({ activa: !tarea.activa })
            }}
            aria-pressed={tarea.activa}
            className={cn(
              'flex h-7 items-center rounded-full px-2.5 text-caption font-semibold',
              tarea.activa ? 'bg-cat-2-tint/20 text-cat-2-ink' : 'bg-muted text-muted-foreground',
            )}
          >
            {tarea.activa ? 'Activa' : 'Apagada'}
          </button>
        }
      />

      {abierta && (
        <div className="flex flex-col gap-3 border-t border-border/50 bg-muted/20 px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-caption text-muted-foreground">
              Minutos
              <input
                type="number"
                min={5}
                step={5}
                className={campo}
                value={tarea.minutos}
                onChange={(e) => onActualizar({ minutos: Math.max(5, Number(e.target.value) || 5) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-caption text-muted-foreground">
              Personas
              <input
                type="number"
                min={1}
                className={campo}
                value={tarea.personas}
                onChange={(e) => onActualizar({ personas: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-caption text-muted-foreground">
              Veces/semana
              <input
                type="number"
                min={1}
                className={campo}
                value={tarea.vecesPorSemana}
                onChange={(e) =>
                  onActualizar({ vecesPorSemana: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-caption text-muted-foreground">
            Máquina
            <select
              className={campo}
              value={tarea.maquinaId ?? ''}
              onChange={(e) => onActualizar({ maquinaId: e.target.value || null })}
            >
              <option value="">Transversal (sin máquina)</option>
              {maquinas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => onActualizar({ requiereDetencion: !tarea.requiereDetencion })}
              aria-pressed={tarea.requiereDetencion}
              className={cn(
                'flex min-h-[44px] items-center gap-2 rounded-ctl px-3 text-footnote font-medium',
                tarea.requiereDetencion
                  ? 'bg-cat-4-tint/20 text-cat-4-ink'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {tarea.requiereDetencion ? 'Necesita la máquina detenida' : 'Se puede en marcha'}
            </button>

            <button
              onClick={onEliminar}
              className="flex min-h-[44px] items-center gap-1.5 rounded-ctl px-3 text-footnote text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
