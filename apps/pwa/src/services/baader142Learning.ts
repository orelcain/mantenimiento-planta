/**
 * baader142Learning — contenido del Centro de Aprendizaje para la Baader 142.
 *
 * La data se curó del manual oficial (`142-Manual de Instrucciones-2005-12-E`,
 * 96 págs) al formato del expediente estándar. Vive como seed JSON
 * (`baader142/baader142Content.json`, generado por curaduría y versionado en el
 * repo) y este módulo lo adapta a los tipos de `learningContent`.
 *
 * Misma idea que baader200Learning / graderLearning: seed en código; a futuro
 * se le pueden sumar overrides de Firestore si hace falta editar desde admin.
 */
import seed from './baader142/baader142Content.json'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const B142_LEARNING_SLUG = 'baader-142'
export const B142_CONTENT_UPDATED_AT = new Date('2026-07-12T00:00:00-04:00').getTime()

interface RawQuiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface RawManual { id: string; title: string; order: number; content: string; objetivo?: string; porque?: string; quiz?: RawQuiz[] }
interface RawProcedure {
  id: string; title: string; description?: string
  steps: { order: number; title: string; description?: string; imageUrl?: string | null }[]
}
interface RawFlow { id: string; title: string; trigger: string; actions: string[] }
interface RawDiagnosis { id: string; title: string; symptom: string; possibleCauses: string[]; solution: string }

interface B142Seed {
  manual: RawManual[]
  procedures: RawProcedure[]
  flows: RawFlow[]
  diagnosis: RawDiagnosis[]
}

const data = seed as B142Seed
const stamp = { createdAt: B142_CONTENT_UPDATED_AT, updatedAt: B142_CONTENT_UPDATED_AT }

/**
 * Capa didáctica (objetivo · el porqué · autoevaluación) sobre las secciones del
 * manual curado, en TS type-checked, sin reescribir el JSON. Grounded en el mismo
 * manual 142 que cada sección cita.
 */
