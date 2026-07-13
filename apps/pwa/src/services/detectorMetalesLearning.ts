/**
 * detectorMetalesLearning — contenido del Centro de Aprendizaje para el Detector
 * de Metales Vistus (Sartorius Mechatronics / Minebea Intec).
 *
 * La data se curó del manual oficial (`BA_Vistus-es_0_20110413`, 223 págs) al
 * formato del expediente estándar. Vive como seed JSON
 * (`detectorMetales/detectorMetalesContent.json`, generado por curaduría y
 * versionado en el repo) y este módulo lo adapta a los tipos de `learningContent`.
 *
 * Misma idea que baader142Learning / baader200Learning / graderLearning: seed en
 * código; a futuro se le pueden sumar overrides de Firestore si hace falta editar
 * desde admin.
 */
import seed from './detectorMetales/detectorMetalesContent.json'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const DETECTOR_LEARNING_SLUG = 'detector-metales'
export const DETECTOR_CONTENT_UPDATED_AT = new Date('2026-07-12T00:00:00-04:00').getTime()

interface RawQuiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface RawManual { id: string; title: string; order: number; content: string; objetivo?: string; porque?: string; quiz?: RawQuiz[] }
interface RawProcedure {
  id: string; title: string; description?: string
  steps: { order: number; title: string; description?: string; imageUrl?: string | null }[]
}
interface RawFlow { id: string; title: string; trigger: string; actions: string[] }
interface RawDiagnosis { id: string; title: string; symptom: string; possibleCauses: string[]; solution: string }

interface DetectorSeed {
  manual: RawManual[]
  procedures: RawProcedure[]
  flows: RawFlow[]
  diagnosis: RawDiagnosis[]
}

const data = seed as DetectorSeed
const stamp = { createdAt: DETECTOR_CONTENT_UPDATED_AT, updatedAt: DETECTOR_CONTENT_UPDATED_AT }

/**
 * Capa didáctica (objetivo · el porqué · autoevaluación) sobre las secciones del
 * manual curado. Se mantiene aquí, en TS type-checked, en vez de dentro del JSON
 * de contenido, para no reescribir el cuerpo curado y evitar errores de escape.
 * Grounded en el mismo manual Vistus que cita cada sección.
 */
