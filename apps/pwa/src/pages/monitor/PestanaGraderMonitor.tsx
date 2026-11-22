/**
 * Pestaña «Grader» del monitor (`?ver=grader`): el grader en vivo del espejo (E-A:
 * curva sobre las Baader, cifras, P0, calibres, línea manual y alertas), la tarjeta del
 * espejo y la cobertura por exporte. Se carga con `React.lazy` para que el monitor público no arrastre
 * Firestore del grader a su bundle inicial.
 *
 * Permisos: `graderDailySummaries` exige sesión no anónima. Sin sesión se muestra
 * el aviso para iniciarla (la vista pública filtrada es la etapa 6). No se
 * consulta nada sin sesión.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { CoberturaGraderCard } from '@/components/grader/CoberturaGraderCard'
import { EspejoGraderCard, type TurnoDelMonitor } from '@/components/grader/EspejoGraderCard'
import { LecturaEnVivo } from '@/components/grader/LecturaEnVivo'
import { ventanaDelTurno } from '@/services/grader/espejo/espejoFilas'
import { loadGate0Records, type StoredGate0Record } from '@/services/grader/graderGate0Store'
import { buildDailySummaryId } from '@/services/grader/graderDailySummary.service'
import { lineaDelEspejo, useEspejoGrader } from '@/services/grader/espejo/useEspejoGrader'
import { leidoHastaDelLector } from '@/services/grader/espejo/espejoEstado'
import { baaderEnEje, RETRASO_REFERENCIA_MIN, type SerieMinutoBaader } from '@/services/grader/espejo/graderVivo'
import { minutosSinLectura } from '@/services/grader/espejo/alertasGrader'
import { serieDesdeCubetas, type CubetaMinuto } from '@/services/grader/espejo/espejoMinutos'
import { useIsAdmin } from '@/store/authStore'
import { GraderVivo } from './GraderVivo'
import type { ParadaGrader } from './graderVivoDatos'
import { Skeleton } from '@/components/piel/Skeleton'
import { useCarpetaMatrixEstado } from '@/store/carpetaMatrixEstado'
import {
  CADENCIAS,
  CADENCIA_POR_DEFECTO,
  calcularCobertura,
  causaFaltante,
  type CadenciaExporte,
  type Tramo,
} from '@/services/grader/graderCobertura'
import { useDatosGraderHasta, useResumenesAlrededor, useResumenesPrevios } from '@/services/grader/graderDatosHasta'

const CLAVE_CADENCIA = (lineId: string) => `grader-cadencia-exporte:${lineId}`

/** Cadencia por línea, guardada en este navegador (ver Decisiones del plan). */
function useCadencia(lineId: string): [CadenciaExporte, (c: CadenciaExporte) => void] {
  const [c, setC] = useState<CadenciaExporte>(() => {
    try {
      const v = localStorage.getItem(CLAVE_CADENCIA(lineId))
      return CADENCIAS.some((x) => x.id === v) ? (v as CadenciaExporte) : CADENCIA_POR_DEFECTO
    } catch {
      return CADENCIA_POR_DEFECTO
    }
  })
  const guardar = (v: CadenciaExporte) => {
    setC(v)
    try { localStorage.setItem(CLAVE_CADENCIA(lineId), v) } catch { /* sin almacenamiento: queda en memoria */ }
  }
  return [c, guardar]
}

function Aviso({ titulo, texto, accion }: { titulo: string; texto: string; accion?: React.ReactNode }) {
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-semibold">{titulo}</p>
        <p className="text-footnote text-muted-foreground">{texto}</p>
      </div>
      {accion}
    </section>
  )
}

