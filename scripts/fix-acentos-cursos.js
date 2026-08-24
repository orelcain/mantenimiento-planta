#!/usr/bin/env node
/**
 * Restaura tildes y eñes en los 4 cursos del Programa de Electricidad.
 *
 * POR QUÉ
 * -------
 * Los cursos `seguridad-electrica`, `rescate-svb`, `nfpa-70b` y
 * `codigo-electrico-nec` se sembraron en ASCII puro: 261 de sus 262 documentos
 * no tenían un solo carácter acentuado. El Centro de Aprendizaje es público y
 * es el material de capacitación de la empresa; ahí decía "peligros
 * electricos", "rafaga de arco", "cada 3 anos".
 *
 * CÓMO
 * ----
 * NO es un regex genérico. El mapa se armó revisando el vocabulario COMPLETO
 * del corpus (2.457 palabras distintas sin acento) una por una, y las
 * ambiguas se resolvieron mirando TODAS sus ocurrencias en contexto:
 *
 *   - `continua` (13) → todas son adjetivo ("corriente continua"): no se toca.
 *   - `practica` / `practicas` / `practico` → todas son sustantivo o adjetivo
 *     ("Práctica Recomendada", "taller práctico"): sí se acentúan.
 *   - `esta` (18) → 17 son el verbo "está"; la única excepción es
 *     "Esta lección", que se deja.
 *   - `este` (11) → 7 son "esté" (subjuntivo); "este módulo" se deja.
 *   - `detecto` y `sospecho` son títulos de diagnóstico en primera persona
 *     ("Detecto un punto caliente"): no se tocan.
 *   - `tomo` ("la variable que tomo"), `seria` ("una seria amenaza"),
 *     `aun` ("aun así") y `salvo` (preposición, salvo un caso): no se tocan.
 *   - `mas` (70) → ninguna aparece tras puntuación como conjunción arcaica:
 *     todas son "más".
 *   - `solo` se deja SIN tilde (RAE 2010).
 *
 * Los interrogativos (`que`, `cual`, `cuanto`, `como`, `cuando`, `donde`,
 * `quien`) se acentúan SOLO dentro de un span `¿...?`, que es determinista.
 *
 * IDEMPOTENTE: solo reemplaza formas sin acento, así que correrlo dos veces no
 * cambia nada. Nunca toca ids, slugs, fechas ni claves: solo valores de texto.
 *
 * USO
 *   node scripts/fix-acentos-cursos.js            # simulación (no escribe)
 *   node scripts/fix-acentos-cursos.js --write    # escribe en Firestore
 *   node scripts/fix-acentos-cursos.js --curso=nfpa-70b --write
 */
const admin = require('firebase-admin')
const path = require('path')

const CURSOS = ['seguridad-electrica', 'rescate-svb', 'nfpa-70b', 'codigo-electrico-nec']
const SUBS = ['manual', 'procedures', 'flows', 'diagnosis', 'quiz', 'glossary', 'biblio']

/** Claves que NO son prosa: identificadores, orden, fechas, referencias. */
const CLAVES_NO_TEXTO = new Set([
  'id', 'order', 'createdAt', 'updatedAt', 'correctIndex', 'slug', 'lessonId',
  'ref', 'url', 'icon', 'createdBy', 'updatedBy', '_deleted', 'machineSlug',
])

/**
 * Palabra sin acento → palabra correcta. Revisadas una por una contra el
 * vocabulario real del corpus; las que no están acá es porque se escriben bien
 * sin tilde (`examen`, `volumen`, `criticidad`, `craneano`, los plurales en
 * -ciones, etc.).
 */
