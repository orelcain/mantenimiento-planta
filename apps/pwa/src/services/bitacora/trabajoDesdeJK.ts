/**
 * Trabajo de Mantención nacido de una detención del Jack-Knife («Registrar trabajo»).
 * Lógica pura: arma el documento de `bitacoraEventos` que la hoja escribe. Sin Firestore ni React.
 *
 * HORA: `inicioMs` es hora de PLANTA guardada como si fuera UTC (ver SPEC_BUSCADOR_JACK_KNIFE.md).
 * Por eso todo aquí sale de getters UTC, nunca de la hora local del navegador.
 */
import { BITACORA_PLANTA } from '@/config/bitacora'
import type {
  BandaTurno,
  DispositivoBitacora,
  EventoBitacora,
  RepuestoUsado,
} from '@/services/bitacora/bitacora.types'
import { normalizarRepuestos } from './presentacionEvento'
import { bandaDeHora } from './turnoMantencion'

const MIN = 60_000
const pad = (n: number) => String(n).padStart(2, '0')

/** Fecha calendario (UTC getters) de un instante de planta: `AAAA-MM-DD`. */
export function fechaUTC(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Hora `HH:mm` (UTC getters) de un instante de planta. */
export function horaUTC(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** Turno de Bitácora (`fecha_banda`) que corresponde a un inicio de planta. La noche 00-08 cae en el día calendario del inicio. */
export function turnoBitacoraDesde(inicioMs: number): { turnoId: string; fechaTurno: string; banda: BandaTurno } {
  const fechaTurno = fechaUTC(inicioMs)
  const banda = bandaDeHora(new Date(inicioMs).getUTCHours())
  return { turnoId: `${fechaTurno}_${banda}`, fechaTurno, banda }
}

/** Clave de la detención del Jack-Knife: `jk:<planta>:<turnoJK>:<inicioMs>` (la lee `cambiosSinAviso`). */
export function jkClave(planta: string, turnoJkId: string, inicioMs: number): string {
  return `jk:${planta}:${turnoJkId}:${inicioMs}`
}

export interface DatosTrabajoJK {
  /** Id del turno del Jack-Knife (`2026-10-01_Turno 2`). */
  turnoJkId: string
  inicioMs: number
  /** Minutos de la detención (se redondean). */
  min: number
  /** Equipo o máquina, texto libre. Obligatorio. */
  equipo: string
  /** Componente afectado (p. ej. «expulsador»). Vacío = sin componente. */
  componente: string
  descripcion: string
  repuestos: readonly Partial<RepuestoUsado>[]
  /** N° de aviso SAP, opcional. */
  avisoSap: string
  /** Técnico que registra (el recordado en este teléfono). */
  registradoPor: string
  uid: string
  autorNombre: string
  dispositivo: DispositivoBitacora
  /** Planta de la Bitácora; por defecto la de la Bitácora. */
  plantId?: string
}

/**
 * Documento listo para `setDoc`, sin `id`, `createdAt` ni `updatedAt` (los pone quien escribe).
 * Trae todos los campos obligatorios que escribe `useBitacoraTurno.guardar` para un evento publicado,
 * con `null` y nunca `undefined`.
 */
export function trabajoDesdeJK(d: DatosTrabajoJK): Omit<EventoBitacora, 'id' | 'createdAt' | 'updatedAt'> {
  const plantId = d.plantId ?? BITACORA_PLANTA.id
  const { turnoId, fechaTurno, banda } = turnoBitacoraDesde(d.inicioMs)
  const minutos = Math.max(0, Math.round(d.min))
  const termino = horaUTC(d.inicioMs + minutos * MIN)
  const componente = d.componente.trim()
  const aviso = d.avisoSap.trim()
  return {
    plantId,
    turnoId,
    fechaTurno,
    banda,
    tipo: 'correctivo',
    tipoOtro: null,
    equipo: d.equipo.trim(),
    titulo: null,
    descripcion: d.descripcion.trim(),
    horaInicio: horaUTC(d.inicioMs),
    horaTermino: minutos > 0 ? termino : null,
    posicionMin: null,
    impacto: 'con-parada',
    minutosParada: minutos,
    ventana: null,
    contingencia: null,
    pendiente: false,
    fotos: [],
    creadoPor: d.uid,
    autorNombre: d.autorNombre,
    registradoPor: d.registradoPor.trim() || d.autorNombre,
    participantes: [],
    equipoId: null,
    equipoCodigo: null,
    repuestos: normalizarRepuestos(d.repuestos),
    inspeccion: null,
    estado: 'listo',
    dispositivo: d.dispositivo,
    componente: componente || null,
    avisoSap: aviso || null,
    jkClave: jkClave(plantId, d.turnoJkId, d.inicioMs),
  }
}