const MANUAL_DIDACTIC: Record<string, { objetivo?: string; porque?: string; quiz?: RawQuiz[] }> = {
  'det-manual-familia-vistus': {
    objetivo: 'Al terminar vas a poder explicar cómo el Vistus detecta metal —un campo electromagnético que la partícula altera— y reconocer qué configuración de la familia Vistus tenés en la línea.',
    porque: 'saber que detecta Fe, no ferrosos e inoxidables (y que el AISI 304 es el más difícil) fija la expectativa correcta: si algo pasa sin detectarse, muchas veces es un inoxidable no magnético, no una falla del equipo.',
    quiz: [
      {
        question: '¿Qué hace que el detector dispare un mensaje de detección?',
        options: ['Un sensor óptico ve el metal', 'Una partícula metálica altera el campo electromagnético de la abertura', 'El peso del producto', 'La temperatura del producto'],
        correctIndex: 1,
        explanation: 'El Vistus genera un campo electromagnético alterno; el metal que atraviesa la abertura altera el campo y dispara la detección.',
      },
      {
        question: '¿Cuál es el metal más difícil de detectar?',
        options: ['Hierro (Fe)', 'Aluminio', 'Acero inoxidable no magnético (AISI 304 / V2A)', 'Latón'],
        correctIndex: 2,
        explanation: 'El acero inox no magnético (AISI 304 / V2A) es el más difícil. Si la bola de test de V2A pasa el control, las demás también.',
      },
    ],
  },
  'det-manual-seguridad': {
    objetivo: 'Reconocer los peligros del detector y del transporte/separador, y saber que a las personas con marcapasos les corresponde una distancia mínima por el campo electromagnético.',
    porque: 'el detector genera un campo electromagnético fuerte; ignorar el aviso de marcapasos o puentear una cubierta del separador puede lesionar a alguien. Acá la seguridad no es formalidad.',
    quiz: [
      {
        question: 'Una persona con marcapasos se acerca al detector. ¿Qué corresponde?',
        options: ['No pasa nada', 'Debe mantener la distancia mínima que fija el usuario por el campo electromagnético', 'Solo importa si toca el equipo', 'Apagar el detector cada vez'],
        correctIndex: 1,
        explanation: 'El campo puede afectar marcapasos/desfibriladores: el equipo lleva 4 signos «Prohibido a personas con marcapasos» y hay una distancia mínima que fija el usuario según normativa.',
      },
      {
        question: 'Hay una avería no descrita en el manual. ¿Qué hacés?',
        options: ['La reparás vos mismo', 'Puenteás el dispositivo de seguridad', 'Contactás al servicio técnico de Sartorius sin modificar nada', 'Seguís produciendo'],
        correctIndex: 2,
        explanation: 'No se repara ni modifica por cuenta propia; ante una avería no descrita se contacta al servicio técnico y no se eluden los dispositivos de seguridad.',
      },
    ],
  },
  'det-manual-componentes': {
    objetivo: 'Identificar las partes del sistema —detector, terminal, separador y los accesorios de sincronización y supervisión— y para qué sirve cada una en que el rechazo caiga sobre la pieza correcta.',
    porque: 'si el rechazo llega tarde o temprano, el problema suele estar en la sincronización (sensor de producto o encoder), no en la detección. Conocer los componentes ahorra buscar donde no es.',
    quiz: [
      {
        question: 'El detector detecta bien pero el separador rechaza la pieza equivocada. ¿Qué componente mirar primero?',
        options: ['La bobina del detector', 'La sincronización: sensor de posición del producto y transmisor de impulsos (encoder)', 'El recipiente colector', 'La pantalla táctil'],
        correctIndex: 1,
        explanation: 'La sincronización (sensor de posición + encoder de recorrido) temporiza el rechazo; si falla, se desvía la pieza equivocada aunque la detección esté bien.',
      },
    ],
  },
  'det-manual-efecto-producto': {
    objetivo: 'Al terminar vas a distinguir la señal del producto de la señal del metal, y a saber por qué el detector debe «aprender» cada producto antes de inspeccionarlo.',
    porque: 'si el efecto de producto no se aprende bien, el equipo rechaza producto sano o pierde sensibilidad y deja pasar metal. Es la diferencia entre inspeccionar y adivinar.',
    quiz: [
      {
        question: '¿Por qué el detector debe «aprender» cada producto nuevo?',
        options: ['Para pesarlo', 'Para medir el efecto de producto y poder descontarlo del metal', 'Para imprimir la etiqueta', 'Para elegir la velocidad de la cinta'],
        correctIndex: 1,
        explanation: 'Muchos productos generan su propia señal (efecto de producto); el detector la aprende para descontarla y recién así detectar el metal que sobra.',
      },
      {
        question: 'Producto húmedo y salado, empaquetado en film metálico. ¿Qué esperás?',
        options: ['Ningún efecto de producto', 'Efecto de producto fuerte, que exige un buen aprendizaje', 'Que no se pueda inspeccionar nunca', 'Que detecte mejor'],
        correctIndex: 1,
        explanation: 'Productos húmedos/salados o con film metálico o tintas conductoras acentúan el efecto de producto; hay que aprenderlo bien o habrá falsos rechazos.',
      },
    ],
  },
  'det-manual-sensibilidad-zona-libre': {
    objetivo: 'Fijar expectativas realistas de sensibilidad (básica vs de funcionamiento vs al producto) y respetar la zona libre de metales que la hace posible.',
    porque: 'prometer la sensibilidad básica en una línea real lleva a falsos rechazos y a bajar el umbral hasta dejar pasar metal. La zona libre de metales no es un detalle: si no se respeta, la sensibilidad cae.',
    quiz: [
      {
        question: '¿Cuánta zona libre de metales se necesita aguas arriba/abajo con transporte de acero inoxidable?',
        options: ['1 vez la altura de la abertura', '3 veces la altura de la abertura', '10 cm fijos', 'No hace falta'],
        correctIndex: 1,
        explanation: '3× la altura de la abertura si el transporte es inoxidable; 4× si es acero. Menos que eso reduce la sensibilidad.',
      },
      {
        question: '¿Cuál de estas es la sensibilidad que se logra de verdad en planta?',
        options: ['La básica', 'La de funcionamiento (con interferencias reales)', 'La al producto, siempre', 'Ninguna'],
        correctIndex: 1,
        explanation: 'La de funcionamiento considera cinta sucia, piezas metálicas cercanas, estática y variadores; es la real y siempre es ≤ la básica.',
      },
    ],
  },
  'det-manual-datos-producto': {
    objetivo: 'Entender qué guarda un perfil de datos de producto y por qué solo personal formado edita los ajustes de detección, mientras el operador solo selecciona y arranca.',
    porque: 'un dato de producto mal editado hace fallar la detección o rechazar producto sano en todo el turno. Separar quién selecciona de quién edita evita el error más caro.',
    quiz: [
      {
        question: '¿Qué puede hacer un operador con los perfiles de datos de producto?',
        options: ['Editar frecuencia y umbral', 'Solo seleccionar el producto e iniciar la inspección', 'Borrarlos', 'Cambiar la fase'],
        correctIndex: 1,
        explanation: 'Los operadores solo seleccionan e inician; los ajustes de detección (frecuencia, fase, umbral) los edita personal formado (ingeniero o mantenimiento).',
      },
      {
        question: '¿Cuál es el límite de caracteres del nombre y del número de artículo?',
        options: ['8', '15', '32', 'Sin límite'],
        correctIndex: 1,
        explanation: 'Máximo 15 caracteres cada uno para que se vean en el área línea/producto.',
      },
    ],
  },
  'det-manual-usuarios-mensajes': {
    objetivo: 'Leer el semáforo del detector —error (E), advertencia (W), evento (M), detección (X)— y saber quién puede confirmar cada mensaje.',
    porque: 'confundir una advertencia (sigue inspeccionando) con un error (la detección se detuvo) hace perder producción o, peor, dejar pasar producto sin inspección. El color del semáforo es la primera lectura del turno.',
    quiz: [
      {
        question: 'El semáforo está en ROJO (mensaje de error E). ¿Qué implica?',
        options: ['Sigue inspeccionando normal', 'La detección se detuvo y se disparó el relé Error', 'Es solo informativo', 'Se detectó metal'],
        correctIndex: 1,
        explanation: 'Error (E) = rojo: la detección se detiene y se dispara el relé Error. Confirmarlo requiere ingeniero, tras solventar la causa.',
      },
      {
        question: '¿Quién puede confirmar un mensaje de error?',
        options: ['Cualquier operador', 'Solo ingeniero', 'El personal de limpieza', 'Nadie'],
        correctIndex: 1,
        explanation: 'Confirmar un error requiere ingeniero. Una advertencia (W) o una detección (X) las confirma operador o ingeniero.',
      },
    ],
  },
}

