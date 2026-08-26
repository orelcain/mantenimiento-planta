import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ListGroup, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import { BandaTurnos, EjeHoras, RejillaHoras } from './EjeDelDia'
import {
  DIAS_CORTOS,
  OCUPANTES,
  SLOTS_POR_DIA,
  agruparTramos,
  contarDia,
  slotAHora,
  slotsAHorasDecimal,
  slotsAHorasMinutos,
  type DiaRueda,
  type MaquinaRueda,
  type Ocupante,
} from '@/services/ruedaVentanas'

/**
 * Franja de 24 h — la vista para MOSTRAR, complementaria de la rueda.
 *
 * La rueda es el editor: el día es cíclico y pintar sobre un reloj es natural.
 * Pero para demostrar con datos falla en lo que aquí importa: un arco se juzga
 * por ángulo, y la gente estima mucho peor los ángulos que las longitudes sobre
 * un eje común. Y sobre todo, no se pueden comparar seis máquinas a la vez sin
 * poner seis relojes uno al lado del otro.
 *
 * La franja pone todo sobre el MISMO eje de tiempo: los choques de máquinas
 * distintas quedan alineados en vertical y se ve de una que ocurren a la misma
 * hora, que es justamente el argumento.
 */

const BG_OCUPANTE: Record<Ocupante, string> = {
  P: 'bg-cat-1-tint',
  H: 'bg-cat-7-tint',
  X: 'bg-cat-7-tint',
  C: 'bg-cat-3-tint',
  '0': 'bg-muted-foreground',
}
const OPACIDAD_OCUPANTE: Record<Ocupante, number> = { P: 0.5, H: 0.62, X: 0.62, C: 0.45, '0': 0.14 }

function pct(slots: number): string {
  return `${(slots * 100) / SLOTS_POR_DIA}%`
}

function ocupanteDe(v: string): Ocupante {
  return (OCUPANTES as string[]).includes(v) ? (v as Ocupante) : '0'
}

