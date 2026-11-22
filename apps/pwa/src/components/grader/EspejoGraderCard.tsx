/**
 * Tarjeta «Espejo del grader» (diseño aprobado, tarjeta A): lo que el lector del PC
 * de planta lleva leído del informe «Pieza pieza Grader» de Matrix, casi en vivo.
 *
 * Dos estados: vivo (cifra de piezas del turno y tres filas) y sin lectura (el PC
 * dejó de avisar: hasta cuándo hay datos, causa probable y el respaldo por carpeta).
 * Si nunca hubo lector (sin documento de estado) no se muestra.
 *
 * `EspejoGraderCard` solo presenta; `EspejoGraderConectado` le conecta Firestore.
 * La cuenta está en `services/grader/espejo/`.
 */
import { useMemo } from 'react'
import { Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import { dec1 } from '@/utils/formatoNumeros'
import {
  avisoAvance,
  avisoLimite,
  avisoSinPiezasDelTurno,
  fraseDeError,
  textoHace,
  type EstadoLector,
} from '@/services/grader/espejo/espejoEstado'
import {
  hhmm,
  miles,
  ventanaDelTurno,
  type ResumenEspejo,
} from '@/services/grader/espejo/espejoFilas'
import { lineaDelEspejo, useEspejoGrader } from '@/services/grader/espejo/useEspejoGrader'

function horaLocal(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Hora de planta de `leidoEn` («2026-11-20T21:49:12-03:00» → «21:49»). */
function horaDeLectura(leidoEn: string | null): string {
  return leidoEn && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(leidoEn) ? leidoEn.slice(11, 16) : '—'
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-footnote text-muted-foreground">{k}</dt>
      <dd className="text-footnote font-medium tabular-nums text-foreground text-right">{v}</dd>
    </div>
  )
}

/** Lo que la tarjeta toma del monitor para decir lo mismo que el encabezado y que «El grader ahora». */
export interface TurnoDelMonitor {
  /** Nombre del turno como en el encabezado («Turno 2»). */
  nombre: string
  /** Horario del encabezado, «HH:MM». */
  desde: string
  hasta: string
  /** Piezas del grader y de Gate 0 dentro de esa ventana (la misma cuenta que «El grader ahora»). */
  piezas: number
  g0: number
  /** Piezas de las 3 Baader en la misma ventana (Shoplogix); `null` sin la serie. */
  baader: number | null
}

export function EspejoGraderCard({ estado, vivo, minutos, resumen, errorPiezas = false, accion, publico = false, turnoEnCurso = true, turnoMonitor = null, className }: {
  estado: EstadoLector
  vivo: boolean
  minutos: number | null
  /** `null` mientras se bajan y reparten las piezas del turno. */
  resumen: ResumenEspejo | null
  /** Alguna hora del turno no se pudo leer: el total puede estar incompleto. */
  errorPiezas?: boolean
  /** Control junto al estado del lector (en el monitor: la lectura en vivo a pedido). */
  accion?: React.ReactNode
  /**
   * Vista para quien no es admin: solo estado, piezas, turno y horario (lista de permitidos). Los avisos del lector,
   * su avance, el equipo y las filas técnicas son para admin.
   */
  publico?: boolean
  /** Con el turno cerrado la pastilla dice «Turno cerrado», no «Vivo»: el lector puede seguir latiendo para el siguiente. */
  turnoEnCurso?: boolean
  turnoMonitor?: TurnoDelMonitor | null
  className?: string
}) {
  const codigoError = estado.estado.error
  const iniciando = codigoError === 'iniciando'
  const error = fraseDeError(codigoError)
  const limite = avisoLimite(estado.estado)
  const avance = avisoAvance(estado.estado)
  // Los avisos van en los dos estados (vivo y sin lectura): un corte de Matrix o un
  // error del lector con la pastilla en «Vivo» es justo lo que hay que ver.
  const lectura = errorPiezas
    ? publico
      ? 'Parte de las piezas del turno no se pudo leer: el total puede estar incompleto.'
      : 'No se pudo leer parte de las piezas del turno (sin permiso o sin red): el total puede estar incompleto.'
    : null
  const aviso = publico ? [lectura].filter((x): x is string => !!x) : [lectura, error, limite].filter((x): x is string => !!x)
  const t = turnoMonitor
  // Con el turno del monitor, la cifra y el horario son los del encabezado (07:15 → 14:50) y no los de la primera y
  // la última pieza (07:21 → 14:52, con el margen del reparto): así coincide con «El grader ahora».
  const total = resumen ? (t ? t.piezas : resumen.total) : null
  const p0Pct = t ? (t.g0 > 0 && t.piezas > 0 ? (t.g0 / t.piezas) * 100 : null) : resumen?.p0 ?? null
  const sinDelTurno = vivo && !errorPiezas && total === 0 && !publico ? avisoSinPiezasDelTurno(estado.estado) : null
  const letra = resumen?.coincidencia?.letra
  const turno = t ? t.nombre : letra ? `Turno ${letra}` : resumen?.turno?.shiftId ?? null
  const rango = t ? `${t.desde} → ${t.hasta}` : resumen?.primera && resumen.ultima ? `${hhmm(resumen.primera)} → ${hhmm(resumen.ultima)}` : null
  const p0 = p0Pct !== null ? `P0 ${dec1(p0Pct)} %` : null
  const linea = [turno, rango, p0].filter(Boolean).join(' · ')
  const ultimaAviso = estado.ultimoLatidoMs !== null ? horaLocal(estado.ultimoLatidoMs) : '—'
  // Turno cerrado: lo que importa es lo que trajo el espejo, no si el lector sigue latiendo.
  const conCifra = vivo || !turnoEnCurso
  const estadoLector = vivo ? `vivo · ${textoHace(minutos ?? 0)}` : minutos === null ? 'sin lectura' : `sin lectura ${textoHace(minutos)}`

  return (
    <section className={cn('rounded-card border border-border bg-card p-4', className)} aria-label="Espejo del grader">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-subhead font-semibold">Espejo del grader</h3>
        {!turnoEnCurso ? (
          <Pill tone="neutral">Turno cerrado</Pill>
        ) : vivo && iniciando ? (
          <Pill tone="info" dot="pulse">Iniciando · {textoHace(minutos ?? 0)}</Pill>
        ) : vivo ? (
          <Pill tone="ok" dot="pulse">Vivo · {textoHace(minutos ?? 0)}</Pill>
        ) : (
          <Pill tone="warning" dot>{minutos === null ? 'Sin lectura' : `Sin lectura ${textoHace(minutos)}`}</Pill>
        )}
      </div>

      {conCifra ? (
        <div className="mt-2">
          {total === null ? (
            <p className="text-title2 font-semibold text-muted-foreground" aria-busy="true">Cargando piezas…</p>
          ) : total > 0 ? (
            <>
              <p className="text-title1 font-semibold tabular-nums">{miles(total)} piezas</p>
              {linea && <p className="text-footnote text-muted-foreground tabular-nums">{linea}</p>}
            </>
          ) : (
            <>
              {/* Con 0 piezas no se muestra «0 piezas»: se dice por qué. */}
              <p className="text-title2 font-semibold">
                {iniciando && turnoEnCurso ? 'Primera lectura en curso' : 'Sin piezas de este turno'}
              </p>
              <p className="text-footnote text-muted-foreground tabular-nums">
                {publico || !turnoEnCurso ? 'El espejo no trae piezas de este turno.' : sinDelTurno ?? (iniciando
                  ? 'El lector acaba de arrancar. La primera lectura tarda unos minutos.'
                  : error || errorPiezas
                    ? 'Hay un problema de lectura: mira el aviso de abajo.'
                    : 'El lector todavía no ha leído piezas de este turno.')}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-title1 font-semibold tabular-nums">
            {resumen?.ultima ? `Datos hasta ${hhmm(resumen.ultima)}` : 'Sin datos del turno'}
          </p>
          <p className="text-footnote text-muted-foreground">
            El PC de planta dejó de enviar. Matrix cerrado, PC apagado o lector detenido.
          </p>
        </div>
      )}

      {(aviso.length > 0 || (avance && !publico)) && (
        <div className="mt-2 space-y-1">
          {aviso.map((t) => (
            <p key={t} className="text-footnote text-ink-warn">{t}</p>
          ))}
          {avance && !publico && <p className="text-footnote text-muted-foreground tabular-nums">{avance}</p>}
        </div>
      )}

      <dl className="mt-3">
        {t && t.baader !== null && conCifra && (
          // Shoplogix cuenta las 3 Baader (16.188 el 21-11 T2); el grader cuenta más: también le llega la línea manual.
          <Fila k="3 Baader (Shoplogix)" v={`${miles(t.baader)} piezas`} />
        )}
        {publico ? null : conCifra ? (
          <>
            {!turnoEnCurso && <Fila k="Lector" v={estadoLector} />}
            <Fila k="Pieza pieza" v={`leída ${horaDeLectura(estado.leidoEn)}`} />
            <Fila k="Puerta 0 (motivos)" v="pendiente" />
            <Fila
              k="Turno de Matrix vs regla"
              v={resumen?.coincidencia ? `coincide ${Math.round(resumen.coincidencia.pct)} % · Turno ${resumen.coincidencia.letra}` : '—'}
            />
          </>
        ) : (
          <>
            <Fila k="Último aviso del lector" v={`${ultimaAviso} · ${estado.equipo}`} />
            <Fila k="Respaldo" v="carga por carpeta (Excel)" />
          </>
        )}
      </dl>
      {turnoEnCurso && accion}
    </section>
  )
}

/** Conecta la tarjeta con Firestore. No pinta nada hasta saber si hubo lector alguna vez. */
export function EspejoGraderConectado({ lineId, dateKey, inicio, fin, turnoId, className }: {
  lineId: string
  dateKey: string | null
  inicio: string | null | undefined
  fin: string | null | undefined
  turnoId?: string | null
  className?: string
}) {
  const linea = lineaDelEspejo(lineId)
  // Solo la ventana del turno (con su margen) se baja y se reparte; sin ventana no se baja nada.
  const ventana = useMemo(
    () => (dateKey && inicio ? ventanaDelTurno({ dateKey, inicio, fin, turnoId }) : null),
    [dateKey, inicio, fin, turnoId],
  )
  const { cargando, cargandoPiezas, resumen, errorPiezas, estado, vivo, minutos } = useEspejoGrader(linea, ventana)

  if (cargando || !estado) return null
  return (
    <EspejoGraderCard
      estado={estado}
      vivo={vivo}
      minutos={minutos}
      resumen={cargandoPiezas ? null : resumen}
      errorPiezas={errorPiezas}
      className={className}
    />
  )
}
