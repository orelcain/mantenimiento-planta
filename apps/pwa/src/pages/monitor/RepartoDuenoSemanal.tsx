/**
 * «De quién fue la pérdida» — reparto semanal por dueño (opción A «Dos pisos»
 * del mockup de la directora, elegida por Orel 29-08).
 *
 * ── Las decisiones que NO se pueden deshacer sin releer el mockup ───────────
 * · La barra apilada va en PIEZAS POR TURNO, no absolutas ni al 100%: en
 *   absoluto una semana de 12 turnos parece 2,4× peor que una de 5 (eran
 *   idénticas: 53 y 53 min/turno), y al 100% la MEJOR semana del mes se veía
 *   como la de más ámbar. Los minutos van escritos al lado, nunca en la barra.
 * · El gris (sin imputar) va SIEMPRE al final del apilado — equipos y externo
 *   quedan anclados al borde y se comparan entre semanas — y no entra al
 *   segundo piso: sobre una semana sola el reparto imputado es ruido, por eso
 *   el duelo equipos-vs-externo va ACUMULADO.
 * · El veredicto redondea EN CONTRA de Mantención («1 de cada N» con N hacia
 *   abajo): una cifra que favorece al que la publica no sobrevive la auditoría.
 * · Colores SOLO vía DUENO_UI (ley del monitor): relleno con `.barra`, texto
 *   con `.clase` — pintar texto con el token de relleno reprueba AA en claro.
 */