/** Sección 8 (nueva): limpieza, cubiertas y cuidado. Curada del manual Vistus (pág 13-15, 20, 116, 183). */
const EXTRA_MANUAL: RawManual[] = [
  {
    id: 'det-manual-limpieza-cuidado',
    title: 'Limpieza, cubiertas y cuidado',
    order: 8,
    content: [
      'El detector y su terminal están hechos para lavarse en línea, pero la limpieza y el cuidado tienen reglas: la pantalla y las cubiertas protegen la electrónica y a las personas, y hay que respetarlas.',
      'Puntos clave:',
      '- La pantalla táctil tiene cubierta IP69k de policarbonato: admite limpieza con agua a alta presión.',
      '- Antes de limpiar, bloquear la pantalla táctil para que el chorro no cambie ajustes al «tocar» la pantalla.',
      '- Si se desmontan cubiertas para limpiar, mantener o reparar, hay que volver a montarlas antes de arrancar.',
      '- Nunca operar el detector, el transporte o el separador con dispositivos de seguridad dañados o faltantes.',
      'Notas operativas:',
      '- Comprobar los dispositivos de seguridad al interrumpir cada turno, una vez por semana en funcionamiento ininterrumpido, y después de todo mantenimiento, inspección o reparación.',
      '- El equipo puede configurar un intervalo de mantenimiento; al vencer avisa con W007F «Detector maintenance required». Tras hacer el mantenimiento hay que reiniciar el intervalo o fijar una nueva fecha.',
      '- Fuente: manual Vistus, pág 13-15, 20, 116, 183.',
    ].join('\n\n'),
    objetivo: 'Limpiar el detector sin cambiar ajustes ni dañar la electrónica, y saber cada cuánto revisar los dispositivos de seguridad y qué hacer cuando aparece el aviso de mantenimiento W007F.',
    porque: 'una pantalla sin bloquear se «toca» sola con el chorro y descalibra ajustes; una cubierta que quedó afuera es un riesgo. El aviso W007F ignorado esconde mantenimiento vencido — justo lo que Mantención debe demostrar que sí hace.',
    quiz: [
      {
        question: '¿Qué se hace ANTES de lavar la pantalla táctil?',
        options: ['Nada, es IP69k', 'Bloquear la pantalla para que el chorro no cambie ajustes', 'Apagar todo el equipo', 'Desmontar la pantalla'],
        correctIndex: 1,
        explanation: 'La cubierta IP69k aguanta alta presión, pero el chorro «toca» la pantalla; hay que bloquearla antes de limpiar para no cambiar ajustes.',
      },
      {
        question: 'Aparece W007F «Detector maintenance required». ¿Qué significa?',
        options: ['Falla de hardware', 'Se cumplió el intervalo de mantenimiento configurado; hacer el mantenimiento y reiniciar el intervalo', 'Hay metal acumulado', 'Falta un USB'],
        correctIndex: 1,
        explanation: 'W007F avisa que venció el intervalo/fecha de mantenimiento configurado. Tras efectuar el mantenimiento hay que restaurar el intervalo o fijar una nueva fecha.',
      },
    ],
  },
]

