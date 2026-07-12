/**
 * Catalogo de maquinas del Centro de Aprendizaje
 * Cada maquina tiene 4 secciones: manual, procedimientos, flujos y diagnostico
 *
 * Estado: por ahora estatico. A futuro migrar a Firestore (coleccion `learningMachines`)
 * para que admin pueda editar desde /aprendizaje/admin
 */
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen, Fish, Scissors, Scale, Package, Zap, Boxes, HeartPulse, ShieldCheck,
} from 'lucide-react'

export type LearningSection = 'manual' | 'procedures' | 'flows' | 'diagnosis'

export interface LearningMachineSections {
  manual: boolean
  procedures: boolean
  flows: boolean
  diagnosis: boolean
}

export interface LearningMachine {
  slug: string
  name: string
  area: string
  description: string
  icon: LucideIcon
  color: string
  /** Ruta custom si la maquina tiene su propia pagina (ej: Baader 200) */
  customRoute?: string
  /** Simulador HMI asociado (cross-link "Practicar en el simulador"). */
  hmiRoute?: string
  /** Nombre del simulador asociado (para el label del boton). */
  hmiLabel?: string
  sections: LearningMachineSections
  // ── Solo para temas de curso (area CAPACITACION_AREA) ──
  /** Programa/serie al que pertenece el curso (ej: "Programa Electricidad - Mantenimiento Industrial"). */
  programa?: string
  /** Numero de modulo dentro del programa (ordena las tarjetas). */
  modulo?: number
  /** Nivel del programa (ej: 1). */
  nivel?: number
}

/** Area del catalogo cuyos temas son CURSOS (no maquinas): set de pestanas y UI distintos. */
export const CAPACITACION_AREA = 'Capacitacion / Normativa'

/** True si el tema es un curso (vive en el area de capacitacion). */
export function isCourseMachine(machine: Pick<LearningMachine, 'area'>): boolean {
  return machine.area === CAPACITACION_AREA
}

/** Areas de la planta (para agrupacion en el hub) */
export const LEARNING_AREAS = [
  'Planta Principal',
  CAPACITACION_AREA,
] as const

