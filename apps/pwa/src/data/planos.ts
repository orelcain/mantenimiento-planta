/**
 * Catálogo de planos eléctricos navegables del Centro de Aprendizaje.
 *
 * Sumar una máquina nueva = correr `scripts/planos/extraer_plano_142.py`
 * apuntando a su PDF y agregar una entrada acá. El visor no se toca.
 *
 * Los assets viven en `public/planos/<slug>/` (SVG por hoja + zonas clicables).
 * Pesan ~400 KB por hoja en disco pero se sirven comprimidos a ~41 KB, así que
 * se cargan de a una y NO se meten en el bundle.
 */

export type PlanoCatalogo = {
  /** Carpeta en public/planos/ y segmento de URL. */
  slug: string
  /** Máquina a la que pertenece, tal como la nombra la planta. */
  maquina: string
  /** Número de plano del fabricante, el que sale en la placa. */
  numero: string
  revision: string
  /** Para qué versión de la máquina sirve. Importa: la 142 vieja usa otro. */
  aplicaA: string
  hojas: number
  /** Hojas que el PDF original no trae. Se avisa en vez de fingir que no faltan. */
  faltantes: number[]
  descripcion: string
}

export const PLANOS: PlanoCatalogo[] = [
  {
    slug: 'baader-142-888',
    maquina: 'BAADER 142',
    numero: '142.71.00.888',
    revision: 'A1 · 23.08.2022',
    aplicaA: 'BAADER 142 nuevas (Type 142-511, 2022)',
    hojas: 45,
    faltantes: [43],
    descripcion:
      'Esquema de circuitos y plano de bornes de la evisceradora. Confirmado contra la placa: ' +
      'el campo Wiring Diagr. dice 1427100888.',
  },
  {
    slug: 'baader-200-862',
    maquina: 'BAADER 200',
    numero: '200.70.00.862',
    revision: '—',
    aplicaA: 'BAADER 200 (fileteadora)',
    hojas: 10,
    faltantes: [],
    descripcion:
      'Esquema de circuitos (hojas 1-7) y plano de bornes (8-10) de la fileteadora. ' +
      'Mismo visor: saltos, bornes y rotulos traducidos.',
  },
]

export function planoPorSlug(slug: string | undefined) {
  return PLANOS.find((p) => p.slug === slug)
}

/** Ruta pública de un asset del plano (índice, hoja SVG o sus zonas). */
export function assetPlano(slug: string, archivo: string) {
  return `${import.meta.env.BASE_URL}planos/${slug}/${archivo}`
}
