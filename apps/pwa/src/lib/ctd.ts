import type { Equipment, FichaTecnica, Incident, WorkOrder } from '@/types'

/**
 * Helpers puros y constantes del Centro Técnico Documental (EMP · NFPA 70B).
 *
 * Lógica sin estado compartida por la página (`CentroTecnicoDocumentalPage`),
 * el hook de listado (`useCtdEquipos`) y los sub-componentes (fila/tarjeta/
 * agenda/expediente). No tiene dependencias de React.
 */

export const CRIT: Record<Equipment['criticidad'], { nivel: string; cls: string }> = {
  alta: { nivel: 'A', cls: 'border-red-500 text-red-600' },
  media: { nivel: 'B', cls: 'border-amber-500 text-amber-600' },
  baja: { nivel: 'C', cls: 'border-emerald-500 text-emerald-600' },
}

/** Explicación de la criticidad (NFPA 70B §2.4) para mostrar/aclarar en la UI. */
export const CRIT_INFO: Record<Equipment['criticidad'], { label: string; desc: string }> = {
  alta: { label: 'A · Alta', desc: 'Su falla amenaza a personas, producto o propiedad (NFPA 70B §2.4). Inspección base ~180 días.' },
  media: { label: 'B · Media', desc: 'Falla con impacto moderado o con respaldo parcial. Inspección base ~365 días.' },
  baja: { label: 'C · Baja', desc: 'Falla sin impacto significativo o equipo redundante. Inspección base ~1095 días.' },
}

export const ESTADO: Record<Equipment['estado'], { label: string; cls: string }> = {
  operativo: { label: 'Operativo', cls: 'border-emerald-500 text-emerald-600' },
  en_mantenimiento: { label: 'En mantención', cls: 'border-amber-500 text-amber-600' },
  fuera_servicio: { label: 'Fuera de servicio', cls: 'border-red-500 text-red-600' },
}

/**
 * Color del semáforo de condición (1 mejor → 3 peor).
 * Es un color de dato, no una clase de Tailwind: lo consumen tanto el punto de la
 * UI (`<CondDot>`) como los tooltips de ECharts, que son HTML plano.
 */
export const COND_COLOR: Record<1 | 2 | 3, string> = {
  1: 'rgb(16,185,129)',
  2: 'rgb(234,179,8)',
  3: 'rgb(239,68,68)',
}

export const COND_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Condición 1 (mejor)',
  2: 'Condición 2',
  3: 'Condición 3 (peor)',
}

export const WO_ESTADO: Record<WorkOrder['estado'], { label: string; cls: string }> = {
  abierta: { label: 'Abierta', cls: 'border-blue-500 text-blue-600' },
  en_proceso: { label: 'En proceso', cls: 'border-amber-500 text-amber-600' },
  cerrada: { label: 'Cerrada', cls: 'border-emerald-500 text-emerald-600' },
  cancelada: { label: 'Cancelada', cls: 'border-border text-muted-foreground' },
}
export const WO_PRIORIDAD: Record<WorkOrder['prioridad'], { label: string; cls: string }> = {
  critica: { label: 'Crítica', cls: 'text-red-600' },
  alta: { label: 'Alta', cls: 'text-amber-600' },
  media: { label: 'Media', cls: 'text-muted-foreground' },
  baja: { label: 'Baja', cls: 'text-muted-foreground' },
}
export const WO_TIPOS: { value: WorkOrder['tipo']; label: string }[] = [
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'preventivo', label: 'Preventivo' },
  { value: 'predictivo', label: 'Predictivo' },
  { value: 'inspeccion', label: 'Inspección' },
  { value: 'mejora', label: 'Mejora' },
]

export const PLACA_FIELDS: (keyof FichaTecnica)[] = [
  'potenciaKw',
  'voltajeV',
  'corrienteA',
  'rpm',
  'factorServicio',
  'claseAislamiento',
  'gradoIP',
]

export function completitud(eq: Equipment): number {
  const ft = eq.fichaTecnica
  if (!ft) return 0
  const filled = PLACA_FIELDS.filter((k) => {
    const v = ft[k]
    return v !== undefined && v !== null && v !== ''
  }).length
  return Math.round((filled / PLACA_FIELDS.length) * 100)
}

export function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function diasVencida(iso?: string): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const diff = startOfToday() - t
  return diff > 0 ? Math.floor(diff / 86400000) : null
}

/** Años transcurridos desde una fecha (null si no hay/ inválida). */
export function aniosDesde(d?: Date | string): number | null {
  if (!d) return null
  const t = new Date(d).getTime()
  if (Number.isNaN(t)) return null
  return (Date.now() - t) / (365.25 * 86400000)
}