export function listDetectorManualSections(): ManualSection[] {
  return [...data.manual, ...EXTRA_MANUAL]
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(s => {
      const d = MANUAL_DIDACTIC[s.id]
      return {
        id: s.id,
        title: s.title,
        order: s.order,
        content: s.content,
        objetivo: s.objetivo ?? d?.objetivo,
        porque: s.porque ?? d?.porque,
        quiz: s.quiz ?? d?.quiz,
        ...stamp,
      }
    })
}

export function listDetectorProcedures(): Procedure[] {
  return data.procedures.map(p => ({
    id: p.id,
    title: p.title,
    description: p.description ?? '',
    steps: p.steps.map(st => ({
      order: st.order,
      title: st.title,
      description: st.description ?? '',
      imageUrl: st.imageUrl ?? null,
    })),
    createdBy: 'detector-seed',
    ...stamp,
  }))
}

export function listDetectorFlows(): Flow[] {
  return data.flows.map(f => ({ id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, ...stamp }))
}

export function listDetectorDiagnosis(): DiagnosisEntry[] {
  return data.diagnosis.map(d => ({
    id: d.id,
    title: d.title,
    symptom: d.symptom,
    possibleCauses: d.possibleCauses,
    solution: d.solution,
    ...stamp,
  }))
}

export function getDetectorContentCounts() {
  return {
    manual: data.manual.length + EXTRA_MANUAL.length,
    procedures: data.procedures.length,
    flows: data.flows.length,
    diagnosis: data.diagnosis.length,
  }
}