function CoberturaEnMonitor({ lineId, dateKey, inicio, fin, ahoraWallMs, espejo = SIN_TRAMOS }: {
  lineId: string
  /** dateKey del turno que se está viendo. */
  dateKey: string | null
  /** Turno que se está viendo (nombre de Shoplogix), para repartir las piezas del espejo. */
  turnoId?: string | null
  /** Ventana del turno (wall-clock-as-UTC). */
  inicio: string | null | undefined
  fin: string | null | undefined
  ahoraWallMs: number
  /** Tramos que trae el espejo (sin sus huecos): también son datos del grader, no solo el Excel. */
  espejo?: readonly Tramo[]
}) {
  const location = useLocation()
  const [cadencia, setCadencia] = useCadencia(lineId)
  const hasta = useDatosGraderHasta(lineId)
  const resumenes = useResumenesAlrededor(lineId, dateKey)
  const estadoCarpeta = useCarpetaMatrixEstado((s) => s.estado)

  const cobertura = useMemo(() => {
    if (resumenes.estado !== 'listo') return null
    return calcularCobertura({ inicio, fin, ahoraWallMs, resumenes: resumenes.valor, cadencia, espejo })
  }, [resumenes, inicio, fin, ahoraWallMs, cadencia, espejo])

  if (hasta.estado === 'sin-sesion' || resumenes.estado === 'sin-sesion') {
    const volver = encodeURIComponent(location.pathname + location.search)
    return (
      <Aviso
        titulo="Inicia sesión para ver el grader"
        texto="Los datos del grader solo se ven con sesión de la PWA."
        accion={
          <Link
            to={`/login?redirect=${volver}`}
            className="tap-44 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-4 text-subhead font-semibold text-primary-foreground"
          >
            <LogIn className="h-4 w-4" /> Iniciar sesión
          </Link>
        }
      />
    )
  }
  if (resumenes.estado === 'error') {
    return <Aviso titulo="No se pudo leer el grader" texto={resumenes.mensaje} />
  }
  if (resumenes.estado === 'cargando' || hasta.estado === 'cargando') {
    return <Skeleton className="h-[188px] w-full rounded-card" />
  }
  if (!cobertura) {
    return <Aviso titulo="Sin horario del turno" texto="El monitor todavía no tiene la hora de inicio y fin de este turno." />
  }
  return (
    <CoberturaGraderCard
      cobertura={cobertura}
      datosHasta={masReciente(hasta.estado === 'listo' ? hasta.valor : null, cobertura.hasta)}
      causa={causaFaltante(estadoCarpeta)}
      cadencia={cadencia}
      onCadencia={setCadencia}
    />
  )
}

const SIN_PARADAS: ParadaGrader[] = []
const SIN_TRAMOS: Tramo[] = []

/** El dato más nuevo entre el último Excel (ISO) y el último minuto del espejo (ms), como ISO wall-clock. */
function masReciente(excel: string | null, espejoMs: number | null): string | null {
  const e = excel ? Date.parse(excel) : NaN
  if (espejoMs === null || (Number.isFinite(e) && e >= espejoMs)) return excel
  return new Date(espejoMs).toISOString()
}

/**
 * Lo que el espejo cubre del turno: de la primera pieza a la última, menos los minutos que no leyó (huecos con las
 * Baader andando). Con el retraso de referencia: un hueco dura ≥ 15 min y 1 min de corrimiento no lo cambia.
 */
function tramosDelEspejo(cubetas: readonly CubetaMinuto[], inicioMs: number, finMs: number, baader: SerieMinutoBaader | null): Tramo[] {
  const n = Math.max(1, Math.ceil((finMs - inicioMs) / 60_000))
  const serie = serieDesdeCubetas(cubetas, inicioMs, n)
  if (serie.hastaMin === 0) return []
  let primera = 0
  while (primera < serie.hastaMin && (serie.pz[primera] ?? 0) === 0) primera++
  const sin = minutosSinLectura(serie.pz, baaderEnEje(baader, serie.t0Ms), RETRASO_REFERENCIA_MIN, serie.hastaMin)
  const out: Tramo[] = []
  let a = -1
  for (let m = primera; m <= serie.hastaMin; m++) {
    const leido = m < serie.hastaMin && !sin[m]
    if (leido && a < 0) a = m
    if (!leido && a >= 0) { out.push({ desde: serie.t0Ms + a * 60_000, hasta: serie.t0Ms + m * 60_000 }); a = -1 }
  }
  return out
}

/** Piezas del grader y de las Baader dentro de la ventana del turno, para la tarjeta del espejo. */
function cuentaDelTurno(cubetas: readonly CubetaMinuto[], inicioMs: number, finMs: number, baader: SerieMinutoBaader | null) {
  let piezas = 0
  let g0 = 0
  for (const c of cubetas) if (c.ms >= inicioMs && c.ms < finMs) { piezas += c.pz; g0 += c.g0 }
  let b: number | null = null
  const desde = baader ? Date.parse(baader.desde.endsWith('Z') ? baader.desde : `${baader.desde}Z`) : NaN
  if (baader && Number.isFinite(desde)) {
    b = 0
    for (const m of baader.maquinas) {
      m.cycles.forEach((v, i) => {
        const t = desde + i * 60_000
        if (t >= inicioMs && t < finMs) b! += v ?? 0
      })
    }
  }
  return { piezas, g0, baader: b }
}

/**
 * Pestaña «Grader»: el grader en vivo arriba (si el espejo trae piezas del turno), y debajo la tarjeta del espejo
 * y la cobertura por exporte. Una sola suscripción al espejo para las dos cosas.
 */