import { useMemo } from 'react'
import type { ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import { DUENO_UI } from './duenoUi'
import { Bloque } from './MonitorShiftParts'
import { lunesDe, repartoSemanal, type DuenoReparto, type SemanaReparto } from './repartoSemanal'

const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const fmtInt = (n: number) => nf.format(Math.round(n || 0))
const nf1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const etiquetaSemana = (lunes: string) => {
  const d = new Date(`${lunes}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? lunes : `${d.getUTCDate()}-${MES[d.getUTCMonth()]}`
}

/** El lunes de ESTA semana en reloj de planta (para decir «esta semana» solo
    cuando lo es — la piel de honestidad del bloque). */
const lunesDeHoyPlanta = () =>
  lunesDe(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()))

const ORDEN: DuenoReparto[] = ['mantencion', 'externo', 'sin-imputar']
const LABEL: Record<DuenoReparto, string> = {
  mantencion: 'Equipos (Mantención)',
  externo: 'Externo (MMPP y proceso)',
  'sin-imputar': 'Sin imputar',
}

const totalPz = (s: SemanaReparto) => s.pz.mantencion + s.pz.externo + s.pz['sin-imputar']
const totalMin = (s: SemanaReparto) => s.min.mantencion + s.min.externo + s.min['sin-imputar']

export function RepartoDuenoSemanal({ stats }: { stats?: ShiftStat[] | null }) {
  const semanas = useMemo(() => repartoSemanal(stats, 6).filter((s) => totalPz(s) > 0), [stats])
  if (semanas.length < 2) return null

  const actual = semanas[semanas.length - 1]!
  const esEstaSemana = actual.semana === lunesDeHoyPlanta()
  const nombreActual = esEstaSemana ? 'esta semana' : `la semana del ${etiquetaSemana(actual.semana)}`

  const eqTot = semanas.reduce((a, s) => a + s.pz.mantencion, 0)
  const exTot = semanas.reduce((a, s) => a + s.pz.externo, 0)
  const todoTot = semanas.reduce((a, s) => a + totalPz(s), 0)
  const pctEquipos = todoTot > 0 ? Math.round((eqTot / todoTot) * 100) : 0
  const maxPorTurno = Math.max(...semanas.map((s) => totalPz(s) / Math.max(1, s.turnos)), 1)

  /* El veredicto, generado con las reglas del mockup. */
  const totalAct = totalPz(actual)
  const eqAct = actual.pz.mantencion
  const grisFrac = totalAct > 0 ? actual.pz['sin-imputar'] / totalAct : 0
  const titular = eqAct > 0
    ? `Equipos explica 1 de cada ${Math.max(1, Math.floor(totalAct / eqAct))} piezas perdidas ${nombreActual}.`
    : `Sin pérdidas imputadas a equipos ${nombreActual}.`
  const detalle = grisFrac >= 0.4
    ? `≈${fmtInt(eqAct)} pz de ≈${fmtInt(totalAct)}. Lo más grande —≈${fmtInt(actual.pz['sin-imputar'])} pz, ${fmtInt(actual.min['sin-imputar'])} min— todavía no tiene causa anotada: hasta que se impute, esa parte no la explica nadie.`
    : eqAct > 0 && actual.pz.externo > 0
      ? `≈${fmtInt(eqAct)} pz de ≈${fmtInt(totalAct)}. Externo pesó ${nf1.format(actual.pz.externo / eqAct)}× lo de equipos ${nombreActual}.`
      : `≈${fmtInt(eqAct)} pz de ≈${fmtInt(totalAct)} perdidas ${nombreActual}.`

  return (
    <Bloque
      id="dueno-semanal"
      titulo="De quién fue la pérdida"
      /* Abierto: vive en la pestaña «Análisis», y tocarla YA es pedir verlo. */
      extra={<span className="normal-case tabular-nums">{semanas.length} sem · equipos {pctEquipos}%</span>}
    >
      {/* La conclusión ANTES que el dibujo, como todo el monitor. */}
      <p className="mt-2 text-footnote leading-snug text-foreground">
        <b>{titular}</b>
      </p>
      <p className="mt-0.5 text-caption leading-snug text-muted-foreground">{detalle}</p>

      {/* Piso 1 · el apilado por semana, en piezas POR TURNO, gris al final. */}
      <div className="mt-3 space-y-2">
        {semanas.map((s) => {
          const porTurno = totalPz(s) / Math.max(1, s.turnos)
          return (
            <div key={s.semana}>
              <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
                <span className={s === actual ? 'font-semibold text-foreground' : ''}>
                  {etiquetaSemana(s.semana)}
                  <span className="text-muted-foreground/80"> · {s.turnos} turnos</span>
                </span>
                <span>≈{fmtInt(porTurno)} pz/turno · {fmtInt(totalMin(s))} min</span>
              </div>
              <div className="mt-0.5 flex h-[18px] gap-[2px]">
                {ORDEN.map((d) => {
                  const w = (s.pz[d] / Math.max(1, s.turnos)) / maxPorTurno
                  if (!(w > 0)) return null
                  return (
                    <span
                      key={d}
                      className={`rounded-[3px] ${DUENO_UI[d].barra}`}
                      style={{ width: `${w * 100}%`, minWidth: 4 }}
                      title={`${LABEL[d]}: ≈${fmtInt(s.pz[d])} pz · ${fmtInt(s.min[d])} min`}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {ORDEN.map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-[3px] ${DUENO_UI[d].barra}`} />
            {LABEL[d]}
          </span>
        ))}
      </div>

      {/* Piso 2 · el duelo equipos-vs-externo, ACUMULADO y sin el gris. */}
      {eqTot + exTot > 0 && (
        <div className="mt-3 rounded-[10px] bg-muted p-3">
          <div className="text-[11px] font-semibold text-muted-foreground">
            De lo que sí tiene dueño · {semanas.length} semanas acumuladas
          </div>
          <div className="mt-1.5 flex h-[14px] gap-[2px]">
            <span
              className={`rounded-[3px] ${DUENO_UI.mantencion.barra}`}
              style={{ width: `${(eqTot / (eqTot + exTot)) * 100}%`, minWidth: 4 }}
            />
            <span
              className={`rounded-[3px] ${DUENO_UI.externo.barra}`}
              style={{ width: `${(exTot / (eqTot + exTot)) * 100}%`, minWidth: 4 }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] tabular-nums">
            <span className={DUENO_UI.mantencion.clase}>
              {Math.round((eqTot / (eqTot + exTot)) * 100)}% equipos · ≈{fmtInt(eqTot)} pz
            </span>
            <span className={DUENO_UI.externo.clase}>
              {Math.round((exTot / (eqTot + exTot)) * 100)}% externo · ≈{fmtInt(exTot)} pz
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">
            Lo imputado es el {todoTot > 0 ? Math.round(((eqTot + exTot) / todoTot) * 100) : 0}% del
            total perdido — el resto aún no tiene causa anotada.
          </p>
        </div>
      )}

      {/* Piso 3 · la tira «equipos por turno»: la evidencia más difícil de
          discutir, en el idioma de barras con número que la página ya habla. */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold text-muted-foreground">
          Equipos · piezas perdidas por turno
        </div>
        <div className="mt-1 flex items-end gap-1.5" style={{ height: 56 }}>
          {semanas.map((s) => {
            const v = s.pz.mantencion / Math.max(1, s.turnos)
            const max = Math.max(...semanas.map((x) => x.pz.mantencion / Math.max(1, x.turnos)), 1)
            return (
              <div key={s.semana} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
                <span className={`text-[11px] tabular-nums ${DUENO_UI.mantencion.clase}`}>≈{fmtInt(v)}</span>
                <span
                  className={`w-full max-w-[34px] rounded-t-[3px] ${DUENO_UI.mantencion.barra}`}
                  style={{ height: `${Math.max(4, (v / max) * 36)}px` }}
                />
              </div>
            )
          })}
        </div>
        <div className="mt-0.5 flex gap-1.5 text-center text-[11px] tabular-nums text-muted-foreground/80">
          {semanas.map((s) => (
            <span key={s.semana} className="min-w-0 flex-1">{etiquetaSemana(s.semana)}</span>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-muted-foreground/80">
        Minutos recuperables de cada turno llevados a minutos de LÍNEA y valorizados al ritmo
        propio de ese turno. Lo «sin imputar» no es de nadie todavía: anotarle la causa en
        Shoplogix completa esta historia.
      </p>
    </Bloque>
  )
}
