/**
 * Formatea para PRESENTACIÓN los nombres de repuestos que llegan de SAP en
 * mayúsculas (campo "texto breve"). Solo cambia lo que se MUESTRA — el dato
 * crudo de SAP no se toca en ningún otro lugar del sistema.
 *
 * Reglas (ver spec de la tarea para el detalle completo):
 *   1. Vacío/null → nombre '' sin etiquetas.
 *   2. Prefijos entre paréntesis al inicio ("(NO USAR)", "(OBSOLETO)", ...)
 *      se extraen a `etiquetas` en formato oración; pueden venir varios,
 *      pegados o no.
 *   3. Comillas/apóstrofes sueltos al inicio del texto se quitan. Una
 *      comilla doble pegada a una letra en medio de palabra (ASS"Y) se
 *      convierte en apóstrofe (ass'y). Las pulgadas (3/8", 1") se conservan
 *      tal cual (quedan protegidas porque contienen un dígito).
 *   4. Solo `<número>'C` se convierte a `<número> °C` (grado Celsius mal
 *      tipeado con apóstrofe). Otras formas ("100°C", "100 C") no se tocan.
 *   5. El resto va en formato oración: todo minúscula, con la primera letra
 *      del nombre en mayúscula.
 *   6. Se protegen (quedan EXACTAMENTE como llegaron) los tokens que traen
 *      algún dígito, o que combinan '/' o '-' con letras a ambos lados
 *      (salvo las abreviaturas P/, C/, S/ de la regla 8).
 *   7. Unidades pegadas a un número se separan y van en minúscula según una
 *      tabla fija (30KG → 30 kg, 100W → 100 W, etc.).
 *   8. Abreviaturas con barra P/ (para), C/ (con), S/ (sin) van en minúscula
 *      completas: P/COMPRESOR → p/compresor.
 *   9. O'RING → O'ring. Palabras con punto (REP.) solo bajan de caja.
 *  10. Espacios múltiples se colapsan. Las tildes salen de un diccionario
 *      cerrado de vocabulario de planta (ACENTOS) y los nombres propios de
 *      lugares y fabricantes de otro (PROPIOS): lo que no está ahí baja de
 *      caja sin tilde, honesto antes que inventado.
 *
 * La función es idempotente: aplicarla sobre su propio resultado devuelve
 * el mismo `nombre` (las `etiquetas` sí pueden quedar vacías la segunda vez,
 * porque ya no hay prefijos entre paréntesis que extraer).
 */

export interface NombreFormateado {
  nombre: string
  etiquetas: string[]
}

/** Unidades reconocidas cuando aparecen pegadas a un número o como token propio. */
const UNIT_MAP: Record<string, string> = {
  W: 'W',
  V: 'V',
  A: 'A',
  HZ: 'Hz',
  KW: 'kW',
  MM: 'mm',
  CM: 'cm',
  M: 'm',
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'mL',
  BAR: 'bar',
  PSI: 'psi',
  RPM: 'rpm',
  HP: 'HP',
}

/** Marcas de la lista que en el mundo real se escriben con inicial mayúscula. */
const BRAND_TITLE_CASE = new Set([
  'VITON',
  'FESTO',
  'SIEMENS',
  'DANFOSS',
  'BAADER',
  'MAREL',
  'KOHLER',
  'YAMAHA',
])

/**
 * Nombres propios que SAP entrega en mayúsculas: lugares de la empresa y
 * fabricantes que no están en la lista de marcas. Clave sin tilde (como llega),
 * valor como se escribe. Solo se aplica al token completo.
 */
const PROPIOS: Record<string, string> = {
  CHONCHI: 'Chonchi', YAL: 'Yal', CASTRO: 'Castro', QUELLON: 'Quellón', DALCAHUE: 'Dalcahue',
  CHILOE: 'Chiloé', ANCUD: 'Ancud', CALBUCO: 'Calbuco', MONTT: 'Montt', AQUACHILE: 'AquaChile',
  MARELEC: 'Marelec', KNURO: 'Knuro', FISHKEN: 'Fishken', JOSMAR: 'Josmar', CARSOE: 'Carsoe',
  CABINPLANT: 'Cabinplant', BITZER: 'Bitzer', MYCOM: 'Mycom', SABROE: 'Sabroe', GRUNDFOS: 'Grundfos',
  WILO: 'Wilo', SCHNEIDER: 'Schneider', ROCKWELL: 'Rockwell', OMRON: 'Omron', ATLAS: 'Atlas',
  COPCO: 'Copco', SANDVIK: 'Sandvik', ZEBRA: 'Zebra', HONEYWELL: 'Honeywell', ENDRESS: 'Endress',
  HAUSER: 'Hauser', PEPPERL: 'Pepperl', FUCHS: 'Fuchs', BOSCH: 'Bosch', REXROTH: 'Rexroth',
  PARKER: 'Parker', NORGREN: 'Norgren', LENZE: 'Lenze', NORD: 'Nord', SEW: 'SEW', BONFIGLIOLI: 'Bonfiglioli',
}