const MAPA = {
  // ── eñes perdidas ──
  ano: 'año', anos: 'años', anade: 'añade', dana: 'daña', danada: 'dañada',
  danar: 'dañar', dano: 'daño', companero: 'compañero', desempeno: 'desempeño',
  diseno: 'diseño', disenar: 'diseñar', espanol: 'español', extrano: 'extraño',
  pasamontanas: 'pasamontañas', rinones: 'riñones', tamano: 'tamaño',
  senal: 'señal', senales: 'señales', senaliza: 'señaliza', senalizas: 'señalizas',
  senalizacion: 'señalización', senalizada: 'señalizada', senalizados: 'señalizados',
  senalizar: 'señalizar', daniaron: 'dañaron',

  // ── sustantivos en -ción / -sión ──
  accion: 'acción', aceptacion: 'aceptación', actualizacion: 'actualización',
  administracion: 'administración', alteracion: 'alteración', amputacion: 'amputación',
  aislacion: 'aislación', aplicacion: 'aplicación', aproximacion: 'aproximación',
  articulacion: 'articulación', atencion: 'atención', autoevaluacion: 'autoevaluación',
  autorizacion: 'autorización', calefaccion: 'calefacción', calificacion: 'calificación',
  canalizacion: 'canalización', certificacion: 'certificación', circulacion: 'circulación',
  clasificacion: 'clasificación', combinacion: 'combinación', comparacion: 'comparación',
  compresion: 'compresión', comprobacion: 'comprobación', computacion: 'computación',
  comunicacion: 'comunicación', condicion: 'condición', conexion: 'conexión',
  configuracion: 'configuración', consideracion: 'consideración', construccion: 'construcción',
  contaminacion: 'contaminación', contraccion: 'contracción', coordinacion: 'coordinación',
  correccion: 'corrección', corrosion: 'corrosión', crepitacion: 'crepitación',
  desconexion: 'desconexión', desfibrilacion: 'desfibrilación', deteccion: 'detección',
  distension: 'distensión', distincion: 'distinción', distribucion: 'distribución',
  duracion: 'duración', edicion: 'edición', ejecucion: 'ejecución',
  electrocucion: 'electrocución', elevacion: 'elevación', eliminacion: 'eliminación',
  evacuacion: 'evacuación', evaluacion: 'evaluación', evolucion: 'evolución',
  excepcion: 'excepción', expansion: 'expansión', explosion: 'explosión',
  exposicion: 'exposición', extension: 'extensión', extincion: 'extinción',
  fibrilacion: 'fibrilación', focalizacion: 'focalización', funcion: 'función',
  generacion: 'generación', gestion: 'gestión', identificacion: 'identificación',
  ignicion: 'ignición', iluminacion: 'iluminación', infeccion: 'infección',
  informacion: 'información', inmovilizacion: 'inmovilización', inspeccion: 'inspección',
  instalacion: 'instalación', interconexion: 'interconexión', intervencion: 'intervención',
  introduccion: 'introducción', ionizacion: 'ionización', leccion: 'lección',
  lesion: 'lesión', liberacion: 'liberación', luxacion: 'luxación',
  medicion: 'medición', multifuncion: 'multifunción', obstruccion: 'obstrucción',
  ocupacion: 'ocupación', opcion: 'opción', operacion: 'operación',
  organizacion: 'organización', percepcion: 'percepción', planificacion: 'planificación',
  posicion: 'posición', presentacion: 'presentación', presion: 'presión',
  prevencion: 'prevención', produccion: 'producción', proporcion: 'proporción',
  proteccion: 'protección', proyeccion: 'proyección', realimentacion: 'realimentación',
  reanimacion: 'reanimación', recepcion: 'recepción', recomendacion: 'recomendación',
  recuperacion: 'recuperación', redistribucion: 'redistribución', region: 'región',
  relacion: 'relación', reparacion: 'reparación', reputacion: 'reputación',
  respiracion: 'respiración', retencion: 'retención', revision: 'revisión',
  rotulacion: 'rotulación', seccion: 'sección', seleccion: 'selección',
  sensacion: 'sensación', sobretension: 'sobretensión', supervision: 'supervisión',
  sustitucion: 'sustitución', tension: 'tensión', tetanizacion: 'tetanización',
  transmision: 'transmisión', ubicacion: 'ubicación', union: 'unión',
  variacion: 'variación', ventilacion: 'ventilación',
  // Encontradas por el barrido posterior: el mapa de la primera pasada no las
  // tenía y quedaron sin tilde en el texto ya migrado.
  auscultacion: 'auscultación', capacitacion: 'capacitación', captacion: 'captación',
  condensacion: 'condensación', documentacion: 'documentación', estimulacion: 'estimulación',
  facturacion: 'facturación', justificacion: 'justificación', lubricacion: 'lubricación',
  mantencion: 'mantención', palpacion: 'palpación', verificacion: 'verificación',
  vibracion: 'vibración',

  // ── técnicos y adjetivos esdrújulos ──
  aerea: 'aérea', agonica: 'agónica', analisis: 'análisis', armonicos: 'armónicos',
  atmosfera: 'atmósfera', atmosferica: 'atmosférica', atmosfericas: 'atmosféricas',
  automatico: 'automático', automaticamente: 'automáticamente', basica: 'básica',
  basicas: 'básicas', basico: 'básico', basicos: 'básicos', carotideo: 'carotídeo',
  catastroficas: 'catastróficas', catastrofico: 'catastrófico', cianotica: 'cianótica',
  ciclica: 'cíclica', cinematica: 'cinemática', clinica: 'clínica', criticas: 'críticas',
  critico: 'crítico', criticos: 'críticos', dielectrico: 'dieléctrico',
  domesticas: 'domésticas', domestico: 'doméstico', economicas: 'económicas',
  electrica: 'eléctrica', electricas: 'eléctricas', electricamente: 'eléctricamente',
  electrico: 'eléctrico', electricos: 'eléctricos', electrogeometrico: 'electrogeométrico',
  electronica: 'electrónica', electronicas: 'electrónicas', especificos: 'específicos',
  esteril: 'estéril', estadistica: 'estadística', estadistico: 'estadístico',
  estrategica: 'estratégica', exotermica: 'exotérmica', fisica: 'física',
  fisicas: 'físicas', fisico: 'físico', fisiologico: 'fisiológico', fria: 'fría',
  grisaceo: 'grisáceo', hipovolemico: 'hipovolémico', historico: 'histórico',
  humeda: 'húmeda', humedas: 'húmedas', humedo: 'húmedo', humedos: 'húmedos',
  instantaneo: 'instantáneo', isoceraunico: 'isoceráunico', liquidos: 'líquidos',
  magnetotermico: 'magnetotérmico', maxima: 'máxima', maximo: 'máximo',
  maximos: 'máximos', mecanica: 'mecánica', mecanicas: 'mecánicas',
  metalicas: 'metálicas', metalicos: 'metálicos', minima: 'mínima', minimas: 'mínimas',
  minimo: 'mínimo', minimos: 'mínimos', mnemotecnica: 'mnemotécnica',
  monofasicas: 'monofásicas', monofasico: 'monofásico', neurologico: 'neurológico',
  optima: 'óptima', optimo: 'óptimo', palida: 'pálida', periodica: 'periódica',
  periodicas: 'periódicas', practica: 'práctica', practicas: 'prácticas',
  practico: 'práctico', rapido: 'rápido', sanguineo: 'sanguíneo', sistematico: 'sistemático',
  solida: 'sólida', solido: 'sólido', solidos: 'sólidos', tecnica: 'técnica',
  tecnicas: 'técnicas', tecnico: 'técnico', tecnicos: 'técnicos', teorica: 'teórica',
  termica: 'térmica', termografia: 'termografía', termografias: 'termografías',
  termografica: 'termográfica', termomagnetica: 'termomagnética',
  centimetro: 'centímetro', esquematicos: 'esquemáticos', pulsatil: 'pulsátil',
  catalogos: 'catálogos', corroida: 'corroída', crepitos: 'crépitos',
  estandar: 'estándar', idoneo: 'idóneo', lider: 'líder', multiple: 'múltiple',
  proxima: 'próxima', rectilineo: 'rectilíneo', tipicos: 'típicos', tipicas: 'típicas',
  termomagnetico: 'termomagnético', tipica: 'típica', tipico: 'típico',
  trifasica: 'trifásica', trifasico: 'trifásico', trifasicos: 'trifásicos',
  unico: 'único', util: 'útil', utiles: 'útiles', vacio: 'vacío',

  // ── sustantivos con hiato o esdrújulos ──
  angulo: 'ángulo', apagon: 'apagón', aposito: 'apósito', apositos: 'apósitos',
  area: 'área', articulo: 'artículo', auditoria: 'auditoría', averias: 'averías',
  boton: 'botón', caida: 'caída', caidas: 'caídas', calculo: 'cálculo',
  calorias: 'calorías', camara: 'cámara', capitulo: 'capítulo', capitulos: 'capítulos',
  caracteristicas: 'características', categoria: 'categoría', categorias: 'categorías',
  cirugia: 'cirugía', codigo: 'código', comun: 'común', corazon: 'corazón',
  debil: 'débil', dia: 'día', dias: 'días', digito: 'dígito', encefalo: 'encéfalo',
  energia: 'energía', esternon: 'esternón', estimulo: 'estímulo',
  estomago: 'estómago', fasciotomia: 'fasciotomía', fenomenos: 'fenómenos',
  filosofias: 'filosofías', formula: 'fórmula', garantia: 'garantía', guia: 'guía',
  hidrogeno: 'hidrógeno', higado: 'hígado', hinchazon: 'hinchazón',
  imagenes: 'imágenes', ingenieria: 'ingeniería', jerarquia: 'jerarquía',
  limite: 'límite', limites: 'límites', linea: 'línea', lineas: 'líneas',
  mayoria: 'mayoría', megohmetro: 'megóhmetro', menton: 'mentón', metodo: 'método',
  metodologia: 'metodología', metodos: 'métodos', modulo: 'módulo', movil: 'móvil',
  multimetro: 'multímetro', multiplos: 'múltiplos', musculos: 'músculos',
  numero: 'número', organos: 'órganos', oxigeno: 'oxígeno', pagina: 'página',
  paralisis: 'parálisis', parametros: 'parámetros', perdida: 'pérdida',
  perdidas: 'pérdidas', perimetro: 'perímetro', pertiga: 'pértiga',
  pertigas: 'pértigas', proposito: 'propósito', rafaga: 'ráfaga',
  relampago: 'relámpago', rele: 'relé', reles: 'relés', sabana: 'sábana',
  simetria: 'simetría', talon: 'talón', tecnologia: 'tecnología',
  telefono: 'teléfono', telurimetro: 'telurímetro', telurometro: 'telurómetro',
  torax: 'tórax', triangulo: 'triángulo', tuberias: 'tuberías', ultimo: 'último',
  via: 'vía', victima: 'víctima', victimas: 'víctimas', vomito: 'vómito',

  // ── adverbios y conectores ──
  aca: 'acá', ademas: 'además', ahi: 'ahí', algun: 'algún', asi: 'así',
  atras: 'atrás', demas: 'demás', despues: 'después', mas: 'más', recien: 'recién',
  segun: 'según', tambien: 'también', traves: 'través',

  // ── formas verbales inequívocas ──
  adopto: 'adoptó', aplico: 'aplicó', cayo: 'cayó', coloco: 'colocó', creia: 'creía',
  dejo: 'dejó', demostro: 'demostró', derogo: 'derogó', destaco: 'destacó',
  establecio: 'estableció', estan: 'están', estara: 'estará', esten: 'estén',
  evalua: 'evalúa', evaluas: 'evalúas', expon: 'expón', hara: 'hará',
  hincho: 'hinchó', ignoraria: 'ignoraría', incorporo: 'incorporó', instalo: 'instaló',
  llamo: 'llamó', manten: 'mantén', nacio: 'nació', ocurrio: 'ocurrió',
  penso: 'pensó', perdio: 'perdió', prolongo: 'prolongó', puntua: 'puntúa',
  quedo: 'quedó', recibio: 'recibió', recupero: 'recuperó', reporto: 'reportó',
  rompio: 'rompió', salio: 'salió', sufrio: 'sufrió',

  // ── imperativos con pronombre pegado ──
  abrigala: 'abrígala', arrodillate: 'arrodíllate', bajala: 'bájala',
  colocala: 'colócala', enciendelo: 'enciéndelo', manejala: 'manéjala',
  moviendola: 'moviéndola', protegete: 'protégete', separala: 'sepárala',
  sumandose: 'sumándose', trasladala: 'trasládala', ubicalo: 'ubícalo', usala: 'úsala',
}

