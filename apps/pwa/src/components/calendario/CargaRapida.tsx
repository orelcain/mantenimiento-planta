import { useState } from 'react'
import { Check, Copy, CopyPlus, Paintbrush } from 'lucide-react'
import { ListGroup } from '@/components/piel'
import { cn } from '@/lib/utils'
import {
  DIAS_CORTOS,
  DIAS_SEMANA,
  OCUPANTE_LABEL,
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

const OCUPANTES_PINTABLES: Ocupante[] = ['P', 'H', 'X', 'C', '0']

const COLOR_SWATCH: Record<Ocupante, string> = {
  P: 'bg-cat-1-tint',
  H: 'bg-cat-7-tint',
  X: 'bg-cat-7-tint ring-2 ring-inset ring-cat-3-tint',
  C: 'bg-cat-3-tint',
  '0': 'bg-muted-foreground/20',
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
  const [ocupante, setOcupante] = useState<Ocupante>('P')
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
    const areas = pintarHoras(dia.areas, a, b, ocupante)
    onCambiarMaquina({
      ...maquina,
      semana: maquina.semana.map((d, i) => (i === diaIdx ? { ...d, areas } : d)),
    })
    avisar(`${OCUPANTE_LABEL[ocupante]} de ${desde} a ${hasta} en ${DIAS_SEMANA[diaIdx]}`)
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
          <div className="flex flex-wrap gap-2">
            {OCUPANTES_PINTABLES.map((o) => (
              <button
                key={o}
                onClick={() => setOcupante(o)}
                aria-pressed={ocupante === o}
                className={cn(
                  'flex items-center gap-2',
                  chip,
                  ocupante === o
                    ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary'
                    : 'bg-muted/50 text-muted-foreground',
                )}
              >
                <span className={cn('h-3 w-3 shrink-0 rounded-[3px]', COLOR_SWATCH[o])} />
                {OCUPANTE_LABEL[o]}
              </button>
            ))}
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