export default function PestanaGraderMonitor(props: Parameters<typeof CoberturaEnMonitor>[0] & {
  /** Serie por minuto de las Baader del turno que se mira (la misma de las barras del monitor). */
  baader?: SerieMinutoBaader | null
  /** Detenciones de Shoplogix del turno, ubicadas en el reloj. */
  paradas?: ParadaGrader[]
}) {
  const { lineId, dateKey, inicio, fin, turnoId, ahoraWallMs, baader = null, paradas = SIN_PARADAS } = props
  const esAdmin = useIsAdmin()
  // Solo la ventana del turno (con su margen) se baja y se reparte; sin ventana no se baja nada.
  const ventana = useMemo(
    () => (dateKey && inicio ? ventanaDelTurno({ dateKey, inicio, fin, turnoId }) : null),
    [dateKey, inicio, fin, turnoId],
  )
  const espejo = useEspejoGrader(lineaDelEspejo(lineId), ventana)
  // Cierres de los días anteriores, para comparar el turno con los últimos 6 (una lectura por día visto).
  const previos = useResumenesPrevios(lineId, dateKey)
  const turnoEnCurso = Number.isFinite(ahoraWallMs) && (!ventana || ahoraWallMs < ventana.endMs)
  // Última lectura COMPLETA del lector (sin tramo pendiente, error ni recarga), nunca más allá del fin del rango de
  // Matrix: hasta ahí los minutos sin piezas son de verdad.
  const leidoHastaMs = leidoHastaDelLector(espejo.estado)
  const turnoActualId = dateKey && turnoId ? `${dateKey}__${turnoId}` : null
  const tramosEspejo = useMemo(
    () => (ventana && !espejo.cargandoPiezas ? tramosDelEspejo(espejo.cubetas, ventana.startMs, ventana.endMs, baader) : SIN_TRAMOS),
    [ventana, espejo.cargandoPiezas, espejo.cubetas, baader],
  )
  // La tarjeta del espejo dice el mismo turno, horario y cifra que el encabezado y «El grader ahora».
  const turnoMonitor = useMemo<TurnoDelMonitor | null>(() => {
    if (!ventana || !inicio) return null
    const finIso = fin ?? new Date(ventana.endMs).toISOString()
    return {
      nombre: turnoId || ventana.shiftId,
      desde: inicio.slice(11, 16),
      hasta: finIso.slice(11, 16),
      ...cuentaDelTurno(espejo.cubetas, ventana.startMs, ventana.endMs, baader),
    }
  }, [ventana, inicio, fin, turnoId, espejo.cubetas, baader])
  // Puerta 0 del turno (Excel): el mismo id que usa el guardado (`buildDailySummaryId`, con la línea). Una lectura
  // por turno y línea, sin listener. Sin registros o con error, sigue el estimado.
  const gate0Id = dateKey && turnoId ? buildDailySummaryId(dateKey, turnoId, lineId) : null
  const [gate0Exacto, setGate0Exacto] = useState<StoredGate0Record[] | null>(null)
  useEffect(() => {
    let vigente = true
    setGate0Exacto(null)
    if (!gate0Id) return
    loadGate0Records(gate0Id)
      .then((r) => { if (vigente) setGate0Exacto(r) })
      .catch(() => { if (vigente) setGate0Exacto(null) })
    return () => { vigente = false }
  }, [gate0Id])
  return (
    <div className="space-y-3">
      {ventana && !espejo.cargandoPiezas && (
        <GraderVivo
          cubetas={espejo.cubetas}
          inicioMs={ventana.startMs}
          finMs={ventana.endMs}
          baader={baader}
          paradas={paradas}
          minutosSinLatido={espejo.minutos}
          turnoEnCurso={turnoEnCurso}
          leidoHastaMs={leidoHastaMs}
          piezas={espejo.piezas}
          resumenes={previos.estado === 'listo' ? previos.valor : null}
          turnoActualId={turnoActualId}
          gate0Exacto={gate0Exacto}
          publico={!esAdmin}
        />
      )}
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
        {!espejo.cargando && espejo.estado && (
          <EspejoGraderCard
            estado={espejo.estado}
            vivo={espejo.vivo}
            minutos={espejo.minutos}
            resumen={espejo.cargandoPiezas ? null : espejo.resumen}
            errorPiezas={espejo.errorPiezas}
            publico={!esAdmin}
            turnoEnCurso={turnoEnCurso}
            turnoMonitor={turnoMonitor}
            accion={<LecturaEnVivo linea={lineaDelEspejo(lineId)} lector={espejo.estado} />}
          />
        )}
        <CoberturaEnMonitor {...props} espejo={tramosEspejo} />
      </div>
    </div>
  )
}
