/**
 * Superficie de la carga automática de la carpeta de Matrix en Análisis de turno.
 * - `CargaAutomaticaAviso`: línea bajo el título; calla si todo va bien y sube
 *   con su única acción si hay que actuar.
 * - `EtiquetaCargaAutomatica`: el estado en una palabra, dentro de la fila
 *   «Cargar Excel del Grader» (que sigue abriendo la carga manual).
 * Solo admin y solo en navegadores compatibles; si no, no renderiza nada.
 */
import { Button } from '@/components/ui'
import { useAuthStore, useIsAdmin } from '@/store'
import { useCarpetaMatrixEstado } from '@/store/carpetaMatrixEstado'
import type { EstadoCarpeta } from '@/services/grader/carpetaMatrix'
import { CM_REGISTROS_CORTE } from '@/services/grader/carpetaMatrix'

const DIA_MS = 86_400_000
import { elegirCarpetaMatrix, renovarPermisoCarpetaMatrix, soportaCarpetaMatrix } from '@/services/grader/carpetaMatrixAcciones'
import { cn } from '@/lib/utils'

function useCargaAutomaticaVisible(): boolean {
  const esAdmin = useIsAdmin()
  const tieneUsuario = useAuthStore((s) => s.user !== null)
  return esAdmin && tieneUsuario && soportaCarpetaMatrix()
}

const ETIQUETA: Record<EstadoCarpeta, string> = {
  'sin-autorizar': 'carga automática apagada',
  vigilando: 'vigilando la carpeta',
  permiso: 'falta renovar el permiso',
  cargado: 'cargado desde la carpeta',
  cortado: 'exporte cortado en 10.000',
  viejo: 'dato viejo',
  error: 'error de carga automática',
}

const TONO: Record<EstadoCarpeta, string> = {
  'sin-autorizar': 'bg-muted-foreground/60',
  vigilando: 'bg-muted-foreground',
  permiso: 'bg-ink-warn',
  cargado: 'bg-muted-foreground',
  cortado: 'bg-ink-crit',
  viejo: 'bg-ink-warn',
  error: 'bg-ink-crit',
}

function Punto({ estado }: { estado: EstadoCarpeta }) {
  return <span aria-hidden="true" className={cn('inline-block h-2 w-2 shrink-0 rounded-full', TONO[estado])} />
}

/** Línea bajo el título de Análisis de turno. */
export function CargaAutomaticaAviso() {
  const visible = useCargaAutomaticaVisible()
  const { estado, ultimo, ultimoPiezaAPieza, errorTexto } = useCarpetaMatrixEstado()
  if (!visible) return null
  const ahora = Date.now()

  if (estado === 'vigilando' || estado === 'cargado') {
    const llego = estado === 'cargado' && ultimo?.tipo === 'cargado'
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Punto estado={estado} />
        {llego ? 'Carga automática al día · llegó un Excel nuevo' : 'Carga automática al día'}
      </p>
    )
  }

  if (estado === 'sin-autorizar') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-card p-4">
        <Punto estado={estado} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">La carga automática está apagada</p>
          <p className="text-xs text-muted-foreground">Elige la carpeta donde guardas los exportes de Matrix.</p>
        </div>
        <Button size="sm" onClick={() => void elegirCarpetaMatrix()}>Elegir carpeta</Button>
      </div>
    )
  }

  if (estado === 'permiso') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-card p-4">
        <Punto estado={estado} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-warn">Falta renovar el permiso de la carpeta</p>
          <p className="text-xs text-muted-foreground">El navegador lo vuelve a pedir tras reiniciar el PC.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void renovarPermisoCarpetaMatrix()}>Renovar permiso</Button>
      </div>
    )
  }

  if (estado === 'cortado') {
    return (
      <div className="flex items-center gap-3 rounded-card bg-card p-4">
        <Punto estado={estado} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-crit">Exporte cortado en {CM_REGISTROS_CORTE.toLocaleString('es-CL')} registros</p>
          <p className="text-xs text-muted-foreground">
            Faltan piezas. Desmarca el límite de registros en Matrix y exporta de nuevo. Este archivo no se usa hasta que llegue el completo.
          </p>
        </div>
      </div>
    )
  }

  if (estado === 'viejo') {
    const dias = ultimoPiezaAPieza !== null ? Math.floor((ahora - ultimoPiezaAPieza) / DIA_MS) : null
    return (
      <div className="flex items-center gap-3 rounded-card bg-card p-4">
        <Punto estado={estado} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-warn tabular-nums">
            {dias !== null ? `El último exporte tiene ${dias} ${dias === 1 ? 'día' : 'días'}` : 'No hay ningún Pieza a pieza en la carpeta'}
          </p>
          <p className="text-xs text-muted-foreground">Sin exportes nuevos, el monitor no tiene dato del grader. Exporta desde Matrix y guarda en la carpeta.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-card bg-card p-4">
      <Punto estado="error" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-crit">La carga automática falló</p>
        <p className="text-xs text-muted-foreground">{errorTexto ?? 'Revisa la carpeta; se reintentará en la próxima revisión.'}</p>
      </div>
    </div>
  )
}

/** Estado en una palabra para la fila «Cargar Excel del Grader». */
export function EtiquetaCargaAutomatica() {
  const visible = useCargaAutomaticaVisible()
  const estado = useCarpetaMatrixEstado((s) => s.estado)
  if (!visible) return null
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
      <Punto estado={estado} />
      {ETIQUETA[estado]}
    </span>
  )
}