/**
 * Lo que el mapa no puede resolver solo porque depende de la frase.
 *
 * Acá viven las PREGUNTAS INDIRECTAS ("entender por qué falla", "saber cómo se
 * arma"), que llevan tilde igual que las directas pero no van entre `¿?`, así
 * que la regla de preguntas no las ve. Se listan una por una, revisadas contra
 * sus ocurrencias reales, en vez de arriesgar una regla general: "condición
 * donde el contacto…" o "Como Norma obligatoria" son relativos y NO llevan.
 *
 * Se aplican ANTES del mapa de palabras, sobre el texto original. Si alguna
 * deja de aparecer, el script lo avisa en vez de fallar mudo.
 */
const FRASES = [
  ['Se salvo porque', 'Se salvó porque'],
  ['por que', 'por qué'],
  ['Por que', 'Por qué'],
  ['saber como se', 'saber cómo se'],
  ['como afecta', 'cómo afecta'],
  ['como se estructura', 'cómo se estructura'],
  ['y como se miden', 'y cómo se miden'],
  ['y como se decide', 'y cómo se decide'],
  ['y como se organiza', 'y cómo se organiza'],
  ['sobre como se instala', 'sobre cómo se instala'],
  ['quien, cuando y cuanto', 'quién, cuándo y cuánto'],
  ['CUANDO sustituir o reparar y CUANTO', 'CUÁNDO sustituir o reparar y CUÁNTO'],
  ['decidir cuanto y como intervenir', 'decidir cuánto y cómo intervenir'],
  ['cada cuanto probar', 'cada cuánto probar'],
]

