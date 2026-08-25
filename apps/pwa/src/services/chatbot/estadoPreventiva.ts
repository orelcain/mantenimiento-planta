/**
 * Cómo describirle a ARIA una tarea preventiva: si está al día o vencida.
 *
 * POR QUÉ EXISTE
 * --------------
 * El resumen del día decía **"📅 Preventivos: Sin alertas de retraso"** mientras
 * el panel de avisos de la misma pantalla decía *"Preventiva 'revision de
 * correas' de EVISCERADORA BAADER 142 N1 **vencida hace 218 días**"*.
 *
 * No era invento del modelo: el contexto que le llegaba listaba
 * `→ próxima: 19-01-2026` y nada más. Una fecha pasada, presentada como
 * "próxima", se lee como que está programada. El modelo no tiene por qué
 * comparar fechas — el contexto tiene que decirlo.
 */

export interface EstadoPreventiva {
  vencida: boolean
  diasDeAtraso: number
  /** Lo que se le pasa a ARIA: "vencida hace 218 días" o "próxima: 19-01-2026". */
  texto: string
}

const UN_DIA_MS = 86_400_000

export function estadoDePreventiva(
  proximaEjecucion: Date | null | undefined,
  ahora: Date,
): EstadoPreventiva {
  if (!proximaEjecucion || Number.isNaN(proximaEjecucion.getTime())) {
    return { vencida: false, diasDeAtraso: 0, texto: 'sin fecha programada' }
  }

  const fecha = proximaEjecucion.toLocaleDateString('es-CL')
  const atraso = Math.floor((ahora.getTime() - proximaEjecucion.getTime()) / UN_DIA_MS)

  if (atraso <= 0) return { vencida: false, diasDeAtraso: 0, texto: `próxima: ${fecha}` }
  if (atraso === 1) return { vencida: true, diasDeAtraso: 1, texto: `VENCIDA hace 1 día (era el ${fecha})` }
  return { vencida: true, diasDeAtraso: atraso, texto: `VENCIDA hace ${atraso} días (era el ${fecha})` }
}
