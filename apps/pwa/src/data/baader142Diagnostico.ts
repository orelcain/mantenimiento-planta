/**
 * Diagnóstico · Tarjeta A3C · BAADER 142 — los DATOS del modo «código de falla primero».
 *
 * Regla: solo lo que dicen el manual 2005 (1420000804) y el plano 142.71.00.888. Las páginas
 * son las del PDF del manual (igual que en la ficha de la herramienta), no las impresas.
 *   p. 4–5   indicaciones de seguridad          p. 41–42  tabla de fallos E 7xx / E 8xx / E 9xx
 *   p. 32    §12.8 ajuste de topes de los SM     p. 45     protocolo (∑E821 = CENTERING SM1…)
 *   p. 47    marcha de prueba 13                 p. 66     disposición de elementos eléctricos
 *   p. 86    §22.4.3 extractor (Upgrade Kit)     p. 87     §22.4.4 herramientas vigiladas
 *
 * Bornes, LED, estado en la foto de la N2 y hojas del plano NO se copian aquí: cada paso nombra
 * su elemento por clave (`B3`, `B15`…) y la herramienta los lee de `a3c-datos.json` al mostrarlo.
 * Lo que el manual no dice va como «el manual no indica» + una pregunta para terreno.
 */

/** Cita corta, siempre con página o con hoja del plano. */
export type Fuente = string

/** Motor paso a paso de una herramienta (manual p. 32, 41 y 66; plano hoja 23). */
export interface MotorSm {
  sm: 'SM1' | 'SM2' | 'SM3' | 'SM4' | 'SM5'
  herramienta: string
  /** Interruptor de aproximación inductivo de la posición CERO (manual p. 66). */
  cero: string
  /** Transmisor de valor de rotación, solo con Upgrade Kit (manual p. 41). */
  encoder: string
}

/** Por número de SM. Nombres de herramienta tal como los usa el manual (p. 32). */
export const MOTORES: Record<1 | 2 | 3 | 4 | 5, MotorSm> = {
  1: { sm: 'SM1', herramienta: 'Centraje', cero: 'B1', encoder: 'B21' },
  2: { sm: 'SM2', herramienta: 'Cuchilla hendedora', cero: 'B2', encoder: 'B22' },
  3: { sm: 'SM3', herramienta: 'Aspirador', cero: 'B3', encoder: 'B23' },
  4: { sm: 'SM4', herramienta: 'Excavador A', cero: 'B4', encoder: 'B24' },
  5: { sm: 'SM5', herramienta: 'Excavador B', cero: 'B5', encoder: 'B25' },
}

/** E 8NX: N = función del motor (0 a 6), con su texto literal del manual (p. 42). */
export const FAMILIAS_E8: Record<0 | 1 | 2 | 3 | 4 | 5 | 6, string> = {
  0: 'Motor paso a paso no encuentra su posición cero',
  1: 'Marcha de prueba de motores paso a paso defectuosa',
  2: 'Motor paso a paso no ha alcanzado su posición cero después de la última marcha durante la producción',
  3: 'Iniciador de ranura (interruptor de aproximación) en el motor paso a paso está defectuoso',
  4: 'Motor paso a paso no alcanza la posición tope mínima prevista',
  5: 'Motor paso a paso no alcanza la posición tope máxima prevista',
  6: 'Marcha desde la posición tope mínima hasta la posición cero incorrecta',
}

/**
 * Inconsistencia del manual en el dígito X de E 8NX (runbook de planta, «verificar en terreno»):
 * la tabla E 8NX (p. 41) dice X=1 cuchilla abridora y X=2 centraje; el protocolo (p. 45) dice
 * ∑E821 = CENTERING SM1 y ∑E822 = SLIT KNIFE SM2. Los dígitos 3, 4 y 5 coinciden. Con el dígito
 * 1 o 2 se muestran los DOS motores posibles: primero el del protocolo, luego el de la tabla.
 */
export function avisoDigito(x: 1 | 2): string {
  return (
    'Inconsistencia del manual · verificar en terreno. ' +
    `La tabla E 8NX (p. 41) dice que el dígito ${x} es ${x === 1 ? 'cuchilla abridora' : 'centraje'}; ` +
    `el protocolo (p. 45) dice ${x === 1 ? 'centraje SM1' : 'cuchilla abridora SM2'}. ` +
    'Confirmar con selector 5 en posición 5 y pulsador I.'
  )
}

