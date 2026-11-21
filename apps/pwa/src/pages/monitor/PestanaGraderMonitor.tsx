/**
 * Pestaña «Grader» del monitor (`?ver=grader`). Etapa 1: solo la tarjeta de
 * cobertura. Se carga con `React.lazy` para que el monitor público no arrastre
 * Firestore del grader a su bundle inicial.
 *
 * Permisos: `graderDailySummaries` exige sesión no anónima. Sin sesión se muestra
 * el aviso para iniciarla (la vista pública filtrada es la etapa 6). No se
 * consulta nada sin sesión.
 */
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { CoberturaGraderCard } from '@/components/grader/CoberturaGraderCard'
import { EspejoGraderConectado } from '@/components/grader/EspejoGraderCard'
import { Skeleton } from '@/components/piel/Skeleton'
import { useCarpetaMatrixEstado } from '@/store/carpetaMatrixEstado'
import {
  CADENCIAS,
  CADENCIA_POR_DEFECTO,
  calcularCobertura,
  causaFaltante,
  type CadenciaExporte,
} from '@/services/grader/graderCobertura'
import { useDatosGraderHasta, useResumenesAlrededor } from '@/services/grader/graderDatosHasta'

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

function CoberturaEnMonitor({ lineId, dateKey, inicio, fin, ahoraWallMs }: {
  lineId: string
  /** dateKey del turno que se está viendo. */
  dateKey: string | null
  /** Turno que se está viendo (nombre de Shoplogix), para repartir las piezas del espejo. */
  turnoId?: string | null
  /** Ventana del turno (wall-clock-as-UTC). */
  inicio: string | null | undefined
  fin: string | null | undefined
  ahoraWallMs: number
}) {
  const location = useLocation()
  const [cadencia, setCadencia] = useCadencia(lineId)
  const hasta = useDatosGraderHasta(lineId)
  const resumenes = useResumenesAlrededor(lineId, dateKey)
  const estadoCarpeta = useCarpetaMatrixEstado((s) => s.estado)

  const cobertura = useMemo(() => {
    if (resumenes.estado !== 'listo') return null
    return calcularCobertura({ inicio, fin, ahoraWallMs, resumenes: resumenes.valor, cadencia })
  }, [resumenes, inicio, fin, ahoraWallMs, cadencia])

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
      datosHasta={hasta.estado === 'listo' ? hasta.valor : null}
      causa={causaFaltante(estadoCarpeta)}
      cadencia={cadencia}
      onCadencia={setCadencia}
    />
  )
}

/** Pestaña «Grader»: la cobertura por exporte y, debajo, el espejo en vivo del lector (si lo hay). */
export default function PestanaGraderMonitor(props: Parameters<typeof CoberturaEnMonitor>[0]) {
  return (
    <div className="space-y-3">
      <CoberturaEnMonitor {...props} />
      <EspejoGraderConectado
        lineId={props.lineId}
        dateKey={props.dateKey}
        inicio={props.inicio}
        fin={props.fin}
        turnoId={props.turnoId}
      />
    </div>
  )
}