/**
 * Vocabulario de planta con tilde. SAP llega sin tildes; sin esta tabla «VACIO»
 * salía «vacio». Clave sin tilde, valor en minúscula con tilde (la primera letra
 * del nombre se sube al final). Solo tokens completos, sin dígitos.
 */
const ACENTOS: Record<string, string> = {
  VACIO: 'vacío', LIQUIDO: 'líquido', LIQUIDOS: 'líquidos', SEPARACION: 'separación', ESTACION: 'estación',
  SUBESTACION: 'subestación', MANTENCION: 'mantención', DECLORACION: 'decloración', ECUALIZACION: 'ecualización',
  EQUALIZACION: 'ecualización', FRIGORIFICO: 'frigorífico', ANTECAMARA: 'antecámara', CAMARA: 'cámara',
  CAMARAS: 'cámaras', MAQUINA: 'máquina', MAQUINAS: 'máquinas', TUNEL: 'túnel', TUNELES: 'túneles',
  AUTOMATICO: 'automático', AUTOMATICA: 'automática', ADUCCION: 'aducción', DINAMICA: 'dinámica',
  DINAMICO: 'dinámico', POLIMERO: 'polímero', ELECTRICO: 'eléctrico', ELECTRICA: 'eléctrica',
  ELECTRICOS: 'eléctricos', HIDRAULICO: 'hidráulico', HIDRAULICA: 'hidráulica', NEUMATICO: 'neumático',
  NEUMATICA: 'neumática', VALVULA: 'válvula', VALVULAS: 'válvulas', TERMICO: 'térmico', TERMICA: 'térmica',
  COMPRESION: 'compresión', PRESION: 'presión', REFRIGERACION: 'refrigeración', VENTILACION: 'ventilación',
  ILUMINACION: 'iluminación', MECANICO: 'mecánico', MECANICA: 'mecánica', BATERIA: 'batería',
  BATERIAS: 'baterías', CALEFACCION: 'calefacción', MEDICION: 'medición', PRODUCCION: 'producción',
  HIGIENIZACION: 'higienización', AGITACION: 'agitación', DOSIFICACION: 'dosificación',
  CIRCULACION: 'circulación', RECIRCULACION: 'recirculación', ANDEN: 'andén', CAMION: 'camión',
  LAMINA: 'lámina', OXIGENO: 'oxígeno', NITROGENO: 'nitrógeno', CALIBRACION: 'calibración',
  INSPECCION: 'inspección', SECCION: 'sección', LINEA: 'línea', LINEAS: 'líneas', AREA: 'área',
  AREAS: 'áreas', CATEGORIA: 'categoría', BASICO: 'básico', QUIMICO: 'químico', QUIMICA: 'química',
  ELECTRONICO: 'electrónico', ELECTRONICA: 'electrónica', PLASTICO: 'plástico', PLASTICA: 'plástica',
  CERAMICO: 'cerámico', ESTATICO: 'estático', ESTATICA: 'estática', DESCRIPCION: 'descripción',
  CODIGO: 'código', RAPIDO: 'rápido', RAPIDA: 'rápida', UNION: 'unión', CONEXION: 'conexión',
  SUCCION: 'succión', EXTRACCION: 'extracción', ELEVACION: 'elevación', INYECCION: 'inyección',
  PROTECCION: 'protección', DIRECCION: 'dirección', LUBRICACION: 'lubricación', TENSION: 'tensión',
  TRANSMISION: 'transmisión', ROTACION: 'rotación', FIJACION: 'fijación', SUJECION: 'sujeción',
  ALIMENTACION: 'alimentación', EVACUACION: 'evacuación', DISTRIBUCION: 'distribución',
  GENERACION: 'generación', REGULACION: 'regulación', AISLACION: 'aislación', REPARACION: 'reparación',
  INSTALACION: 'instalación', OPERACION: 'operación', VISCOSIDAD: 'viscosidad', TERMOSTATICO: 'termostático',
  TERMOSTATICA: 'termostática', MAGNETICO: 'magnético', MAGNETICA: 'magnética', CILINDRICO: 'cilíndrico',
  CILINDRICA: 'cilíndrica', CONICO: 'cónico', CONICA: 'cónica', RIGIDO: 'rígido', RIGIDA: 'rígida',
  ESTANDAR: 'estándar', ESFERICO: 'esférico', ESFERICA: 'esférica', ELASTICO: 'elástico', ELASTICA: 'elástica',
  MULTIPLE: 'múltiple', PANTALON: 'pantalón', TAPON: 'tapón', TAPONES: 'tapones', BOTON: 'botón',
  BOTONES: 'botones', PISTON: 'pistón', PISTONES: 'pistones', EMBOLO: 'émbolo', ROTULA: 'rótula',
  ANGULO: 'ángulo', PLASMA: 'plasma', HELICE: 'hélice', TERMINO: 'término', ACIDO: 'ácido',
  OFICINA: 'oficina', SANITARIO: 'sanitario', AGUA: 'agua', AGUAS: 'aguas',
}

