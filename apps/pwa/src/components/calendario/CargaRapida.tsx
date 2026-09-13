import { useState } from 'react'
import { Check, Copy, CopyPlus, Paintbrush } from 'lucide-react'
import { ListGroup } from '@/components/piel'
import { cn } from '@/lib/utils'
import {
  DIAS_CORTOS,
  DIAS_SEMANA,
  copiarDia,
  copiarSemanaDesde,
  pintarHoras,
  slotDeHora,
  type MaquinaRueda,
  type Ocupante,
} from '@/services/ruedaVentanas'

/**
 * Cargar el horario sin pintar tramo por tramo.
 *
 * Pintar a mano son 288 tramos por día y 7 días por máquina: en una planta de
 * seis equipos, 42 días de arrastre. Con eso el horario real no se carga nunca y
 * el módulo se queda para siempre con la base de ejemplo.
 *
 * Las tres formas de acá cubren cómo se describe un horario en voz alta: «de 8 a
 * 13 hay proceso», «el martes es igual al lunes», «la N3 funciona como la N2».
 */

/**
 * Lo que se puede pintar por horas. Incluye la capa de Mantención: antes solo
 * estaban los ocupantes, así que el horario de proceso se podía escribir —«de 8
 * a 13 hay proceso»— pero el tiempo de intervención había que dibujarlo a mano
 * sobre la rueda. Era el único dato del módulo sin forma de escribirse.
 */
type Pintable = Ocupante | 'M1' | 'M0'

const PINTABLES: Array<{ valor: Pintable; label: string; capa: 'areas' | 'mant' }> = [
  { valor: 'P', label: 'Proceso', capa: 'areas' },
  { valor: 'H', label: 'Higiene', capa: 'areas' },
  { valor: 'X', label: 'Higiene en colación', capa: 'areas' },
  { valor: 'C', label: 'Colación sola', capa: 'areas' },
  { valor: '0', label: 'Liberar', capa: 'areas' },
  { valor: 'M1', label: 'Mantención interviene', capa: 'mant' },
  { valor: 'M0', label: 'Quitar mantención', capa: 'mant' },
]

const COLOR_SWATCH: Record<Pintable, string> = {
  P: 'bg-cat-1-tint',
  H: 'bg-cat-7-tint',
  X: 'bg-cat-7-tint ring-2 ring-inset ring-cat-3-tint',
  C: 'bg-cat-3-tint',
  '0': 'bg-muted-foreground/20',
  M1: 'bg-cat-4-tint',
  M0: 'border border-dashed border-muted-foreground',
}

export interface CargaRapidaProps {
  maquina: MaquinaRueda
  maquinas: MaquinaRueda[]
  diaIdx: number
  onCambiarMaquina: (m: MaquinaRueda) => void
}

