import type { Model3D } from '@/types/models3d'

export type InteractiveExperienceId = 'tobogan'

export interface InteractiveExperienceDescriptor {
  id: InteractiveExperienceId
  label: string
}

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

  if (searchableText.includes('tobogan')) {
    return {
      id: 'tobogan',
      label: 'Tobogan',
    }
  }

  return null
}

export function hasToboganInteractiveExperience(
  model: Pick<Model3D, 'id' | 'name' | 'originalFileName'> | null | undefined,
): boolean {
  return getInteractiveExperienceForModel(model)?.id === 'tobogan'
}