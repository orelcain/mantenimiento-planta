/**
 * «Ver otro día»: un calendario de los últimos 45 días. Cada día muestra las miles de piezas de las Baader del
 * Turno 1 (arriba) y del Turno 2 (abajo); se toca el día y abajo salen sus turnos para abrir uno (como el
 * calendario del iPhone: la celda es el blanco de 44 px, no cada turno dentro de ella). Los días sin turno quedan
 * apagados y no se pueden tocar. Aprobado por Orel el 21-11 (opción A del mockup).
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { ListCell, ListGroup, Sheet } from '@/components/piel'
import { celdasDelMes, mesesConTurnos, milesCorto, turnosPorDia, type TurnoNavegable } from './turnosArchivo'

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function fmtDia(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  const s = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtMes(mes: string): string {
  const d = new Date(`${mes}-15T12:00:00`)
  if (Number.isNaN(d.getTime())) return mes
  const s = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }).replace(' de ', ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Las piezas del turno con ese nombre en el día (extraordinarios aparte: salen solo en la lista de abajo). */
function piezasDe(turnos: TurnoNavegable[] | undefined, shiftId: string): number | null | undefined {
  const t = turnos?.find((x) => !x.extraordinario && x.shiftId === shiftId)
  return t ? t.piezas : undefined
}

export function OtroDiaSheet({ open, onClose, lista, actualId, onElegir }: {
  open: boolean
  onClose: () => void
  lista: TurnoNavegable[]
  /** El turno que se está mirando: va marcado. */
  actualId: string | null
  onElegir: (t: TurnoNavegable, esVigente: boolean) => void
}) {
  const vigenteId = lista[0]?.shiftDocId ?? null
  const porDia = useMemo(() => turnosPorDia(lista), [lista])
  const meses = useMemo(() => mesesConTurnos(lista), [lista])
  const diaActual = lista.find((t) => t.shiftDocId === actualId)?.dateKey ?? lista[0]?.dateKey ?? null
  const [dia, setDia] = useState<string | null>(diaActual)
  const [mes, setMes] = useState<string | null>(diaActual?.slice(0, 7) ?? null)

  // Al abrir, parte en el día que se está mirando.
  useEffect(() => {
    if (!open) return
    setDia(diaActual)
    setMes(diaActual?.slice(0, 7) ?? meses[meses.length - 1] ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const iMes = mes ? meses.indexOf(mes) : -1
  const turnosDelDia = dia ? porDia.get(dia) ?? [] : []
  const flecha = 'inline-flex h-[44px] w-[44px] items-center justify-center rounded-full text-primary transition-colors enabled:hover:bg-muted disabled:opacity-30'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ver otro día"
      description="Últimos 45 días. Toca un día y elige el turno."
      surface="grouped"
    >
      <div className="flex flex-col gap-4 pb-4">
        {mes && (
          <div>
            <div className="flex items-center justify-between">
              <button type="button" aria-label="Mes anterior" className={flecha} disabled={iMes <= 0} onClick={() => setMes(meses[iMes - 1] ?? mes)}>
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <p className="text-[17px] font-semibold leading-[22px]" aria-live="polite">{fmtMes(mes)}</p>
              <button type="button" aria-label="Mes siguiente" className={flecha} disabled={iMes < 0 || iMes >= meses.length - 1} onClick={() => setMes(meses[iMes + 1] ?? mes)}>
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5" role="group" aria-label={`Días de ${fmtMes(mes)}`}>
              {DIAS_SEMANA.map((d, i) => (
                <div key={i} className="py-1 text-center text-[11px] leading-[13px] text-muted-foreground" aria-hidden>{d}</div>
              ))}
              {celdasDelMes(mes).map((c, i) => {
                if (!c) return <div key={`r${i}`} aria-hidden />
                const turnos = porDia.get(c.dateKey)
                const t1 = piezasDe(turnos, 'Turno 1')
                const t2 = piezasDe(turnos, 'Turno 2')
                const marcado = c.dateKey === dia
                const conTurno = Boolean(turnos?.length)
                const nombre = conTurno
                  ? `${fmtDia(c.dateKey)}. ${turnos!.map((t) => `${t.extraordinario ? 'Turno extraordinario' : t.shiftId}${t.piezas != null ? ` ${t.piezas.toLocaleString('es-CL')} piezas` : ''}`).join(', ')}`
                  : `${fmtDia(c.dateKey)}. Sin turnos`
                return (
                  <button
                    key={c.dateKey}
                    type="button"
                    data-dia={c.dateKey}
                    aria-label={nombre}
                    aria-pressed={marcado}
                    disabled={!conTurno}
                    onClick={() => setDia(c.dateKey)}
                    className={`flex min-h-[52px] flex-col items-center rounded-[10px] px-0.5 py-1 tabular-nums transition-colors disabled:opacity-30 ${marcado ? 'bg-primary text-primary-foreground' : 'enabled:hover:bg-muted'}`}
                  >
                    <span className="text-[15px] leading-[20px]">{c.dia}</span>
                    {conTurno && (
                      <>
                        <span className={`text-[11px] leading-[13px] ${marcado ? 'opacity-85' : 'text-muted-foreground'}`}>{t1 === undefined ? '—' : milesCorto(t1)}</span>
                        <span className={`text-[11px] leading-[13px] ${marcado ? 'opacity-85' : 'text-muted-foreground'}`}>{t2 === undefined ? '—' : milesCorto(t2)}</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 px-1 text-[12px] leading-[16px] text-muted-foreground">Miles de piezas de las Baader: Turno 1 arriba, Turno 2 abajo.</p>
          </div>
        )}
        {dia && turnosDelDia.length > 0 && (
          <ListGroup title={fmtDia(dia)}>
            {turnosDelDia.map((t) => {
              const esVigente = t.shiftDocId === vigenteId
              const marcado = t.shiftDocId === actualId
              return (
                <ListCell
                  key={t.shiftDocId}
                  data-turno={t.shiftDocId}
                  aria-current={marcado ? 'true' : undefined}
                  title={t.extraordinario ? 'Turno extraordinario' : t.shiftId}
                  subtitle={[esVigente ? 'Turno actual' : null, t.ini ? `Desde ${t.ini}` : null].filter(Boolean).join(' · ') || undefined}
                  value={t.piezas != null ? `${t.piezas.toLocaleString('es-CL')} pz` : undefined}
                  trailing={marcado ? <Check className="size-5 text-primary" aria-label="Lo estás mirando" /> : undefined}
                  chevron={false}
                  onClick={() => onElegir(t, esVigente)}
                />
              )
            })}
          </ListGroup>
        )}
      </div>
    </Sheet>
  )
}