export function CargaRapida({ maquina, maquinas, diaIdx, onCambiarMaquina }: CargaRapidaProps) {
  const [desde, setDesde] = useState('08:00')
  const [hasta, setHasta] = useState('13:00')
  const [pintable, setPintable] = useState<Pintable>('P')
  const [destinos, setDestinos] = useState<number[]>([])
  const [origenMaquina, setOrigenMaquina] = useState('')
  const [hecho, setHecho] = useState<string | null>(null)

  const avisar = (texto: string) => {
    setHecho(texto)
    setTimeout(() => setHecho(null), 4000)
  }

  const aSlot = (hhmm: string): number | null => {
    const [h, m] = hhmm.split(':').map(Number)
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null
    return slotDeHora(h, m)
  }

  const pintarTramo = () => {
    const a = aSlot(desde)
    const b = aSlot(hasta)
    if (a === null || b === null) return
    const dia = maquina.semana[diaIdx]
    if (!dia) return

    const def = PINTABLES.find((p) => p.valor === pintable)!
    // La capa de Mantención se pinta ENCIMA sin tocar la de abajo, igual que con
    // la brocha: si borrara la ocupación, se perdería el registro del choque.
    const nuevo =
      def.capa === 'mant'
        ? { ...dia, mant: pintarHoras(dia.mant, a, b, pintable === 'M1' ? '1' : '0') }
        : { ...dia, areas: pintarHoras(dia.areas, a, b, pintable) }

    onCambiarMaquina({
      ...maquina,
      semana: maquina.semana.map((d, i) => (i === diaIdx ? nuevo : d)),
    })
    avisar(`${def.label} de ${desde} a ${hasta} en ${DIAS_SEMANA[diaIdx]}`)
  }

  const copiar = () => {
    if (!destinos.length) return
    onCambiarMaquina(copiarDia(maquina, diaIdx, destinos))
    avisar(
      `${DIAS_SEMANA[diaIdx]} copiado a ${destinos.map((d) => DIAS_CORTOS[d]).join(', ')}`,
    )
    setDestinos([])
  }

  const copiarDeOtra = () => {
    const origen = maquinas.find((m) => m.id === origenMaquina)
    if (!origen) return
    onCambiarMaquina(copiarSemanaDesde(maquina, origen))
    avisar(`Semana copiada desde ${origen.nombre}`)
    setOrigenMaquina('')
  }

  const chip =
    'min-h-[44px] min-w-[3rem] rounded-ctl px-3 text-footnote font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none'
  const campo = 'h-11 rounded-ctl border border-border bg-background px-2.5 text-body text-foreground'
  const accion =
    'flex min-h-[44px] items-center gap-1.5 rounded-ctl bg-primary px-3.5 text-body font-medium text-primary-foreground disabled:opacity-40'

  const otras = maquinas.filter((m) => m.id !== maquina.id)

  return (
    <ListGroup
      title="Cargar rápido"
      footer="Pintar a mano son 288 tramos por día. Esto es para describir el horario como se dice en voz alta."
    >
      <div className="flex flex-col gap-5 p-4">
        {hecho && (
          <p
            role="status"
            className="flex items-center gap-1.5 rounded-ctl bg-cat-2-tint/15 px-3 py-2 text-footnote text-cat-2-ink"
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
            {hecho}
          </p>
        )}

        {/* ── Pintar un tramo por horas ─────────────────────────────────── */}
        <div className="flex flex-col gap-2.5">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Paintbrush className="h-3.5 w-3.5" />
            Pintar un tramo de {DIAS_SEMANA[diaIdx]}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-caption text-muted-foreground">
              Desde
              <input type="time" step={300} value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-caption text-muted-foreground">
              Hasta
              <input type="time" step={300} value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo} />
            </label>
            <button onClick={pintarTramo} className={accion}>
              Pintar
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {PINTABLES.filter((p) => p.capa === 'areas').map((p) => (
                <button
                  key={p.valor}
                  onClick={() => setPintable(p.valor)}
                  aria-pressed={pintable === p.valor}
                  className={cn(
                    'flex items-center gap-2',
                    chip,
                    pintable === p.valor
                      ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary'
                      : 'bg-muted/50 text-muted-foreground',
                  )}
                >
                  <span className={cn('h-3 w-3 shrink-0 rounded-[3px]', COLOR_SWATCH[p.valor])} />
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-muted-foreground">Encima:</span>
              {PINTABLES.filter((p) => p.capa === 'mant').map((p) => (
                <button
                  key={p.valor}
                  onClick={() => setPintable(p.valor)}
                  aria-pressed={pintable === p.valor}
                  className={cn(
                    'flex items-center gap-2',
                    chip,
                    pintable === p.valor
                      ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary'
                      : 'bg-muted/50 text-muted-foreground',
                  )}
                >
                  <span className={cn('h-3 w-3 shrink-0 rounded-[3px]', COLOR_SWATCH[p.valor])} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Copiar el día a otros días ────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 border-t border-border/50 pt-4">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Copy className="h-3.5 w-3.5" />
            Copiar {DIAS_SEMANA[diaIdx]} a otros días
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DIAS_CORTOS.map((d, i) => {
              if (i === diaIdx) return null
              const activo = destinos.includes(i)
              return (
                <button
                  key={d}
                  onClick={() =>
                    setDestinos((prev) => (activo ? prev.filter((x) => x !== i) : [...prev, i]))
                  }
                  aria-pressed={activo}
                  className={cn(
                    chip,
                    activo
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground',
                  )}
                >
                  {d}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setDestinos([0, 1, 2, 3, 4].filter((d) => d !== diaIdx))}
              className={cn(chip, 'bg-muted/50 text-muted-foreground')}
            >
              Lun a Vie
            </button>
            <button onClick={copiar} disabled={!destinos.length} className={accion}>
              Copiar a {destinos.length || 'ningún'} {destinos.length === 1 ? 'día' : 'días'}
            </button>
          </div>
        </div>

        {/* ── Copiar la semana de otra máquina ──────────────────────────── */}
        {otras.length > 0 && (
          <div className="flex flex-col gap-2.5 border-t border-border/50 pt-4">
            <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <CopyPlus className="h-3.5 w-3.5" />
              Copiar la semana completa de otra máquina
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={origenMaquina}
                onChange={(e) => setOrigenMaquina(e.target.value)}
                aria-label="Máquina de origen"
                className={cn(campo, 'min-w-[12rem]')}
              >
                <option value="">Elegir máquina…</option>
                {otras.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              <button onClick={copiarDeOtra} disabled={!origenMaquina} className={accion}>
                Copiar a {maquina.nombre}
              </button>
            </div>
            <p className="text-caption text-muted-foreground">
              Reemplaza los 7 días. Queda como sin confirmar: el horario copiado todavía no se
              comparó con la operación de esta máquina.
            </p>
          </div>
        )}
      </div>
    </ListGroup>
  )
}
