import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button, Pill } from '@/components/piel'
import { useBitacoraTurno, useTurnoMantencionActual } from '@/hooks/useBitacoraTurno'
import { resumirBitacora } from '@/services/bitacora/resumenBitacora'
import { esBorrador, soloListos } from '@/services/bitacora/borradores'
import { etiquetaTurno, formatoMinutos, horarioTurno } from '@/services/bitacora/turnoMantencion'

/**
 * Acceso inmediato a la bitácora del turno que está corriendo: lo primero del
 * Inicio. Cambia sola al turno siguiente (00, 08 y 16 h).
 */
export function BitacoraTurnoCard({
  useEventos = useBitacoraTurno,
  alAgregar,
  alVer,
}: {
  /** La vitrina de desarrollo inyecta datos de ejemplo; en la app es Firestore. */
  useEventos?: typeof useBitacoraTurno
  alAgregar?: () => void
  alVer?: () => void
}) {
  const navigate = useNavigate()
  const turno = useTurnoMantencionActual()
  const { eventos, cargando } = useEventos(turno)
  const ver = alVer ?? (() => navigate('/bitacora'))
  const agregar = alAgregar ?? (() => navigate('/bitacora?nuevo=1'))
  const r = useMemo(() => resumirBitacora(eventos), [eventos])
  const publicados = useMemo(() => soloListos(eventos), [eventos])
  const enRedaccion = eventos.filter(esBorrador).length
  const ultimo = publicados[publicados.length - 1]

  return (
    <section className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none" aria-label="Bitácora del turno">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={ver} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-ctl">
          <span className="block text-footnote text-muted-foreground">Bitácora del turno</span>
          <span className="block text-title3 leading-tight">{etiquetaTurno(turno)}</span>
          <span className="block whitespace-nowrap text-footnote text-muted-foreground">{horarioTurno(turno)}</span>
        </button>
        <Pill tone="info" dot="pulse">En curso</Pill>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className="block text-headline leading-tight tabular-nums">{cargando ? '–' : r.eventos}</span>
          <span className="text-footnote text-muted-foreground">{r.eventos === 1 ? 'evento' : 'eventos'}</span>
        </div>
        <div>
          <span className={`block text-headline leading-tight tabular-nums ${r.minutosParada > 0 ? 'text-ink-crit' : ''}`}>{cargando ? '–' : formatoMinutos(r.minutosParada)}</span>
          <span className="text-footnote text-muted-foreground">de parada</span>
        </div>
        <div>
          <span className={`block text-headline leading-tight tabular-nums ${r.pendientes > 0 ? 'text-ink-warn' : ''}`}>{cargando ? '–' : r.pendientes}</span>
          <span className="text-footnote text-muted-foreground">{r.pendientes === 1 ? 'pendiente' : 'pendientes'}</span>
        </div>
      </div>

      {(ultimo || enRedaccion > 0) && (
        <p className="truncate text-footnote text-muted-foreground">
          {ultimo && (
            <>
              Último: <span className="text-foreground tabular-nums">{ultimo.horaInicio}</span>
              {ultimo.equipo ? <span className="text-foreground"> · {ultimo.equipo}</span> : null}
            </>
          )}
          {ultimo && enRedaccion > 0 ? ' · ' : ''}
          {enRedaccion > 0 ? `${enRedaccion} en redacción` : ''}
        </p>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={agregar}>
          <Plus /> Agregar evento
        </Button>
        <Button variant="tinted" onClick={ver}>
          Ver
        </Button>
      </div>
    </section>
  )
}