export const NOTA_DIGITOS_COINCIDEN = 'Los dígitos 3, 4 y 5 coinciden en las dos tablas del manual (p. 41 y p. 45).'

/** Aviso de seguridad: se muestra antes de dejar marcar cualquier paso. */
export const SEGURIDAD: { texto: string; fuente: Fuente }[] = [
  {
    texto: 'Desconectar la máquina, poner el interruptor principal en posición 0 y asegurarlo al producirse fallos en el funcionamiento y antes de trabajos de mantenimiento.',
    fuente: 'Manual 2005, p. 5',
  },
  {
    texto: 'Prohibido rociar con spray de cualquier clase las cajas de distribución o los aparatos eléctricos: existe peligro de explosión.',
    fuente: 'Manual 2005, p. 5',
  },
  { texto: 'Riesgo de vida en la zona de las instalaciones eléctricas no aseguradas.', fuente: 'Manual 2005, p. 4' },
]

/** §12.8 Ajuste de los topes de motor paso a paso (manual p. 32). */
export const AJUSTE_TOPES = {
  cero: 'Ajustar la distancia de 0,8 mm entre el interruptor de aproximación y la polea de correa dentada.',
  min: 'Con el SM en MIN: ajustar 0,5–1 mm entre el tornillo de tope de enfrente y el tope.',
  max: 'Con el SM en MAX: apretar el tornillo de tope contra el tope; 2 mm entre el tornillo de tope y la tuerca hexagonal (unos 17 mm entre la palanca de sujeción y el tornillo de tope).',
  todo: 'Repetir el ajuste completo de topes: 0,8 mm al interruptor de aproximación, y CERO, MAX y MIN con el selector 5 en posición 5 y el pulsador I. Orden: SM3, SM2, SM1, SM4, SM5.',
  fuente: 'Manual 2005, p. 32',
} as const

export type TipoPaso = 'elemento' | 'ajuste' | 'info'

export interface PasoDiag {
  tipo: TipoPaso
  titulo: string
  porque: string
  fuente: Fuente
  /** Clave del elemento en `a3c-datos.json` (solo `tipo: 'elemento'`). */
  elemento?: string
  /** El manual no liga este elemento al código con certeza: «Verificar en terreno». */
  verificar?: boolean
}

export interface NoIndica {
  texto: string
  pregunta: string
}

export interface Diagnostico {
  codigo: number
  /** «E 803». */
  etiqueta: string
  titulo: string
  fuente: Fuente
  modulo: string
  aviso: string | null
  /** Lo que el manual manda hacer (sin pasos que marcar). */
  accion: string | null
  pasos: PasoDiag[]
  noIndica: NoIndica[]
  /** Motores relacionados (encoder y LED de estado: se nombran, no se encienden). */
  motores: MotorSm[]
}

/** Códigos fuera de E 8NX, con su texto del manual (p. 41–42). */
export const CODIGOS_SUELTOS = {
  826: { titulo: 'Accionamiento bloquea durante la producción', fuente: 'Manual 2005, p. 42', modulo: 'SM6 · Accionamiento' },
  827: {
    titulo: 'Extractor de pescados no se encuentra en la posición básica o el interruptor de aproximación está defectuoso',
    fuente: 'Manual 2005, p. 42',
    modulo: 'Extractor',
  },
  770: { titulo: 'La tarjeta del contador de valor de rotación está defectuosa', fuente: 'Manual 2005, p. 41 · solo con Upgrade Kit', modulo: 'Upgrade Kit' },
  777: { titulo: 'Pescado en la entrada', fuente: 'Manual 2005, p. 41', modulo: 'Entrada' },
  900: { titulo: 'Fallo en la placa de la unidad de control o unidad de control colgada', fuente: 'Manual 2005, p. 42', modulo: 'Unidad de control' },
} as const