/** `esta`/`este` son verbo salvo cuando acompañan a estas palabras. */
const DEMOSTRATIVO_SIGUIENTE = /^(leccion|lección|modulo|módulo)\b/i

const INTERROGATIVOS = {
  que: 'qué', cual: 'cuál', cuales: 'cuáles', cuanto: 'cuánto', cuanta: 'cuánta',
  cuantos: 'cuántos', cuantas: 'cuántas', como: 'cómo', cuando: 'cuándo',
  donde: 'dónde', quien: 'quién', quienes: 'quiénes',
}

const conMayuscula = (original, corregida) =>
  original[0] === original[0].toUpperCase()
    ? corregida[0].toUpperCase() + corregida.slice(1)
    : corregida

const RE_PALABRA = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g

/** Aplica el mapa palabra por palabra, respetando mayúsculas. */
function corregirPalabras(texto) {
  return texto.replace(RE_PALABRA, (w, offset, full) => {
    const k = w.toLowerCase()
    if (k === 'esta' || k === 'este') {
      const resto = full.slice(offset + w.length).replace(/^[\s"']+/, '')
      if (DEMOSTRATIVO_SIGUIENTE.test(resto)) return w
      return conMayuscula(w, k === 'esta' ? 'está' : 'esté')
    }
    const corregida = MAPA[k]
    return corregida ? conMayuscula(w, corregida) : w
  })
}

/**
 * Palabras que pueden ir DELANTE del interrogativo sin quitarle esa condición:
 * preposiciones, artículos y el "partir" de "¿a partir de qué corriente...?".
 */
const ANTES_DEL_INTERROGATIVO = new Set([
  'a', 'de', 'en', 'con', 'por', 'para', 'desde', 'hasta', 'sobre', 'entre',
  'hacia', 'tras', 'segun', 'según', 'partir', 'el', 'la', 'los', 'las',
  'un', 'una', 'cada',
])

/**
 * Acentúa el interrogativo de cada `¿...?`, y SOLO ese.
 *
 * Dentro de una pregunta no todo `que` es interrogativo: en "¿cuáles son los 3
 * peligros que define la norma?" el segundo es un relativo y NO lleva tilde;
 * en "¿cómo se llama cuando el hueso se sale?" el `cuando` tampoco. Por eso se
 * acentúa únicamente el PRIMER interrogativo, y solo si lo que va antes son
 * preposiciones o artículos ("¿a partir de qué corriente...?").
 *
 * El precio es quedarse corto en preguntas con dos interrogativos ("¿cuál es
 * el límite y que EPP se usa?"): preferible a acentuar un relativo, que sí
 * sería una falta de ortografía.
 */
function corregirPreguntas(texto) {
  return texto.replace(/¿[^?]*\?/g, (pregunta) => {
    let hecho = false
    return pregunta.replace(RE_PALABRA, (w) => {
      if (hecho) return w
      const k = w.toLowerCase()
      if (ANTES_DEL_INTERROGATIVO.has(k)) return w
      hecho = true
      const c = INTERROGATIVOS[k]
      return c ? conMayuscula(w, c) : w
    })
  })
}

function corregir(texto) {
  // Las frases van PRIMERO, sobre el texto original: después del mapa el
  // "por que" ya no se reconocería ("por que las lesiones eléctricas").
  let out = texto
  for (const [de, a] of FRASES) out = out.split(de).join(a)
  out = corregirPalabras(out)
  return corregirPreguntas(out)
}

/** Recorre el doc y corrige solo los valores de texto. */
function corregirValor(valor, clave) {
  if (typeof valor === 'string') return CLAVES_NO_TEXTO.has(clave) ? valor : corregir(valor)
  if (Array.isArray(valor)) return valor.map((v) => corregirValor(v, clave))
  if (valor && typeof valor === 'object' && !(valor instanceof Date) && !valor.toDate) {
    const out = {}
    for (const k of Object.keys(valor)) out[k] = corregirValor(valor[k], k)
    return out
  }
  return valor
}

async function main() {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const filtro = (args.find((a) => a.startsWith('--curso=')) || '').split('=')[1]
  const cursos = filtro ? [filtro] : CURSOS

  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))),
  })
  const db = admin.firestore()

  let docsTocados = 0
  let docsTotal = 0
  let campos = 0
  const ejemplos = []
  const frasesVistas = new Set()

  for (const slug of cursos) {
    for (const sub of SUBS) {
      const snap = await db.collection('learningContent').doc(slug).collection(sub).get()
      for (const d of snap.docs) {
        docsTotal++
        const antes = d.data()
        const despues = corregirValor(antes, null)
        if (JSON.stringify(antes) === JSON.stringify(despues)) continue
        docsTocados++
        for (const k of Object.keys(antes)) {
          if (JSON.stringify(antes[k]) !== JSON.stringify(despues[k])) campos++
        }
        if (ejemplos.length < 6) {
          const k = Object.keys(antes).find(
            (x) => typeof antes[x] === 'string' && antes[x] !== despues[x],
          )
          if (k) {
            ejemplos.push(
              `${slug}/${sub}/${d.id} · ${k}\n   antes: ${String(antes[k]).slice(0, 140)}\n   ahora: ${String(despues[k]).slice(0, 140)}`,
            )
          }
        }
        for (const [de] of FRASES) if (JSON.stringify(antes).includes(de)) frasesVistas.add(de)
        if (write) await d.ref.set(despues, { merge: false })
      }
    }
  }

  console.log(`\nDocumentos: ${docsTotal} · con cambios: ${docsTocados} · campos tocados: ${campos}`)
  console.log(ejemplos.join('\n'))
  for (const [de] of FRASES) {
    if (!frasesVistas.has(de)) {
      console.log(`AVISO: la frase "${de}" no apareció — revisar si el texto cambió.`)
    }
  }
  console.log(write ? '\nESCRITO en Firestore.' : '\nSimulación: nada se escribió. Usar --write.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
