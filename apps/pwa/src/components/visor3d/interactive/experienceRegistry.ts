import type { Model3D } from '@/types/models3d'

export type InteractiveExperienceId = 'tobogan' | 'sopladorasBaader142'

export interface StandaloneInteractiveExperience {
  id: InteractiveExperienceId
  label: string
  description: string
  route: string
  sourceLabel: string
}

const TOBOGAN_EXPERIENCE_ALIASES = [
  'tobogan',
  'tbg',
  'tbg01',
  'tolva-tobogan',
]

const SOPLADORAS_BAADER142_EXPERIENCE_ALIASES = [
  'sopladoras baader 142',
  'sopladora baader 142',
  'sopladoras baader 142, nueva ubicacion',
  'sopladoras baader 142 nueva ubicacion',
  'sopladora baader 142.glb',
]

export interface InteractiveExperienceDescriptor {
  id: InteractiveExperienceId
  label: string
}

export const STANDALONE_INTERACTIVE_EXPERIENCES: StandaloneInteractiveExperience[] = [
  {
    id: 'tobogan',
    label: 'Tobogan Decomiso',
    description:
      'Experiencia interactiva cargada desde la repo externa del tobogan, independiente del inventario de modelos 3D.',
    route: '/visor-3d/interactividad/tobogan',
    sourceLabel: 'Repo externa',
  },
  {
    id: 'sopladorasBaader142',
    label: 'Sopladoras Baader 142',
    description:
      'Base operativa para definir estados por sopladora, modos de trabajo y secuencias de inspeccion antes de conectarlo al modelo 3D.',
    route: '/visor-3d/interactividad/sopladoras-baader-142',
    sourceLabel: 'Base operativa',
  },
]

function normalizeExperienceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function buildSearchableText(
  model: Pick<Model3D, 'id' | 'name' | 'originalFileName'>,
): string {
  return normalizeExperienceText(
    `${model.id} ${model.name} ${model.originalFileName}`,
  )
}

export function getInteractiveExperienceForModel(
  model: Pick<Model3D, 'id' | 'name' | 'originalFileName'> | null | undefined,
): InteractiveExperienceDescriptor | null {
  if (!model) return null

  const searchableText = buildSearchableText(model)

  if (TOBOGAN_EXPERIENCE_ALIASES.some((alias) => searchableText.includes(alias))) {
    return {
      id: 'tobogan',
      label: 'Tobogan',
    }
  }

  if (SOPLADORAS_BAADER142_EXPERIENCE_ALIASES.some((alias) => searchableText.includes(alias))) {
    return {
      id: 'sopladorasBaader142',
      label: 'Sopladoras Baader 142',
    }
  }

  return null
}

export function hasToboganInteractiveExperience(
  model: Pick<Model3D, 'id' | 'name' | 'originalFileName'> | null | undefined,
): boolean {
  return getInteractiveExperienceForModel(model)?.id === 'tobogan'
}

export function getModelsWithInteractiveExperience(
  models: Pick<Model3D, 'id' | 'name' | 'originalFileName' | 'format'>[],
): Array<Pick<Model3D, 'id' | 'name' | 'originalFileName' | 'format'> & { experience: InteractiveExperienceDescriptor }> {
  return models.flatMap((model) => {
    const experience = getInteractiveExperienceForModel(model)
    return experience ? [{ ...model, experience }] : []
  })
}