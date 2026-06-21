// Tipos del levantamiento de tableros eléctricos (base para unifilares + histórico NFPA 70B).
// Ver docs/LEVANTAMIENTO_TABLEROS.md. Convención: el levantamiento inicial se guarda como
// Revisión 0 (as-found); cada cambio posterior agrega una revisión → nace el histórico.

export type CondicionNFPA = 1 | 2 | 3 // 1 normal · 2 vigilar · 3 paro

export type TipoTablero = 'CCM' | 'TGD' | 'distribucion' | 'alumbrado' | 'control' | 'otro'

export type EstadoCircuito = 'activo' | 'reserva' | 'fuera_servicio'

export type TipoRevision = 'as-found' | 'cambio' | 'trabajo'

export interface CircuitoTablero {
  numero: string
  descripcion: string
  cargaNodeId?: string // equipo de hierarchy/equipment que alimenta (enlace futuro)
  cargaNombre?: string
  ratingA?: number
  polos?: number
  marca?: string
  modelo?: string
  conductorCalibre?: string
  estado: EstadoCircuito
  condicion: CondicionNFPA
  observacion?: string
}

export interface RevisionTablero {
  id: string
  fecha: string // ISO
  autor?: string
  tipo: TipoRevision
  descripcion: string
}

export interface InterruptorPrincipal {
  marca?: string
  modelo?: string
  ratingA?: number
  polos?: number
  aicKA?: number
  tensionV?: number
}

export interface Tablero {
  id: string
  equipmentId?: string // el tablero ES un equipo (doc id = equipmentId); vive en su expediente
  tag: string
  nombre: string
  tipo: TipoTablero
  hierarchyNodeId?: string
  areaNombre?: string
  ubicacionFisica?: string
  tensionV?: number
  fases?: 1 | 3
  iccDisponibleKA?: number
  alimentadoDesde?: string
  principal?: InterruptorPrincipal
  barraTensionV?: number
  barraCorrienteA?: number
  condicionGeneral: CondicionNFPA
  circuitos: CircuitoTablero[]
  revisiones: RevisionTablero[]
  fotos?: string[]
  observaciones?: string
  createdAt: Date
  updatedAt: Date
  createdBy?: string
}

export const TIPO_TABLERO_LABEL: Record<TipoTablero, string> = {
  CCM: 'CCM (centro de control de motores)',
  TGD: 'Tablero general de distribución',
  distribucion: 'Tablero de distribución',
  alumbrado: 'Tablero de alumbrado',
  control: 'Tablero de control',
  otro: 'Otro',
}

export const CONDICION_LABEL: Record<CondicionNFPA, string> = {
  1: 'Condición 1 · normal',
  2: 'Condición 2 · vigilar',
  3: 'Condición 3 · paro',
}

export const ESTADO_CIRCUITO_LABEL: Record<EstadoCircuito, string> = {
  activo: 'Activo',
  reserva: 'Reserva',
  fuera_servicio: 'Fuera de servicio',
}