/** Maquinas favoritas del modulo repuestos — prioridad alta para documentacion */
export const LEARNING_MACHINES: LearningMachine[] = [
  {
    slug: 'marel-hg',
    name: 'Marel HG',
    area: 'Planta Principal',
    description: 'Linea de procesamiento primario Marel; operacion y control desde el software del Clasificador A600 (controlador M3210): pantallas, programas, productos, lotes, informes y alarmas.',
    icon: Fish,
    color: '#5a7d9e',
    sections: { manual: true, procedures: true, flows: true, diagnosis: true },
  },
  {
    slug: 'baader-142',
    name: 'Evisceradora Baader 142 N3',
    area: 'Planta Principal',
    description: 'Evisceradora Baader 142 — manual completo del fabricante: seguridad, funcionamiento, ajustes, limpieza, mantenimiento y catalogo de fallas y codigos de error (A3C).',
    icon: Scissors,
    color: '#a5745f',
    hmiRoute: '/aprendizaje/hmi-knuro',
    hmiLabel: 'HMI Knuro B2',
    sections: { manual: true, procedures: true, flows: true, diagnosis: true },
  },
  {
    slug: 'grader',
    name: 'Grader',
    area: 'Planta Principal',
    description: 'Clasificador automatico por peso y tamaño. Manual Marelec MS4/12, SOPs y runbooks Z2 (contrastacion, calibracion, mantencion, limpieza, troubleshooting).',
    icon: Scale,
    color: '#6e9080',
    hmiRoute: '/aprendizaje/hmi-grader',
    hmiLabel: 'HMI Grader (Z2)',
    sections: { manual: true, procedures: true, flows: true, diagnosis: true },
  },
  {
    slug: 'baader-200',
    name: 'Baader 200',
    area: 'Planta Principal',
    description: 'Fileteadora Baader 200 — manual tecnico completo con ajustes, medidas y calibracion.',
    icon: BookOpen,
    color: '#6b8299',
    hmiRoute: '/aprendizaje/hmi-knuro',
    hmiLabel: 'HMI Knuro B2',
    sections: { manual: true, procedures: true, flows: true, diagnosis: true },
  },
  {
    slug: 'marel-filete',
    name: 'Marel Filete',
    area: 'Planta Principal',
    description: 'Maquina fileteadora Marel.',
    icon: Fish,
    color: '#86769c',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'termoformadora-gea',
    name: 'Termoformadora GEA',
    area: 'Planta Principal',
    description: 'Termoformadora de empaque al vacio para productos finales.',
    icon: Package,
    color: '#5f8f88',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'fishken',
    name: 'Fishken',
    area: 'Planta Principal',
    description: 'Equipo de procesamiento Fishken.',
    icon: Fish,
    color: '#ab8f5e',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'detector-metales',
    name: 'Detector de Metales',
    area: 'Planta Principal',
    description: 'Detector de metales en linea de empaque.',
    icon: Zap,
    color: '#a06b64',
    sections: { manual: true, procedures: true, flows: true, diagnosis: true },
  },
  {
    slug: 'enzunchadora-n2',
    name: 'Enzunchadora N2',
    area: 'Planta Principal',
    description: 'Enzunchadora automatica de cajas terminadas.',
    icon: Boxes,
    color: '#9c7186',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'seguridad-electrica',
    name: 'Seguridad Electrica (NFPA 70E)',
    area: CAPACITACION_AREA,
    programa: 'Programa Electricidad - Mantenimiento Industrial',
    modulo: 1,
    nivel: 1,
    description: 'Curso NFPA 70E 2024: seguridad electrica en lugares de trabajo. Los 3 peligros (choque, arco, rafaga), efectos de la corriente, 5 Reglas de Oro, bloqueo/etiquetado (LOTO), fronteras de aproximacion, EPP y jerarquia de control.',
    icon: Zap,
    color: '#3b6fa8',
    sections: { manual: true, procedures: true, flows: true, diagnosis: true },
  },
  {
    slug: 'rescate-svb',
    name: 'Rescate Electrico y SVB',
    area: CAPACITACION_AREA,
    programa: 'Programa Electricidad - Mantenimiento Industrial',
    modulo: 2,
    nivel: 1,
    description: 'Curso NFPA 70E: rescate electrico y soporte vital basico (SVB). Peligros electricos, 5 Reglas de Oro, control de hemorragias, RCP 30:2 y evaluacion ABCDE.',
    icon: HeartPulse,
    color: '#b14a5a',
    sections: { manual: true, procedures: true, flows: true, diagnosis: true },
  },
  {
    slug: 'nfpa-70b',
    name: 'NFPA 70B - Mantenimiento Electrico',
    area: CAPACITACION_AREA,
    programa: 'Programa Electricidad - Mantenimiento Industrial',
    modulo: 3,
    nivel: 1,
    description: 'Norma NFPA 70B 2023: mantenimiento del equipo electrico. MEP, 4 pilares, criticidad y riesgo, tipos de mantenimiento, pruebas (termografia, puesta a tierra) y mejora continua (PHVA).',
    icon: ShieldCheck,
    color: '#bf8b3e',
    sections: { manual: true, procedures: true, flows: true, diagnosis: true },
  },
]

/** Encuentra una maquina por slug */
export function findMachineBySlug(slug: string): LearningMachine | undefined {
  return LEARNING_MACHINES.find(m => m.slug === slug)
}

/** Agrupa maquinas por area */
export function groupMachinesByArea(): Record<string, LearningMachine[]> {
  const grouped = LEARNING_MACHINES.reduce<Record<string, LearningMachine[]>>((acc, machine) => {
    if (!acc[machine.area]) acc[machine.area] = []
    acc[machine.area]!.push(machine)
    return acc
  }, {})
  // Cursos: ordenar por numero de modulo dentro del programa
  if (grouped[CAPACITACION_AREA]) {
    grouped[CAPACITACION_AREA]!.sort((a, b) => (a.modulo ?? 99) - (b.modulo ?? 99))
  }
  return grouped
}

/** Cuenta secciones habilitadas de una maquina */
export function countEnabledSections(machine: LearningMachine): number {
  return Object.values(machine.sections).filter(Boolean).length
}