/** Una fila = un día de una máquina sobre el eje de 24 h. */
function Fila({
  dia,
  etiqueta,
  destacada,
  sinConfirmar: pendiente,
}: {
  dia: DiaRueda
  etiqueta: string
  destacada?: boolean
  /** Marca la fila cuyo horario todavía no se comparó con la operación real. */
  sinConfirmar?: boolean
}) {
  const gruposArea = useMemo(() => agruparTramos(dia.areas), [dia.areas])
  const gruposMant = useMemo(() => agruparTramos(dia.mant), [dia.mant])
  const r = useMemo(() => contarDia(dia), [dia])

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'w-28 shrink-0 truncate text-footnote sm:w-36',
          destacada ? 'font-semibold text-foreground' : 'text-muted-foreground',
        )}
        title={pendiente ? `${etiqueta} · horario sin confirmar en terreno` : etiqueta}
      >
        {etiqueta}
        {pendiente && <span className="ml-1 text-cat-4-ink" aria-label="sin confirmar">*</span>}
      </span>

      <div className="relative h-8 min-w-0 flex-1 overflow-hidden rounded-ctl bg-muted/30">
        {/* Ocupación */}
        <div className="absolute inset-0 flex">
          {gruposArea.map((g) => {
            const oc = ocupanteDe(g.valor)
            return (
              <div
                key={`a${g.inicio}`}
                className={BG_OCUPANTE[oc]}
                style={{ width: pct(g.largo), opacity: OPACIDAD_OCUPANTE[oc] }}
              />
            )
          })}
        </div>

        {/* Rejilla horaria por encima del color, para poder leer a qué hora pasa */}
        <RejillaHoras />

        {/* Intervención de Mantención: banda inferior. Va DENTRO de la misma
            franja y no en una fila aparte para que se lea el solapamiento. */}
        <div className="absolute inset-x-0 bottom-0 flex h-2.5">
          {gruposMant.map((g) => {
            if (g.valor !== '1') return <div key={`m${g.inicio}`} style={{ width: pct(g.largo) }} />
            // Dentro del bloque de intervención, los tramos con higiene encima
            // se pintan de alarma: ese pedazo es trabajo con agua.
            const sub = agruparTramos(
              Array.from({ length: g.largo }, (_, k) => {
                const oc = dia.areas[g.inicio + k]
                return oc === 'H' || oc === 'X' ? 'x' : 'm'
              }).join('') + '0'.repeat(SLOTS_POR_DIA - g.largo),
            ).filter((s) => s.inicio < g.largo)
            return (
              <div key={`m${g.inicio}`} className="flex" style={{ width: pct(g.largo) }}>
                {sub.map((s) => (
                  <div
                    key={s.inicio}
                    className={s.valor === 'x' ? 'bg-destructive' : 'bg-cat-4-tint'}
                    style={{ width: `${(s.largo * 100) / g.largo}%` }}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex w-24 shrink-0 flex-col items-end sm:w-32">
        <span className="font-mono text-footnote tabular-nums text-foreground">
          {slotsAHorasDecimal(r.libres)} h libres
        </span>
        {r.condicion.agua > 0 && (
          <span className="flex items-center gap-1 font-mono text-caption tabular-nums text-destructive">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {slotsAHorasDecimal(r.condicion.agua)} h agua
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Leyenda. No es decorativa: sin ella la franja depende SOLO del color, y quien
 * recibe el link compartido no tiene de dónde deducir qué es cada tono.
 */
function LeyendaFranja() {
  const ocupacion: Array<{ clase: string; label: string; opacidad: number }> = [
    { clase: 'bg-cat-1-tint', label: 'Proceso', opacidad: 0.5 },
    { clase: 'bg-cat-7-tint', label: 'Higiene', opacidad: 0.62 },
    { clase: 'bg-cat-3-tint', label: 'Línea parada', opacidad: 0.45 },
    { clase: 'bg-muted-foreground', label: 'Sin nadie', opacidad: 0.14 },
  ]
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-caption text-muted-foreground">Franja:</span>
        {ocupacion.map((i) => (
          <span key={i.label} className="flex items-center gap-1.5 text-footnote text-muted-foreground">
            <span className={cn('h-3 w-3 rounded-[3px]', i.clase)} style={{ opacity: i.opacidad }} />
            {i.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-caption text-muted-foreground">Banda inferior:</span>
        <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
          <span className="h-2 w-4 rounded-[2px] bg-cat-4-tint" />
          Mantención interviene
        </span>
        <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
          <span className="h-2 w-4 rounded-[2px] bg-destructive" />
          Con higiene encima
        </span>
        <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
          <span className="text-cat-4-ink">*</span>
          Horario sin confirmar en terreno
        </span>
      </div>
    </div>
  )
}

export interface FranjaVentanasProps {
  maquinas: MaquinaRueda[]
  diaIdx: number
  maquinaActivaId: string
}

export function FranjaVentanas({ maquinas, diaIdx, maquinaActivaId }: FranjaVentanasProps) {
  const activa = maquinas.find((m) => m.id === maquinaActivaId) ?? maquinas[0]

  /** Horas en que alguna máquina tiene choque, para nombrarlas en palabras. */
  const horasEnConflicto = useMemo(() => {
    const marcados = new Set<number>()
    for (const m of maquinas) {
      const d = m.semana[diaIdx]
      if (!d) continue
      for (let i = 0; i < SLOTS_POR_DIA; i++) {
        const oc = d.areas[i]
        if (d.mant[i] === '1' && (oc === 'H' || oc === 'X')) marcados.add(i)
      }
    }
    return agruparTramos(
      Array.from({ length: SLOTS_POR_DIA }, (_, i) => (marcados.has(i) ? '1' : '0')).join(''),
    ).filter((g) => g.valor === '1')
  }, [maquinas, diaIdx])

  const totalAgua = useMemo(
    () =>
      maquinas.reduce((a, m) => {
        const d = m.semana[diaIdx]
        return a + (d ? contarDia(d).condicion.agua : 0)
      }, 0),
    [maquinas, diaIdx],
  )

  return (
    <div className="flex flex-col gap-6">
      <ListGroup
        title={`Todas las máquinas · ${DIAS_CORTOS[diaIdx]}`}
        footer="Todas sobre el mismo eje de tiempo: los choques que caen a la misma hora quedan alineados en vertical."
      >
        <div className="flex flex-col gap-2.5 overflow-x-auto p-4">
          <div className="min-w-[34rem]">
            <div className="flex flex-col gap-2.5">
              <EjeHoras />
              <BandaTurnos />
              {maquinas.map((m) => {
                const d = m.semana[diaIdx]
                if (!d) return null
                return (
                  <Fila
                    key={m.id}
                    dia={d}
                    etiqueta={m.nombre}
                    destacada={m.id === maquinaActivaId}
                    sinConfirmar={m.revisadoEnTerreno !== true}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </ListGroup>

      {totalAgua > 0 && (
        <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-title2 tabular-nums text-destructive">
              {slotsAHorasMinutos(totalAgua)}
            </span>
            <span className="text-body text-foreground">de intervención con higiene encima este día</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-footnote text-muted-foreground">Se concentra en:</span>
            {horasEnConflicto.map((g) => (
              <Pill key={g.inicio} tone="critical">
                {slotAHora(g.inicio)} — {slotAHora(g.inicio + g.largo)}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {activa && (
        <ListGroup
          title={`Semana de ${activa.nombre}`}
          footer="La misma lectura, día por día: si la franja roja se repite todos los días, el choque no es un accidente."
        >
          <div className="flex flex-col gap-2.5 overflow-x-auto p-4">
            <div className="min-w-[34rem]">
              <div className="flex flex-col gap-2.5">
                <EjeHoras />
                <BandaTurnos />
                {activa.semana.map((d, i) => (
                  <Fila key={i} dia={d} etiqueta={DIAS_CORTOS[i] ?? ''} destacada={i === diaIdx} />
                ))}
              </div>
            </div>
          </div>
        </ListGroup>
      )}

      {/* Una sola vez para toda la vista: repetirla por bloque era ruido (§63). */}
      <div className="rounded-card bg-card">
        <LeyendaFranja />
      </div>
    </div>
  )
}