/** Lista agrupada de códigos (columna de entrada y atajos del teléfono). */
export const GRUPOS_CODIGOS: { desde: number; hasta: number; etiqueta: string; texto: string }[] = [
  { desde: 801, hasta: 805, etiqueta: 'E 801–805', texto: 'No encuentra su posición cero' },
  { desde: 811, hasta: 815, etiqueta: 'E 811–815', texto: 'Marcha de prueba defectuosa' },
  { desde: 821, hasta: 825, etiqueta: 'E 821–825', texto: 'No alcanzó su cero en producción' },
  { desde: 826, hasta: 826, etiqueta: 'E 826', texto: 'Accionamiento bloquea' },
  { desde: 827, hasta: 827, etiqueta: 'E 827', texto: 'Extractor fuera de posición básica' },
  { desde: 831, hasta: 835, etiqueta: 'E 831–835', texto: 'Iniciador de ranura defectuoso' },
  { desde: 841, hasta: 845, etiqueta: 'E 841–845', texto: 'No alcanza el tope mínimo' },
  { desde: 851, hasta: 855, etiqueta: 'E 851–855', texto: 'No alcanza el tope máximo' },
  { desde: 861, hasta: 865, etiqueta: 'E 861–865', texto: 'Marcha de tope mínimo a cero incorrecta' },
  { desde: 770, hasta: 777, etiqueta: 'E 770–777', texto: 'Upgrade Kit y entrada' },
  { desde: 900, hasta: 999, etiqueta: 'E 900–999', texto: 'Unidad de control' },
]

/** Módulos de la máquina (pestaña «Módulo»). Elementos por clave de `a3c-datos.json`. */
export interface ModuloDiag {
  id: string
  nombre: string
  detalle: string
  elementos: string[]
  /** SM1/SM2: el código depende de la tabla que se crea (dígitos 1 y 2). */
  digitoEnDuda?: 1 | 2
  /** Número de SM (1–5) para listar sus E 8NX y E 77X. */
  sm?: 1 | 2 | 3 | 4 | 5
  codigos?: number[]
  sinCodigo?: string
}

export const MODULOS: ModuloDiag[] = [
  { id: 'sm1', nombre: 'Centraje', detalle: 'SM1 · B1, B21', elementos: ['B1', 'B21', 'SM1'], sm: 1, digitoEnDuda: 1 },
  { id: 'sm2', nombre: 'Cuchilla hendedora', detalle: 'SM2 · B2, B22', elementos: ['B2', 'B22', 'SM2'], sm: 2, digitoEnDuda: 2 },
  { id: 'sm3', nombre: 'Aspirador', detalle: 'SM3 · B3, B23', elementos: ['B3', 'B23', 'SM3'], sm: 3 },
  { id: 'sm4', nombre: 'Excavador A', detalle: 'SM4 · B4, B24', elementos: ['B4', 'B24', 'SM4'], sm: 4 },
  { id: 'sm5', nombre: 'Excavador B', detalle: 'SM5 · B5, B25', elementos: ['B5', 'B25', 'SM5'], sm: 5 },
  { id: 'sm6', nombre: 'Accionamiento', detalle: 'SM6 · B6', elementos: ['B6', 'SM6'], codigos: [826] },
  { id: 'extractor', nombre: 'Extractor', detalle: 'B15, B14 · Y8, Y9', elementos: ['B15', 'B14', 'Y8', 'Y9'], codigos: [827] },
  {
    id: 'palpador',
    nombre: 'Palpador',
    detalle: 'B11',
    elementos: ['B11'],
    sinCodigo: 'Ningún código de la tabla de fallos del manual (p. 41–42) nombra el palpador.',
  },
]

/** Lo que el manual no responde: preguntas para terreno (se muestran junto al código o módulo). */
export const PREGUNTAS_TERRENO: string[] = [
  'E 8N1 y E 8N2: ¿el dígito 1 es centraje (protocolo, p. 45) o cuchilla abridora (tabla, p. 41)? Probar con selector 5 en posición 5 y pulsador I.',
  'E 831–835 «iniciador de ranura»: ¿es el mismo sensor B1–B5 que el plano rotula Nullposition, u otro? El manual no los cruza.',
  'E 827: el manual dice «el interruptor de aproximación». ¿Es B15 (control extractor), B14 (carro delante extractor) o ambos?',
  '¿Qué tensión debe leerse en X5.42–47 con el metal frente al sensor y sin él? El manual no da valores de señal.',
  'E 811–815, E 821–825 y E 826: el manual da el significado (y para E 82x el reinicio con I), no qué revisar si se repite.',
  'LED 60V DC y Step de cada bloque SM: el plano no dice cuándo prende cada uno.',
  'La foto de la N2 es una foto sin proceso: ¿cuál es el estado normal de cada LED en reposo y en marcha?',
  '«El motor no se mueve» sin código en el display: el manual no trae procedimiento.',
  'Elementos sin descripción en manual ni plano (B30, B40, B41, B50, Y31–Y36): ¿qué son en la máquina?',
]
