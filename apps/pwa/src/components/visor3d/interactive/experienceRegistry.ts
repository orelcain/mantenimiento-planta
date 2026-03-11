import type { Model3D } from '@/types/models3d'

function normalizeExperienceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function hasToboganInteractiveExperience(
  model: Pick<Model3D, 'name' | 'originalFileName'> | null | undefined,
): boolean {
  if (!model) return false

  const searchableText = normalizeExperienceText(
    `${model.name} ${model.originalFileName}`,
  )

  return searchableText.includes('tobogan')
}