/** Métricas de confiabilidad de un equipo a partir de sus incidencias. */
export function confiabilidad(incidents: Incident[]): {
  fallas: number
  mttrHoras: number | null
  mtbfDias: number | null
  disponibilidad: number | null
} {
  const correctivos = incidents.filter((i) => i.tipo === 'correctivo')
  const fallas = correctivos.length
  const conTiempo = correctivos.filter((i) => typeof i.tiempoResolucionMinutos === 'number')
  const downtimeMin = conTiempo.reduce((s, i) => s + (i.tiempoResolucionMinutos ?? 0), 0)
  const mttrHoras = conTiempo.length > 0 ? downtimeMin / conTiempo.length / 60 : null
  // Ventana = desde la incidencia más antigua cargada hasta hoy.
  const fechas = incidents.map((i) => new Date(i.createdAt).getTime()).filter((t) => !Number.isNaN(t))
  const desde = fechas.length ? Math.min(...fechas) : null
  const ventanaMin = desde ? (Date.now() - desde) / 60000 : null
  const mtbfDias = ventanaMin && fallas > 0 ? ventanaMin / fallas / 1440 : null
  const disponibilidad = ventanaMin && ventanaMin > 0 ? Math.max(0, ((ventanaMin - downtimeMin) / ventanaMin) * 100) : null
  return { fallas, mttrHoras, mtbfDias, disponibilidad }
}

/** URL pública del equipo para el código QR (misma convención que EquipmentPage). */
export function qrUrl(equipmentId: string): string {
  return `${window.location.origin}/mantenimiento-planta/public/equipment/${equipmentId}`
}

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
/** Formatea un costo en pesos chilenos (— si no hay valor). */
export function formatCosto(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return CLP.format(n)
}

/** Segmentos de la ruta jerárquica del equipo (sin vacíos).
 *  Forma real: "Aquachile… > PLANTA > SECCIÓN > LÍNEA > … > Equipo". */
export function pathParts(eq: Equipment): string[] {
  return (eq.hierarchyPath ?? '').split('>').map((s) => s.trim()).filter(Boolean)
}
/** Sección = nivel 2 (PROCESO, FRIGORIFICO, EXTERIORES, PLANTA RILES…). */
export function seccionDe(eq: Equipment): string | null {
  return pathParts(eq)[2] ?? null
}
/** Línea = nivel 3 (TUNELES, EMPAQUE, EVISCERADO, CAMARAS…). */
export function lineaDe(eq: Equipment): string | null {
  return pathParts(eq)[3] ?? null
}

export const ITEMS_PER_PAGE = 50

export type Filtro = 'todos' | 'A' | 'cond3' | 'vencida' | 'incompleta' | 'favoritos' | 'otAbiertas' | 'otVencidas'
export type EstadoFiltro = 'all' | Equipment['estado']
export type OrdenCampo = 'criticidad' | 'proxima' | 'ficha' | 'area' | 'nombre'
export type Vista = 'lista' | 'agenda' | 'tarjetas'

/** Fecha de próxima inspección en ms (Infinity si no hay / inválida) — para ordenar. */
export function proximaMs(eq: Equipment): number {
  const iso = eq.fichaTecnica?.proximaInspeccion
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

export type Bucket = 'vencidas' | 'd30' | 'd60' | 'd90' | 'futuro' | 'sin'
export const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'vencidas', label: 'Vencidas' },
  { key: 'd30', label: 'Próximos 30 días' },
  { key: 'd60', label: '31–60 días' },
  { key: 'd90', label: '61–90 días' },
  { key: 'futuro', label: 'Más de 90 días' },
  { key: 'sin', label: 'Sin fecha de inspección' },
]
export function bucketDe(eq: Equipment): Bucket {
  const iso = eq.fichaTecnica?.proximaInspeccion
  if (!iso) return 'sin'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'sin'
  const dias = Math.floor((t - startOfToday()) / 86400000)
  if (dias < 0) return 'vencidas'
  if (dias <= 30) return 'd30'
  if (dias <= 60) return 'd60'
  if (dias <= 90) return 'd90'
  return 'futuro'
}

/** Cuenta de OT abiertas / vencidas por equipo (a nivel programa). */
export type OtCount = { abiertas: number; vencidas: number }

/** ¿La OT está abierta o en proceso (cuenta para el programa)? */
export function otAbierta(wo: WorkOrder): boolean {
  return wo.estado === 'abierta' || wo.estado === 'en_proceso'
}

/** ¿OT abierta cuya fecha programada ya pasó? */
export function otVencida(wo: WorkOrder): boolean {
  if (!otAbierta(wo) || !wo.fechaProgramada) return false
  const t = new Date(wo.fechaProgramada).getTime()
  return !Number.isNaN(t) && t < startOfToday()
}

/** Agrupa OTs por equipo en conteos abiertas/vencidas. */
export function contarOtPorEquipo(workOrders: WorkOrder[]): Map<string, OtCount> {
  const map = new Map<string, OtCount>()
  for (const wo of workOrders) {
    if (!otAbierta(wo)) continue
    const c = map.get(wo.equipmentId) ?? { abiertas: 0, vencidas: 0 }
    c.abiertas++
    if (otVencida(wo)) c.vencidas++
    map.set(wo.equipmentId, c)
  }
  return map
}
