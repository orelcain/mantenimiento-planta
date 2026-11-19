/**
 * Superficie de la carga automática de la carpeta de Matrix en Análisis de turno.
 * - `CargaAutomaticaAviso`: línea bajo el título; calla si todo va bien, y sube
 *   con su única acción si hay que actuar. Muestra el último archivo cargado.
 * - `EtiquetaCargaAutomatica`: el estado en una palabra, dentro de la fila
 *   «Cargar Excel del Grader» (que sigue abriendo la carga manual).
 * Solo admin y solo en navegadores compatibles; si no, no renderiza nada.
 */
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui"
import { useAuthStore, useIsAdmin } from "@/store"
import { useCarpetaMatrixEstado } from "@/store/carpetaMatrixEstado"
import { CM_REGISTROS_CORTE, type EstadoCarpeta } from "@/services/grader/carpetaMatrix"
import { formatearFechaCorta, formatearHaceX, formatearTamano } from "@/services/grader/diagnosticoMatrix"
import { elegirCarpetaMatrix, renovarPermisoCarpetaMatrix, soportaCarpetaMatrix } from "@/services/grader/carpetaMatrixAcciones"
import { cn } from "@/lib/utils"

const DIA_MS = 86_400_000

const AYUDA_CORTE =
  'En Matrix, abre el informe Pieza pieza Grader, desmarca "Limitar el informe a 10 000 registros" y exporta de nuevo.'

function useCargaAutomaticaVisible(): boolean {
  const esAdmin = useIsAdmin()
  const tieneUsuario = useAuthStore((s) => s.user !== null)
  return esAdmin && tieneUsuario && soportaCarpetaMatrix()
}

const ETIQUETA: Record<EstadoCarpeta, string> = {
  "sin-autorizar": "carga automática apagada",
  vigilando: "vigilando la carpeta",
  permiso: "falta renovar el permiso",
  cargado: "cargado desde la carpeta",
  cortado: "exporte cortado en 10.000",
  viejo: "dato viejo",
  demasiados: "demasiados archivos",
  error: "error de carga automática",
}

const TONO: Record<EstadoCarpeta, string> = {
  "sin-autorizar": "bg-muted-foreground/60",
  vigilando: "bg-muted-foreground",
  permiso: "bg-ink-warn",
  cargado: "bg-muted-foreground",
  cortado: "bg-ink-crit",
  viejo: "bg-ink-warn",
  demasiados: "bg-ink-warn",
  error: "bg-ink-crit",
}

function Punto({ estado }: { estado: EstadoCarpeta }) {
  return <span aria-hidden="true" className={cn("inline-block h-2 w-2 shrink-0 rounded-full", TONO[estado])} />
}

/** Línea bajo el título de Análisis de turno. */
export function CargaAutomaticaAviso() {
  const visible = useCargaAutomaticaVisible()
  const { estado, ultimo, cortado, ultimoPiezaAPieza, errorTexto } = useCarpetaMatrixEstado()
  const navigate = useNavigate()
  const [ayudaAbierta, setAyudaAbierta] = useState(false)
  if (!visible) return null
  const ahora = Date.now()

  if (estado === "vigilando" && ultimo?.tipo !== "omitido") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Punto estado={estado} />
        Carga automática al día
      </p>
    )
  }

  if (estado === "cargado" && ultimo?.tipo === "cargado") {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Punto estado={estado} />
          Carga automática al día · llegó un Excel nuevo
        </p>
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-card p-4">
          <Punto estado={estado} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tabular-nums">
              Cargado: Pieza a pieza, {ultimo.piezas.toLocaleString("es-CL")} piezas
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {ultimo.desde !== null && ultimo.hasta !== null
                ? `${formatearFechaCorta(ultimo.desde)} → ${formatearFechaCorta(ultimo.hasta)} · `
                : ""}
              {formatearTamano(ultimo.tamano)} · {formatearHaceX(ultimo.cargadoEn, ahora)}
            </p>
          </div>
          {ultimo.turnoDocId !== null && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/analisis-grader/turno/${encodeURIComponent(ultimo.turnoDocId ?? "")}`)}
            >
              Ver turno
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (estado === "sin-autorizar") {
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

  if (estado === "permiso") {
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

  if (estado === "cortado") {
    return (
      <div className="rounded-card bg-card p-4">
        <div className="flex items-center gap-3">
          <Punto estado={estado} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-crit">
              Exporte cortado en {CM_REGISTROS_CORTE.toLocaleString("es-CL")} registros
            </p>
            <p className="text-xs text-muted-foreground">
              Faltan piezas. Este archivo no se usa hasta que llegue el completo.
              {cortado ? ` (${cortado.archivo})` : ""}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setAyudaAbierta((v) => !v)} aria-expanded={ayudaAbierta}>
            Cómo hacerlo
          </Button>
        </div>
        {ayudaAbierta && <p className="mt-3 text-xs text-muted-foreground">{AYUDA_CORTE}</p>}
      </div>
    )
  }

  if (estado === "demasiados") {
    return (
      <div className="flex items-center gap-3 rounded-card bg-card p-4">
        <Punto estado={estado} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-warn">La carpeta tiene demasiados archivos</p>
          <p className="text-xs text-muted-foreground">Elige una subcarpeta más específica.</p>
        </div>
      </div>
    )
  }

  if (estado === "viejo") {
    const dias = ultimoPiezaAPieza !== null ? Math.floor((ahora - ultimoPiezaAPieza) / DIA_MS) : null
    return (
      <div className="flex items-center gap-3 rounded-card bg-card p-4">
        <Punto estado={estado} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-warn tabular-nums">
            {dias !== null ? `El último exporte tiene ${dias} ${dias === 1 ? "día" : "días"}` : "No hay ningún Pieza a pieza reciente en la carpeta"}
          </p>
          <p className="text-xs text-muted-foreground">Sin exportes nuevos, el monitor no tiene dato del grader. Exporta desde Matrix y guarda en la carpeta.</p>
        </div>
      </div>
    )
  }

  if (estado === "error") {
    const detalle = ultimo?.tipo === "fallo" ? `${ultimo.archivo}: ${ultimo.mensaje}` : errorTexto
    return (
      <div className="flex items-center gap-3 rounded-card bg-card p-4">
        <Punto estado={estado} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-crit">La carga automática no pudo cargar el archivo</p>
          <p className="text-xs text-muted-foreground">{detalle ?? "Revisa la carpeta; se reintentará en la próxima revisión."}</p>
        </div>
      </div>
    )
  }

  // Omitido: el archivo se revisó pero Matrix ya tenía datos más completos.
  if (ultimo?.tipo === "omitido") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Punto estado="vigilando" />
        Omitido: ya hay datos más completos en Matrix para {ultimo.archivo}
      </p>
    )
  }

  return null
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