/** Siglas/marcas que se protegen (quedan en mayúscula, salvo BRAND_TITLE_CASE). */
const ACRONYMS = new Set([
  'PTC',
  'SAP',
  'DAF',
  'RILES',
  'CCM',
  'UPS',
  'NFPA',
  'IQF',
  'CIP',
  'OT',
  'PPM',
  'TDS',
  'ORP',
  'CH',
  'MYPRO',
  'NTC',
  'PLC',
  'HMI',
  'VFD',
  'IP',
  'DN',
  'PN',
  'NPT',
  'BSP',
  'DIN',
  'ISO',
  'SAE',
  'ANSI',
  'AISI',
  'NBR',
  'EPDM',
  'PTFE',
  'PVC',
  'PU',
  'INOX',
  'LED',
  'AC',
  'DC',
  'VAC',
  'VDC',
  'SKF',
  'FAG',
  'NSK',
  'SMC',
  'ABB',
  'GEA',
  'MYPRO',
  ...BRAND_TITLE_CASE,
])

function toTitleWord(word: string): string {
  const lower = word.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Casing canónico de un token que ya sabemos que es una sigla/marca de la lista. */
function acronymCase(word: string): string {
  const upper = word.toUpperCase()
  return BRAND_TITLE_CASE.has(upper) ? toTitleWord(upper) : upper
}

function toSentenceCase(text: string): string {
  const lower = text.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Separa la puntuación final (.,;:) de un token para poder evaluar el "core". */
function splitTrailingPunct(token: string): { core: string; trailing: string } {
  const match = token.match(/[.,;:]+$/)
  if (!match) return { core: token, trailing: '' }
  const trailing = match[0]
  return { core: token.slice(0, -trailing.length), trailing }
}

const DEGREE_RE = /^(\d+)'C([.,;:]*)$/i
const DEGREE_NORMALIZED_RE = /^°C([.,;:]*)$/i
const QUOTE_BETWEEN_LETTERS_RE = /[A-Za-zÀ-ÿ]"[A-Za-zÀ-ÿ]/
const P_C_S_PREFIX_RE = /^[PCS]\/[A-Za-zÀ-ÿ]+$/i
const NUMBER_UNIT_ATTACHED_RE = /^(-?\d[\d/.,]*)([A-Za-z]+)([.,;:]*)$/

/** Procesa un único token (palabra separada por espacios) del texto ya sin
 * prefijos entre paréntesis ni comillas iniciales. */
function processToken(token: string): string {
  // Regla 4: <número>'C -> <número> °C
  const degreeMatch = token.match(DEGREE_RE)
  if (degreeMatch) {
    return `${degreeMatch[1]} °C${degreeMatch[2]}`
  }

  // Idempotencia: si ya quedó como "°C" (de una pasada anterior), no tocar la C.
  const degreeNormalizedMatch = token.match(DEGREE_NORMALIZED_RE)
  if (degreeNormalizedMatch) {
    return `°C${degreeNormalizedMatch[1]}`
  }

  // Regla 9: O'RING -> O'ring (respeta puntuación final pegada).
  {
    const { core, trailing } = splitTrailingPunct(token)
    if (core.toUpperCase() === "O'RING") {
      return `O'ring${trailing}`
    }
  }

  // Regla 3: comilla doble pegada a una letra en medio de palabra -> apóstrofe.
  if (QUOTE_BETWEEN_LETTERS_RE.test(token)) {
    const fixed = token.replace(/(?<=[A-Za-zÀ-ÿ])"(?=[A-Za-zÀ-ÿ])/g, "'")
    return fixed.toLowerCase()
  }

  // Regla 8: P/, C/, S/ -> minúscula completa (con tilde si la palabra la lleva).
  if (P_C_S_PREFIX_RE.test(token)) {
    const [pref, word = ''] = token.split('/')
    return `${(pref ?? '').toLowerCase()}/${ACENTOS[word.toUpperCase()] ?? word.toLowerCase()}`
  }

  // Regla 7: número pegado a una unidad -> separar y aplicar casing de tabla.
  const attachedMatch = token.match(NUMBER_UNIT_ATTACHED_RE)
  if (attachedMatch) {
    const digits = attachedMatch[1] ?? ''
    const letters = attachedMatch[2] ?? ''
    const trailing = attachedMatch[3] ?? ''
    const upperLetters = letters.toUpperCase()
    if (UNIT_MAP[upperLetters]) {
      return `${digits} ${UNIT_MAP[upperLetters]}${trailing}`
    }
    if (ACRONYMS.has(upperLetters)) {
      return `${digits} ${acronymCase(letters)}${trailing}`
    }
    // Sigue teniendo un dígito: cae a la protección genérica más abajo.
  }

  // Regla 6/7: token completo = unidad, sigla/marca, nombre propio o palabra con
  // tilde (sin número pegado). Admite un paréntesis de apertura: «(DAF)».
  {
    const m = token.match(/^(\(?)([A-Za-zÀ-ÿ]+)([).,;:]*)$/)
    const lead = m?.[1] ?? ''
    const core = m?.[2] ?? ''
    const trailing = m?.[3] ?? ''
    if (m) {
      const upperCore = core.toUpperCase()
      if (UNIT_MAP[upperCore]) {
        return `${lead}${UNIT_MAP[upperCore]}${trailing}`
      }
      if (ACRONYMS.has(upperCore)) {
        return `${lead}${acronymCase(core)}${trailing}`
      }
      if (PROPIOS[upperCore]) {
        return `${lead}${PROPIOS[upperCore]}${trailing}`
      }
      if (ACENTOS[upperCore]) {
        return `${lead}${ACENTOS[upperCore]}${trailing}`
      }
    }
  }

  // Regla 6: cualquier token con un dígito queda protegido tal cual llegó.
  if (/\d/.test(token)) {
    return token
  }

  // Regla 6: '/' o '-' con letras a ambos lados queda protegido tal cual.
  if (token.includes('/') || token.includes('-')) {
    const segments = token.split(/[/-]/)
    if (segments.length > 1 && segments.every((seg) => seg.length > 0 && /[A-Za-zÀ-ÿ]/.test(seg))) {
      return token
    }
  }

  // Comilla o apóstrofe sin patrón reconocido (ej. "P'" en medio del texto):
  // se deja tal cual, no hay regla que sepa qué hacer con ella.
  if (/['"]/.test(token)) {
    return token
  }

  // Regla 5: formato oración por defecto.
  return token.toLowerCase()
}

export function formatNombreSAP(textoBreve: string | null | undefined): NombreFormateado {
  if (!textoBreve || !textoBreve.trim()) {
    return { nombre: '', etiquetas: [] }
  }

  let text = textoBreve.trim()
  const etiquetas: string[] = []

  // Regla 2: prefijos entre paréntesis al inicio (pueden venir varios, pegados o no).
  let tagMatch: RegExpMatchArray | null
  while ((tagMatch = text.match(/^\(([^)]*)\)\s*/))) {
    const tagContent = (tagMatch[1] ?? '').trim()
    // Solo es etiqueta un marcador corto y sin dígitos: «(NO USAR)», «(OBSOLETO)».
    // Un paréntesis largo o con números — «(SIN DESCRIPCIÓN — CÓD. SAP 12910556)» —
    // ES el nombre (un marcador de posición de SAP), y convertirlo en etiqueta dejaba
    // la fila sin nombre en Bodega.
    if (/\d/.test(tagContent) || tagContent.split(/\s+/).length > 3) break
    if (tagContent) etiquetas.push(toSentenceCase(tagContent))
    text = text.slice(tagMatch[0].length)
  }
  text = text.trimStart()
  // Si TODO el texto era un paréntesis (marcador de posición), se muestra sin los paréntesis.
  const soloParentesis = text.match(/^\((.*)\)$/)
  if (soloParentesis?.[1]) text = soloParentesis[1].trim()

  // Regla 3: comillas/apóstrofes sueltos al inicio del texto restante.
  text = text.replace(/^['"`]+\s*/, '')

  text = text.replace(/\s+/g, ' ').trim()

  if (!text) {
    return { nombre: '', etiquetas }
  }

  const tokens = text.split(/\s+/).filter(Boolean)
  const outTokens = tokens.map(processToken)

  let nombre = outTokens.join(' ').replace(/\s+/g, ' ').trim()
  if (nombre) {
    nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1)
  }

  return { nombre, etiquetas }
}
