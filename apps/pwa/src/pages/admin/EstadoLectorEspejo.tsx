/**
 * Último estado de cada lector del espejo, leído en vivo de `graderEspejoEstado`
 * (Diagnóstico Matrix). Sirve para no depender de fotos del `lector.log` del PC de
 * planta: muestra último latido, versión, filas de la tabla, piezas, primera y
 * última fila, rango, límite, avance y error, tal como los envió el lector.
 */
import { useEffect, useState } from 'react'
import { collection, onSnapshot } from '@/services/firestoreTracked'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { Pill } from '@/components/piel'
import { formatearFechaCorta, formatearHaceX } from '@/services/grader/diagnosticoMatrix'
import { aEstado } from '@/services/grader/espejo/useEspejoGrader'
import {
  avisoAvance,
  avisoLimite,
  estadoAjuste,
  estaVivo,
  fraseActualizacion,
  fraseDeError,
  fraseHuecos,
  frasePeriodo,
  fraseMatrix,
  frasePantalla,
  fraseRecarga,
  textoArranque,
  type EstadoLector,
} from '@/services/grader/espejo/espejoEstado'
import { miles } from '@/services/grader/espejo/espejoFilas'

/** Comando para ver las últimas 25 líneas del registro del lector en el PC de planta. */
export const COMANDO_REGISTRO_LECTOR = 'Get-Content "$env:LOCALAPPDATA\\espejo-grader\\lector.log" -Tail 25'

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-right text-xs font-medium tabular-nums">{v}</dd>
    </div>
  )
}

/** Solo presenta un estado (se prueba sin Firestore). */
export function FichaEstadoLector({ e, ahora }: { e: EstadoLector; ahora: number }) {
  const est = e.estado
  const vivo = estaVivo(e.ultimoLatidoMs, ahora)
  const error = est.error && est.error !== 'iniciando' ? fraseDeError(est.error) : null
  const limite = avisoLimite(est)
  const recarga = fraseRecarga(est.recarga, est.rango, new Date(ahora))
  // e1.7: pantalla despierta, Matrix abierto por el lector y relleno de huecos.
  const pantalla = frasePantalla(est.pantalla)
  const matrix = fraseMatrix(est.matrix)
  const huecos = fraseHuecos(est.huecos)
  // e1.9: combo de periodo del informe (interruptor = archivo PERIODO).
  const periodo = frasePeriodo(est.periodo)
  // Durante una recarga el latido va «parcial» y el rango viejo es a propósito: ni «poniéndose al día» ni «mueve el
  // fin del rango». Al terminar, el aviso de la recarga ya pide volver el rango a hoy: no se repite.
  const enRecarga = est.recarga === 'con-limite' || Boolean(est.recarga?.startsWith('leyendo'))
  const avance = enRecarga ? null : avisoAvance(est)
  const ajusteBase = estadoAjuste(est)
  const ajuste = ajusteBase && (enRecarga || recarga?.aviso) ? { ...ajusteBase, aviso: null } : ajusteBase
  const arranque = textoArranque(est.arranque)
  const actualiz = fraseActualizacion(est.actualiz)
  const rango = Array.isArray(est.rango) && est.rango.length > 0 ? est.rango.slice(0, 2).join(' → ') : '—'
  return (
    <div className="space-y-2 rounded-ctl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{e.equipo}</p>
        {est.error === 'iniciando' && vivo ? (
          <Pill tone="info" dot>Iniciando</Pill>
        ) : vivo ? (
          <Pill tone="ok" dot>Vivo</Pill>
        ) : (
          <Pill tone="warning" dot>Sin lectura</Pill>
        )}
      </div>
      <dl className="space-y-1">
        <Dato
          k="Último latido"
          v={e.ultimoLatidoMs ? `${formatearFechaCorta(e.ultimoLatidoMs)} · ${formatearHaceX(e.ultimoLatidoMs, ahora)}` : 'nunca'}
        />
        <Dato k="Versión del lector" v={est.version ?? '—'} />
        {arranque && <Dato k="Arranque" v={arranque} />}
        {actualiz && <Dato k="Actualización" v={actualiz} />}
        <Dato k="Filas de la tabla" v={typeof est.filasTabla === 'number' ? miles(est.filasTabla) : '—'} />
        <Dato k="Piezas leídas" v={typeof est.piezas === 'number' ? miles(est.piezas) : '—'} />
        <Dato k="Primera fila" v={est.primera || '—'} />
        <Dato k="Última fila" v={est.ultima || '—'} />
        <Dato k="Rango de Matrix" v={rango} />
        <Dato k="Límite de 10 000" v={est.limite === true ? 'marcado' : est.limite === false ? 'no marcado' : '—'} />
        {ajuste && <Dato k="Rango automático" v={ajuste.texto} />}
        {recarga && <Dato k="Recarga de historia" v={recarga.texto} />}
        {huecos && <Dato k="Huecos del espejo" v={huecos.texto} />}
        {matrix && <Dato k="Matrix" v={matrix.texto} />}
        {pantalla && <Dato k="Pantalla" v={pantalla.texto} />}
        {periodo && <Dato k="Periodo del informe" v={periodo.texto} />}
        {periodo && periodo.opciones.length > 0 && <Dato k="Opciones del periodo" v={periodo.opciones.join(' · ')} />}
        {typeof est.bloqueada === 'boolean' && (
          <Dato
            k="Sesión de Windows"
            v={est.bloqueada ? (est.error ? 'bloqueada · no pudo leer' : `bloqueada · leyó ${miles(est.leidas ?? 0)} filas`) : 'desbloqueada'}
          />
        )}
        {typeof est.seg === 'number' && (
          <Dato k="Último ciclo" v={`${String(est.seg).replace('.', ',')} s · ${miles(est.leidas ?? 0)} filas leídas`} />
        )}
        <Dato k="Error" v={est.error || 'ninguno'} />
      </dl>
      {[error, limite, ajuste?.aviso ?? null, recarga?.aviso ?? null, huecos?.aviso ?? null, matrix?.aviso ?? null, pantalla?.aviso ?? null, periodo?.aviso ?? null].filter(Boolean).map((t) => (
        <p key={t!} className="text-xs text-ink-warn">{t}</p>
      ))}
      {avance && <p className="text-xs text-muted-foreground tabular-nums">{avance}</p>}
    </div>
  )
}

export function EstadoLectorEspejo() {
  const [estados, setEstados] = useState<EstadoLector[] | null>(null)
  const [error, setError] = useState(false)
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => onSnapshot(
    collection(db, 'graderEspejoEstado'),
    (snap) => {
      setError(false)
      setEstados(
        snap.docs
          .map((d) => aEstado(d.id, d.data({ serverTimestamps: 'estimate' })))
          .sort((a, b) => (b.ultimoLatidoMs ?? 0) - (a.ultimoLatidoMs ?? 0)),
      )
    },
    (e) => {
      logger.error('EstadoLectorEspejo', e)
      setError(true)
    },
  ), [])

  if (error) return <p className="text-xs text-destructive">No se pudo leer el estado del lector.</p>
  if (!estados) return <p className="text-xs text-muted-foreground">Leyendo el estado del lector…</p>
  if (estados.length === 0) return <p className="text-xs text-muted-foreground">Ningún lector ha avisado todavía.</p>
  return (
    <div className="space-y-2">
      {estados.map((e) => <FichaEstadoLector key={e.equipo} e={e} ahora={ahora} />)}
    </div>
  )
}