const MANUAL_DIDACTIC: Record<string, { objetivo?: string; porque?: string; quiz?: RawQuiz[] }> = {
  'b142-manual-seguridad': {
    objetivo: 'Reconocer los peligros de la 142 —zona de cuchillas, partes en movimiento, eléctrico— y las reglas mínimas antes de limpiar o intervenir: interruptor principal en 0 y asegurado, cubiertas montadas.',
    porque: 'la 142 corta y eviscera hasta 16 pescados/min; una cubierta abierta o el interruptor sin asegurar durante la limpieza es cómo pasan los accidentes graves. Acá la seguridad es la diferencia entre un turno normal y una lesión.',
    quiz: [
      {
        question: 'Antes de limpiar o hacer mantenimiento a la 142, ¿qué es lo primero?',
        options: ['Bajar la velocidad', 'Desconectar: interruptor principal en 0 y asegurarlo', 'Avisar por radio', 'Sacar una cubierta'],
        correctIndex: 1,
        explanation: 'Se desconecta la máquina, se pone el interruptor principal en 0 y se asegura antes de limpiar, mantener o lubricar.',
      },
      {
        question: '¿Se puede rociar spray sobre las cajas de distribución o los aparatos eléctricos?',
        options: ['Sí, para limpiar', 'No: hay peligro de explosión', 'Solo con aire comprimido', 'Solo con la máquina apagada'],
        correctIndex: 1,
        explanation: 'Se prohíbe rociar spray de cualquier clase sobre las cajas de distribución o aparatos eléctricos: peligro de explosión.',
      },
    ],
  },
  'b142-manual-generalidades-datos-tecnicos': {
    objetivo: 'Saber para qué pescado y en qué rango trabaja la 142 (salmón/trucha fresco, 2-7 kg, con cabeza y aleta anal) y sus consumos, para no forzarla fuera de especificación.',
    porque: 'meter pescado congelado, en rigor mortis o sin aleta anal rompe herramientas y baja el rendimiento; conocer el rango evita paradas y daños que después se cuentan como falla de Mantención.',
    quiz: [
      {
        question: '¿Qué pescado NO se puede eviscerar en la 142?',
        options: ['Salmón fresco de 4 kg', 'Pescado congelado o en rigor mortis', 'Trucha marina con cabeza', 'Salmón con aleta anal'],
        correctIndex: 1,
        explanation: 'No pueden elaborarse peces en rigidez cadavérica (rigor mortis) ni congelados; debe ser fresco, con cabeza y con aleta anal, de 2 a 7 kg.',
      },
      {
        question: '¿Cuál es el rango de rendimiento de la 142?',
        options: ['1-16 pescados/min', '50 pescados/min', '1-5 pescados/min', 'Sin límite'],
        correctIndex: 0,
        explanation: 'El rendimiento es de 1 a 16 pescados por minuto.',
      },
    ],
  },
  'b142-manual-instalacion-servicios': {
    objetivo: 'Conocer los servicios que la 142 necesita (agua, aire ISO 8573-1 clase 7.4.3, refrigeración del controlador de pescado) y por qué no se cortan.',
    porque: 'un grifo de cierre delante de la máquina o el circuito de refrigeración interrumpido hacen que el controlador de pescado pase de 50 °C y la máquina se desconecte dejando caer las herramientas — un daño perfectamente evitable.',
    quiz: [
      {
        question: '¿Qué pasa si el controlador de pescado supera los 50 °C?',
        options: ['Nada', 'La máquina se desconecta y las herramientas caen incontroladas', 'Suena una alarma pero sigue', 'Baja la velocidad'],
        correctIndex: 1,
        explanation: 'Sobre 50 °C la máquina se desconecta y las herramientas se caen incontroladamente; por eso no se interrumpe el circuito de refrigeración del controlador.',
      },
      {
        question: '¿Se pueden instalar grifos de cierre delante de la máquina?',
        options: ['Sí', 'No', 'Solo en el agua', 'Solo en el aire'],
        correctIndex: 1,
        explanation: 'No deben instalarse grifos de cierre delante de la máquina ni interrumpir el circuito de refrigeración de la caja del controlador de pescado.',
      },
    ],
  },
  'b142-manual-dispositivos-seguridad': {
    objetivo: 'Saber qué acciones detienen la 142 (levantar cubiertas, girar puertas protectoras, paradas de emergencia de la máquina y del ciclón) y que esos dispositivos no se eluden.',
    porque: 'los dispositivos de seguridad son lo que frena las cuchillas cuando alguien abre una cubierta; puentearlos para «ganar tiempo» es exactamente lo que causa las lesiones graves.',
    quiz: [
      {
        question: '¿Cuál de estas acciones NO detiene la máquina?',
        options: ['Levantar las cubiertas', 'Girar las puertas protectoras hacia arriba', 'Bajar la velocidad en el display', 'Accionar la parada de emergencia del ciclón'],
        correctIndex: 2,
        explanation: 'La máquina se para al levantar cubiertas, girar puertas protectoras o accionar cualquiera de las dos paradas de emergencia (142 o ciclón). Bajar la velocidad no es un dispositivo de seguridad.',
      },
    ],
  },
  'b142-manual-funcionamiento': {
    objetivo: 'Explicar cómo la 142 mide y eviscera un pescado —el A3C calcula los recorridos por largo, contorno y posición del ano— y por qué la posición cero protege al pescado mal medido.',
    porque: 'entender que las herramientas se guían por la medición del A3C ayuda a diagnosticar cortes malos: muchas veces la causa es la alimentación o la posición del pescado, no las cuchillas.',
    quiz: [
      {
        question: '¿A partir de qué calcula el A3C los recorridos de las herramientas?',
        options: ['Del peso', 'Del largo, el contorno y la posición del ano', 'Del color', 'De la temperatura'],
        correctIndex: 1,
        explanation: 'El A3C calcula los recorridos a partir del largo, el contorno y la posición del ano del pescado.',
      },
      {
        question: '¿Para qué sirve que la posición cero de las herramientas sea la más alta?',
        options: ['Para cortar más profundo', 'Para que un pescado no medido correctamente pase sin dañarse', 'Para ahorrar aire', 'Para limpiar'],
        correctIndex: 1,
        explanation: 'La posición cero (la más alta) deja pasar sin daño a los pescados que no se midieron correctamente.',
      },
    ],
  },
  'b142-manual-programas': {
    objetivo: 'Usar el selector 5 para los ajustes básicos: limpieza, marchas de prueba (Test 12/13), servicio de motores paso a paso y reseteo del contador.',
    porque: 'hacer un ajuste de herramientas sin poner el selector 5 en la posición correcta —o sin devolverlo a clase de pescado— deja la máquina en un estado raro; conocer el selector evita esos enredos y paradas.',
    quiz: [
      {
        question: '¿Qué hace Test 13 en el selector 5?',
        options: ['Marcha de prueba de toda la máquina', 'Marcha de prueba solo de las herramientas', 'Resetea el contador de pescados', 'Abre los grifos de limpieza'],
        correctIndex: 1,
        explanation: 'Test 13 es la marcha de prueba solo de las herramientas; Test 12 es la de la máquina completa.',
      },
      {
        question: 'Tras elegir tamaño de pescado y clase de corte con el selector 5, ¿qué hay que hacer?',
        options: ['Nada', 'Volver el selector 5 a la posición de clase de pescado', 'Apagar la máquina', 'Repetir el test'],
        correctIndex: 1,
        explanation: 'Después de seleccionar tamaño y clase de corte, el selector 5 debe volverse a la posición de clase de pescado.',
      },
    ],
  },
}

export function listB142ManualSections(): ManualSection[] {
  return data.manual
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

export function listB142Procedures(): Procedure[] {
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
    createdBy: 'b142-seed',
    ...stamp,
  }))
}

export function listB142Flows(): Flow[] {
  return data.flows.map(f => ({ id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, ...stamp }))
}

export function listB142Diagnosis(): DiagnosisEntry[] {
  return data.diagnosis.map(d => ({
    id: d.id,
    title: d.title,
    symptom: d.symptom,
    possibleCauses: d.possibleCauses,
    solution: d.solution,
    ...stamp,
  }))
}

export function getB142ContentCounts() {
  return {
    manual: data.manual.length,
    procedures: data.procedures.length,
    flows: data.flows.length,
    diagnosis: data.diagnosis.length,
  }
}
