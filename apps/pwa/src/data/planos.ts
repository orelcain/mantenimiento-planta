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

/** Los planos pesados viven en Firebase Storage (lectura publica via
 *  storage.rules `planos/`), no en el repo: la GEA sola son ~400 MB de SVG. */
const STORAGE_BASE =
  'https://firebasestorage.googleapis.com/v0/b/mantenimiento-planta-771a3.firebasestorage.app/o/'

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
  /** 'visor': el PDF trae el texto en contornos (sin palabras extraibles) —
   *  hojas navegables y notas por hoja, pero sin zonas clicables ni indice.
   *  'despiece': catalogo de piezas (figuras numeradas, no hojas de circuito):
   *  buscador y notas si, pero sin toggle DE/ES. */
  modo?: 'visor' | 'despiece'
  /** Presente = los assets se sirven desde Firebase Storage, no del bundle. */
  enStorage?: boolean
  /** Version de los assets en Storage: subirla rompe la cache del CDN de
   *  Google (el primer upload viajo con cache publica de 24 h). */
  vAssets?: number
  /** 'es' = el plano ya viene en espanol: se oculta el toggle DE/ES. */
  idioma?: 'es'
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
  {
    slug: 'gea-50520184',
    maquina: 'GEA PowerPak (serial 50520184)',
    numero: '50520184',
    revision: '—',
    aplicaA: 'Termoformadora GEA V2 · serial 50520184',
    hojas: 146,
    faltantes: [],
    modo: 'visor',
    enStorage: true,
    vAssets: 2,
    descripcion:
      'Diagrama electrico oficial, ya en espanol. Modo visor: el PDF trae el texto ' +
      'en contornos, asi que hay navegacion y notas por hoja, sin zonas clicables.',
  },
  {
    slug: 'gea-50540108',
    maquina: 'GEA PowerPak (serial 50540108)',
    numero: '50540108',
    revision: '—',
    aplicaA: 'Termoformadora GEA V2 · serial 50540108',
    hojas: 94,
    faltantes: [],
    modo: 'visor',
    enStorage: true,
    vAssets: 2,
    descripcion:
      'Diagrama electrico oficial, ya en espanol. Modo visor: el PDF trae el texto ' +
      'en contornos, asi que hay navegacion y notas por hoja, sin zonas clicables.',
  },
  {
    slug: 'baader-142-860',
    maquina: 'BAADER 142 (antiguas)',
    numero: '142.70.00.860',
    revision: '14.09.05',
    aplicaA: 'Candidato para las 142 antiguas — FALTA confirmar contra la placa (Wiring Diagr.)',
    hojas: 31,
    faltantes: [],
    descripcion:
      'El plano de la generacion anterior (protecciones F1-F5, sin PLC). Ojo: hay 3 ' +
      'candidatos para las viejas (851/860/866); este es el que la curaduria del equipo ' +
      'rotulo como "Baader 142 antigua". Confirmar en terreno con la placa.',
  },
  {
    slug: 'gea-neum-50520184',
    maquina: 'GEA PowerPak (serial 50520184) · NEUMÁTICO',
    numero: '50520184-N',
    revision: '—',
    aplicaA: 'Termoformadora GEA V2 · serial 50520184',
    hojas: 64,
    faltantes: [],
    enStorage: true,
    idioma: 'es',
    descripcion:
      'Diagrama neumatico oficial en espanol, con texto real: el buscador encuentra ' +
      'valvulas, cilindros y bombas por nombre.',
  },
  {
    slug: 'gea-neum-50540108',
    maquina: 'GEA PowerPak (serial 50540108) · NEUMÁTICO',
    numero: '50540108-N',
    revision: '—',
    aplicaA: 'Termoformadora GEA V2 · serial 50540108',
    hojas: 38,
    faltantes: [],
    enStorage: true,
    idioma: 'es',
    descripcion:
      'Diagrama neumatico oficial en espanol, con texto real: el buscador encuentra ' +
      'valvulas, cilindros y bombas por nombre.',
  },
  {
    slug: 'baader-142-despiece',
    maquina: 'BAADER 142 · PLANO DE PARTES',
    numero: '142.00.00.821',
    revision: 'Ed. 10/2006',
    aplicaA: 'Ambas generaciones (figuras del catalogo 2006; posiciones identicas al catalogo 2014)',
    hojas: 254,
    faltantes: [],
    modo: 'despiece',
    enStorage: true,
    vAssets: 1,
    idioma: 'es',
    descripcion:
      'El catalogo de piezas de fabrica: cada figura lista las posiciones con su nombre y su ' +
      'codigo de repuesto. Cruzado con los planos electricos 888/860: toca un aparato y salta ' +
      'a su ficha aca, o busca el codigo y ve en que figura va.',
  },
  {
    slug: 'baader-200-508',
    maquina: 'BAADER 200 · plano de planta',
    numero: 'AquaChile 508',
    revision: '—',
    aplicaA: 'La B200 de ESTA planta: plano dibujado en AquaChile, con los reles reales',
    hojas: 18,
    faltantes: [],
    idioma: 'es',
    descripcion:
      'El as-built local en espanol: listas de reles (-RL33 POSICION ZERO...), ' +
      'tableros y partidas tal como estan cableados aca. Busqueda por texto completo.',
  },
]

export function planoPorSlug(slug: string | undefined) {
  return PLANOS.find((p) => p.slug === slug)
}

/** Ruta pública de un asset del plano (índice, hoja SVG o sus zonas). */
export function assetPlano(slug: string, archivo: string) {
  const p = PLANOS.find((x) => x.slug === slug)
  if (p?.enStorage) {
    return `${STORAGE_BASE}${encodeURIComponent(`planos/${slug}/${archivo}`)}?alt=media&v=${p.vAssets ?? 1}`
  }
  return `${import.meta.env.BASE_URL}planos/${slug}/${archivo}`
}
