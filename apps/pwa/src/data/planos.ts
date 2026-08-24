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

/** La máquina física. El catálogo se agrupa por esto. */
export type EquipoId = 'baader-142' | 'baader-200' | 'gea-50520184' | 'gea-50540108'

export type Equipo = {
  id: EquipoId
  /** Nombre corto tal como lo dice la planta: 'BAADER 142'. */
  nombre: string
  /** Qué hace. Es el eyebrow del grupo: 'Evisceradora'. */
  funcion: string
  /** Solo GEA: distingue las dos máquinas iguales. El prefijo que comparten
   *  con su hermana ('505') se atenúa al pintarlo. */
  serie?: string
  orden: number
}

export const EQUIPOS: Equipo[] = [
  { id: 'baader-142', nombre: 'BAADER 142', funcion: 'Evisceradora', orden: 1 },
  { id: 'baader-200', nombre: 'BAADER 200', funcion: 'Fileteadora', orden: 2 },
  { id: 'gea-50520184', nombre: 'GEA PowerPak', funcion: 'Termoformadora', serie: '50520184', orden: 3 },
  { id: 'gea-50540108', nombre: 'GEA PowerPak', funcion: 'Termoformadora', serie: '50540108', orden: 4 },
]

/** Qué ES el documento. NO se deriva de `modo`: `modo:'visor'` es una
 *  capacidad del visor (sin zonas clicables), no una categoría — el
 *  neumático GEA no tiene `modo` y el as-built 508 tampoco. */
export type TipoPlano = 'electrico' | 'neumatico' | 'partes' | 'planta'

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

  /** La máquina física a la que pertenece. El catálogo se agrupa por esto. */
  equipo: EquipoId
  tipo: TipoPlano
  /** Qué generación/versión cubre, en 2-3 palabras: 'las nuevas', 'las
   *  antiguas'. Se muestra en el título de la fila del catálogo. */
  variante?: string
  /** 254 FIGURAS no son 254 hojas: el despiece se cuenta distinto. */
  unidad?: 'hojas' | 'figuras'
  /** ≤ 30 caracteres, va en la línea mono junto al número. Ej: 'español',
   *  '4.069 posiciones', '2022'. */
  detalle?: string
  /** La advertencia de seguridad, como DATO y no como prosa dentro de
   *  `aplicaA`. Decide si la fila lleva franja ámbar o nota verde. */
  verificacion?: {
    estado: 'confirmado' | 'por_confirmar'
    /** Instrucción, no disculpa: qué mirar para resolverlo. */
    nota: string
  }
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
    equipo: 'baader-142',
    tipo: 'electrico',
    variante: 'las nuevas',
    unidad: 'hojas',
    detalle: '2022',
    verificacion: { estado: 'confirmado', nota: 'la placa dice 1427100888' },
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
    equipo: 'baader-200',
    tipo: 'electrico',
    unidad: 'hojas',
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
    equipo: 'gea-50520184',
    tipo: 'electrico',
    unidad: 'hojas',
    detalle: 'español',
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
    equipo: 'gea-50540108',
    tipo: 'electrico',
    unidad: 'hojas',
    detalle: 'español',
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
    equipo: 'baader-142',
    tipo: 'electrico',
    variante: 'las antiguas',
    unidad: 'hojas',
    verificacion: { estado: 'por_confirmar', nota: 'mirá el campo Wiring Diagr. de la placa' },
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
    equipo: 'gea-50520184',
    tipo: 'neumatico',
    unidad: 'hojas',
    detalle: 'válvulas por nombre',
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
    equipo: 'gea-50540108',
    tipo: 'neumatico',
    unidad: 'hojas',
    detalle: 'válvulas por nombre',
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
    vAssets: 8,
    idioma: 'es',
    descripcion:
      'El catalogo de piezas de fabrica: cada figura lista las posiciones con su nombre y su ' +
      'codigo de repuesto. Cruzado con los planos electricos 888/860: toca un aparato y salta ' +
      'a su ficha aca, o busca el codigo y ve en que figura va.',
    equipo: 'baader-142',
    tipo: 'partes',
    unidad: 'figuras',
  },
  {
    slug: 'baader-200-despiece',
    maquina: 'BAADER 200 · PLANO DE PARTES',
    numero: 'Catálogo de piezas BAADER 200',
    revision: '—',
    aplicaA: 'BAADER 200 (fileteadora)',
    hojas: 201,
    faltantes: [],
    modo: 'despiece',
    enStorage: true,
    vAssets: 5,
    idioma: 'es',
    descripcion:
      'El catalogo de piezas de la fileteadora: 201 figuras explotadas con 4.069 posiciones ' +
      'y su codigo de repuesto. Mismo visor que el de la 142; las posiciones se eligen desde ' +
      'la tabla de cada figura.',
    equipo: 'baader-200',
    tipo: 'partes',
    unidad: 'figuras',
    detalle: '4.069 posiciones',
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
    equipo: 'baader-200',
    tipo: 'planta',
    variante: 'as-built',
    unidad: 'hojas',
  },
]

/** Orden dentro de cada equipo: eléctrico → neumático → planta → partes. */
const ORDEN_TIPO: Record<TipoPlano, number> = { electrico: 0, neumatico: 1, planta: 2, partes: 3 }

/** Único lugar donde se arma la agrupación del catálogo. */
export function planosPorEquipo(): { equipo: Equipo; planos: PlanoCatalogo[] }[] {
  return [...EQUIPOS]
    .sort((a, b) => a.orden - b.orden)
    .map((equipo) => ({
      equipo,
      planos: PLANOS
        .filter((p) => p.equipo === equipo.id)
        .sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]),
    }))
}

export function planoPorSlug(slug: string | undefined) {
  return PLANOS.find((p) => p.slug === slug)
}

/** Ruta pública de un asset del plano (índice, hoja SVG o sus zonas). */
export function assetPlano(slug: string, archivo: string) {
  return assetPlanoAlternativas(slug, archivo)[0]!
}

/**
 * Las rutas donde puede estar un asset, EN ORDEN de preferencia.
 *
 * Firebase Storage solo autoriza el origin de producción: desde `localhost`
 * toda lectura muere por CORS. Antes había que alternar `enStorage` a mano
 * para desarrollar y volver a ponerlo — con el riesgo real de commitear el
 * flag equivocado y tumbar producción. Ahora, en desarrollo se intenta
 * primero la copia local (`public/planos/`) y Storage queda de respaldo; el
 * fetch prueba las alternativas en orden y usa la primera que responde.
 */
export function assetPlanoAlternativas(slug: string, archivo: string): string[] {
  const p = PLANOS.find((x) => x.slug === slug)
  const local = `${import.meta.env.BASE_URL}planos/${slug}/${archivo}`
  const storage = `${STORAGE_BASE}${encodeURIComponent(`planos/${slug}/${archivo}`)}?alt=media&v=${p?.vAssets ?? 1}`
  if (!p?.enStorage) return [local]
  return import.meta.env.DEV ? [local, storage] : [storage]
}
