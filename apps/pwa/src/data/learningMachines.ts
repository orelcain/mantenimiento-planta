/**
 * Catalogo de maquinas del Centro de Aprendizaje
 * Cada maquina tiene 4 secciones: manual, procedimientos, flujos y diagnostico
 *
 * Estado: por ahora estatico. A futuro migrar a Firestore (coleccion `learningMachines`)
 * para que admin pueda editar desde /aprendizaje/admin
 */
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen, Fish, Scissors, Scale, Package, Zap, Boxes,
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
  sections: LearningMachineSections
}

/** Areas de la planta (para agrupacion en el hub) */
export const LEARNING_AREAS = [
  'Planta Principal',
] as const

/** Maquinas favoritas del modulo repuestos — prioridad alta para documentacion */
export const LEARNING_MACHINES: LearningMachine[] = [
  {
    slug: 'marel-hg',
    name: 'Marel HG',
    area: 'Planta Principal',
    description: 'Maquina descabezadora / desvisceradora de procesamiento primario.',
    icon: Fish,
    color: '#4499ff',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'baader-142',
    name: 'Evisceradora Baader 142 N3',
    area: 'Planta Principal',
    description: 'Maquina evisceradora para procesamiento primario de pescado.',
    icon: Scissors,
    color: '#ff8844',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'grader',
    name: 'Grader',
    area: 'Planta Principal',
    description: 'Clasificador automatico por peso y tamaño.',
    icon: Scale,
    color: '#44dd88',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'baader-200',
    name: 'Baader 200',
    area: 'Planta Principal',
    description: 'Fileteadora Baader 200 — manual tecnico completo con ajustes, medidas y calibracion.',
    icon: BookOpen,
    color: '#4499ff',
    customRoute: '/aprendizaje/baader-200',
    sections: { manual: true, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'marel-filete',
    name: 'Marel Filete',
    area: 'Planta Principal',
    description: 'Maquina fileteadora Marel.',
    icon: Fish,
    color: '#aa66ff',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'termoformadora-gea',
    name: 'Termoformadora GEA',
    area: 'Planta Principal',
    description: 'Termoformadora de empaque al vacio para productos finales.',
    icon: Package,
    color: '#44ddaa',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'fishken',
    name: 'Fishken',
    area: 'Planta Principal',
    description: 'Equipo de procesamiento Fishken.',
    icon: Fish,
    color: '#ffcc44',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'detector-metales',
    name: 'Detector de Metales',
    area: 'Planta Principal',
    description: 'Detector de metales en linea de empaque.',
    icon: Zap,
    color: '#ff4444',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
  {
    slug: 'enzunchadora-n2',
    name: 'Enzunchadora N2',
    area: 'Planta Principal',
    description: 'Enzunchadora automatica de cajas terminadas.',
    icon: Boxes,
    color: '#ff66aa',
    sections: { manual: false, procedures: false, flows: false, diagnosis: false },
  },
]

/** Encuentra una maquina por slug */
export function findMachineBySlug(slug: string): LearningMachine | undefined {
  return LEARNING_MACHINES.find(m => m.slug === slug)
}

/** Agrupa maquinas por area */
export function groupMachinesByArea(): Record<string, LearningMachine[]> {
  return LEARNING_MACHINES.reduce<Record<string, LearningMachine[]>>((acc, machine) => {
    if (!acc[machine.area]) acc[machine.area] = []
    acc[machine.area]!.push(machine)
    return acc
  }, {})
}

/** Cuenta secciones habilitadas de una maquina */
export function countEnabledSections(machine: LearningMachine): number {
  return Object.values(machine.sections).filter(Boolean).length
}
