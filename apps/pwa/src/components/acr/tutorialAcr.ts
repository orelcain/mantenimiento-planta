/**
 * Guion y reductor del tutorial del ACR narrado por ARIA (guion v2: 11 capítulos, 28 pasos).
 * Datos y lógica pura: sin React ni audio. El motor (MotorTutorialAcr.tsx) y la tarjeta
 * (AcrRapidoSheet.tsx) los usan.
 *
 * El texto de cada paso es el del guion v2 aprobado y es lo que dice Aiko en los audios de
 * public/tutorial-acr (paso-01..paso-27 más paso-07b para «¿Y por qué?», ElevenLabs, 08-11-2026).
 * No cambiar uno sin regrabar el otro.
 */
import type { Acr, AccionAcr, CausaAcr } from '@/services/acr/acr.types'
import type { Repeticion } from '@/services/acr/repeticion'
import tiemposJson from './tiemposTutorialAcr.json'

// ── Opciones de la herramienta ───────────────────────────────────────────────

/**
 * Todo lo que la herramienta del ACR deja hacer. Cada opción tiene que quedar explicada por al menos
 * un paso del guion (`explica`); el test `tutorialAcr.test.ts` falla si alguna queda sin explicar.
 * Si agregas una opción a la herramienta, agrégala aquí y al guion.
 */
export const OPCIONES_ACR = {
  'fila-se-repite': 'Aviso «Se repite» en el evento de Bitácora',
  'fila-opcional': 'Fila «Analizar causa (opcional)» en fallas con detención',
  'fila-ver': 'Fila «Ver análisis de causa · % fuertes»',
  'ver-tutorial': 'Botón «Ver tutorial» e índice de capítulos',
  fotos: 'Fotos del evento como evidencia',
  pieza: 'Interruptor «Pieza dañada guardada»',
  q1: 'Pregunta 1: qué se rompió (viene llena)',
  dictado: 'Dictado con el micrófono',
  q2: 'Pregunta 2: por qué se rompió',
  q3: 'Pregunta 3: qué hacemos para que no vuelva',
  'nivel-fisica': 'Causa física',
  'nivel-humana': 'Causa humana',
  'nivel-latente': 'Causa latente (obligatoria para cerrar)',
  'porques-cadena': '«¿Y por qué?»: cadena de hasta 5 porqués',
  'porques-pantalla': 'Pantalla completa de los 5 porqués',
  proponer: 'Botón «Proponer causas» y «ARIA está pensando…»',
  'propuesta-pct': 'Propuesta de la IA y % de acciones fuertes',
  'fuerza-debil': 'Fuerza débil',
  'fuerza-media': 'Fuerza media',
  'fuerza-fuerte': 'Fuerza fuerte',
  'editar-texto': 'Hoja «Causa/Acción»: corregir el texto',
  'editar-nivel': 'Hoja «Causa»: cambiar el nivel',
  'editar-fuerza': 'Hoja «Acción»: cambiar la fuerza',
  listo: 'Botón «Listo» de la hoja',
  borrar: 'Botón «Borrar» y su confirmación',
  'armar-mano': 'Botón «Armar a mano»',
  'caida-manual': 'Si la IA no responde, pasa sola a armar a mano',
  'manual-nivel': 'Armar a mano: nivel de la causa del porqué',
  'manual-fuerza': 'Armar a mano: fuerza de la acción (sin marcar)',
  autoguardado: 'Autoguardado como borrador',
  motivo: 'Mensaje de lo que falta para cerrar',
  'guardar-arriba': 'Botón «Guardar» de arriba',
  'guardar-cerrar': '«Guardar análisis» y cierre',
  lectura: 'Vista de lectura (evidencia, causas, acciones con «Ataca:»)',
  verificacion: 'Verificación a 60 días',
  'editar-lectura': 'Botón «Editar» de la vista de lectura',
  'revision-semanal': 'Revisión semanal del supervisor, débiles arriba',
  'revision-subir': 'El supervisor sube la fuerza',
  'revision-solo-lectura': 'El técnico solo ve la revisión',
} as const

export type OpcionAcr = keyof typeof OPCIONES_ACR

// ── Guion ────────────────────────────────────────────────────────────────────

/**
 * Acciones automáticas del tutorial: la app hace lo que haría el técnico, siempre sobre la copia de
 * práctica (nada se guarda).
 */
export type AccionTutorial =
  | 'mostrarPropuesta'
  | 'pensar'
  | 'pieza'
  | 'accionDebil'
  | 'accionMedia'
  | 'accionFuerte'
  | 'editarHumana'
  | 'corregirHumana'
  | 'editarAccion'
  | 'cerrarEditor'
  | 'confirmarBorrado'
  | 'cancelarBorrado'
  | 'armarManual'
  | 'nivelLatente'
  | 'fuerzaFuerte'
  | 'mensajeFalta'
  | 'guardar'
  | 'subirFuerza'
  | 'porQueMas'
  | 'abrirPantalla'
  | 'cerrarPantalla'

/** Lo que el tutorial abre encima de la tarjeta durante un paso. */
export type VistaTutorial = 'filas' | 'lectura' | 'revision'

/**
 * Algo que pasa durante un paso. Se ancla a una palabra del audio (`palabra`, normalizada, con su
 * `ocurrencia` y un `desfase` en segundos) o a una fracción del audio (`en`: 0 = al empezar, 1 = al
 * terminar). Cada momento usa una de las dos, no ambas. Los de inicio y cierre van con `en`.
 */
export interface MomentoTutorial {
  /** Fracción del audio (0..1). Solo si el momento no tiene `palabra`. */
  en?: number
  /** Palabra del texto del paso, normalizada con `normalizarPalabra`. */
  palabra?: string
  /** Qué aparición de `palabra` en el audio (1 = la primera). Por defecto 1. */
  ocurrencia?: number
  /** Segundos que se suman al instante de la palabra. Por defecto 0. */
  desfase?: number
  /** Nuevo elemento iluminado. */
  objetivo?: string
  /** Elemento que recibe el pulso de toque. */
  tocar?: string
  accion?: AccionTutorial
}

/** Estado de la práctica que deja un paso al terminar (se acumula; saltar de capítulo lo rearma). */
export interface PracticaTutorial {
  pieza: boolean
  porQue: boolean
  /** La cadena «¿Y por qué?» tiene sus porqués extra (paso «por-que-mas»). */
  porQues: boolean
  queHacemos: boolean
  propuesta: boolean
  humanaCorregida: boolean
  guardado: boolean
}

export interface PasoTutorial {
  id: string
  /** 1..11. */
  capitulo: number
  /** Texto que dice ARIA (y que se muestra como subtítulo). */
  texto: string
  /** Archivo en public/tutorial-acr. */
  audio: string
  /**
   * Elemento que se ilumina al empezar: valor de `data-tutorial`, o un selector CSS si empieza con
   * «[» (p. ej. el micrófono, que no lleva marca propia).
   */
  objetivo: string
  /** Campo de la tarjeta que se escribe letra a letra. */
  escribir?: { campo: 'porQue' | 'queHacemos'; texto: string }
  momentos?: MomentoTutorial[]
  vista?: VistaTutorial
  deja?: Partial<PracticaTutorial>
  /** Opciones de la herramienta que este paso explica. */
  explica: OpcionAcr[]
}

/** Lo que el motor emite como `tutorial-acr:gesto` cada vez que cambia el objetivo o toca algo. */
export interface GestoTutorial {
  indice: number
  pasoId: string
  id: string
  tipo: 'objetivo' | 'tocar'
  /** Segundos del audio en que debía ocurrir (0 al empezar el paso). */
  esperado: number
  /** `audio.currentTime` al ocurrir, o null si habló el respaldo de voz. */
  real: number | null
}

/** Tiempos medidos por archivo de audio (lo genera `apps/pwa/scripts/tiempos-tutorial-acr.py`). */
export type TiemposAudio = Record<string, { bytes: number; duracion: number; palabras: [string, number][] }>
// TS infiere `palabras` como arreglos, no como tuplas: el JSON lo genera el script, así que el cast es seguro.
const tiempos = tiemposJson as unknown as TiemposAudio

/** Misma regla que el script de tiempos: minúsculas, sin tildes, solo a-z0-9. */
export function normalizarPalabra(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

/** Duración en segundos del audio del paso según los tiempos medidos, o null si no está medido. */
export function duracionAudioDe(paso: PasoTutorial): number | null {
  return tiempos[paso.audio]?.duracion ?? null
}

/**
 * Segundo del audio del paso en que ocurre el momento. Con `palabra`: el inicio de su aparición
 * `ocurrencia` (1 = la primera) más el `desfase`; null si el audio no la tiene. Con `en`: `en` por la
 * duración del audio; null si el paso no tiene audio medido. Pura.
 */
export function segundoDeMomento(paso: PasoTutorial, m: MomentoTutorial): number | null {
  const entrada = tiempos[paso.audio]
  if (!entrada) return null
  if (m.palabra === undefined) return m.en === undefined ? null : m.en * entrada.duracion
  const aparecidas = entrada.palabras.filter(([p]) => p === m.palabra)
  const hallada = aparecidas[(m.ocurrencia ?? 1) - 1]
  return hallada ? hallada[1] + (m.desfase ?? 0) : null
}

export const CAPITULOS: readonly string[] = [
  'Dónde aparece el análisis',
  'Evidencia antes de limpiar',
  'Las 3 preguntas y el dictado',
  'Los 3 niveles de causa',
  'Proponer causas con ARIA',
  'La fuerza de cada acción',
  'Corregir y borrar',
  'Armar a mano, sin IA',
  'Guardar: borrador o cerrado',
  'Ver y editar después',
  'Revisión semanal del supervisor',
]

/** El micrófono de la pregunta 2 (SpeechTextarea no lleva `data-tutorial`). */
export const SELECTOR_MICROFONO = '[data-tutorial="t-q2"] button'
/** La confirmación de borrado (ActionSheet). */
export const SELECTOR_CONFIRMAR = '[role="alertdialog"]'

export const TEXTO_Q2 =
  'La chapaleta golpea fuerte al entrar el pescado. En la N3 se puso regulador el 20-09 y no ha cortado'
export const TEXTO_Q3 = 'Poner regulador de aire en N1 y N2, igual que en la N3'
/** Porqués extra que escribe el tutorial en la cadena «¿Y por qué?» (son los porqués 3 y 4). */
export const PORQUES_TUTORIAL = [
  'El cilindro entra con la presión de línea, sin regulador.',
  'En N1 y N2 nunca se instaló; solo en N3 el 20-09.',
]

const p = (n: number) => `paso-${String(n).padStart(2, '0')}.mp3`

export const PASOS_TUTORIAL: readonly PasoTutorial[] = [
  // 1 · Dónde aparece el análisis
  {
    id: 'inicio',
    capitulo: 1,
    texto:
      'Hola, soy ARIA. Te enseño a analizar la causa raíz de una falla. Son once partes cortas. Puedes saltar a cualquiera desde el índice.',
    audio: p(1),
    objetivo: 't-head',
    momentos: [{ palabra: 'indice', tocar: 't-indice', objetivo: 't-indice' }],
    explica: ['ver-tutorial'],
  },
  {
    id: 'entradas',
    capitulo: 1,
    texto:
      'El análisis se abre desde el evento de la Bitácora. Si la falla se repite, te aviso así. Si tuvo detención pero no se repite, verás «Analizar causa, opcional». Y si ya existe uno, dice «Ver análisis» con su porcentaje de acciones fuertes.',
    audio: p(2),
    objetivo: 't-alert',
    vista: 'filas',
    momentos: [{ palabra: 'tuvo', objetivo: 't-filas' }],
    explica: ['fila-se-repite', 'fila-opcional', 'fila-ver'],
  },
  // 2 · Evidencia antes de limpiar
  {
    id: 'fotos',
    capitulo: 2,
    texto:
      'Las fotos que subiste en la Bitácora entran solas al análisis como evidencia. Sácalas antes de limpiar o de cambiar la pieza.',
    audio: p(3),
    objetivo: 't-fotos',
    explica: ['fotos'],
  },
  {
    id: 'pieza',
    capitulo: 2,
    texto:
      'Guarda la pieza dañada, por ejemplo el resorte cortado, y marca este interruptor. La pieza dice mucho más que una foto.',
    audio: p(4),
    objetivo: 't-pieza',
    momentos: [{ palabra: 'interruptor', tocar: 't-pieza', accion: 'pieza' }],
    deja: { pieza: true },
    explica: ['pieza'],
  },
  // 3 · Las 3 preguntas y el dictado
  {
    id: 'pregunta-1',
    capitulo: 3,
    texto:
      'Primera pregunta: qué se rompió. Viene llena con lo que anotaste en la Bitácora. Si quieres, corrígela.',
    audio: p(5),
    objetivo: 't-q1',
    explica: ['q1'],
  },
  {
    id: 'microfono',
    capitulo: 3,
    texto:
      'No hace falta escribir. Toca el micrófono, habla, y vuelve a tocarlo para terminar. Yo paso tu voz a texto.',
    audio: p(6),
    objetivo: 't-q2',
    momentos: [
      { palabra: 'microfono', tocar: SELECTOR_MICROFONO },
      { palabra: 'tocarlo', tocar: SELECTOR_MICROFONO },
    ],
    explica: ['dictado'],
  },
  {
    id: 'pregunta-2',
    capitulo: 3,
    texto: 'Segunda: por qué crees que se rompió. Cuenta lo que viste, aunque no estés seguro.',
    audio: p(7),
    objetivo: 't-q2',
    escribir: { campo: 'porQue', texto: TEXTO_Q2 },
    deja: { porQue: true },
    explica: ['q2'],
  },
  {
    id: 'por-que-mas',
    capitulo: 3,
    texto:
      'Si quieres ir más hondo, toca «¿Y por qué?» y vuelve a preguntar, hasta cinco veces. La última respuesta suele ser la causa latente. En pantalla completa la ves como una escalera.',
    audio: 'paso-07b.mp3',
    objetivo: 't-ypq',
    momentos: [
      { palabra: 'toca', tocar: 't-ypq', accion: 'porQueMas' },
      { palabra: 'preguntar', objetivo: 't-porques' },
      // Se ilumina antes de tocarlo: así el botón queda a la vista cuando llega el pulso.
      { palabra: 'pantalla', desfase: -0.7, objetivo: 't-pantalla' },
      { palabra: 'pantalla', tocar: 't-pantalla', accion: 'abrirPantalla' },
      { palabra: 'pantalla', desfase: 0.5, objetivo: 't-porques-hoja' },
      { en: 0.97, accion: 'cerrarPantalla' },
    ],
    deja: { porQues: true },
    explica: ['porques-cadena', 'porques-pantalla'],
  },
  {
    id: 'pregunta-3',
    capitulo: 3,
    texto:
      'Tercera: qué harías para que no vuelva a pasar. Piensa en algo que cambie la máquina o el método, no solo en tener más cuidado.',
    audio: p(8),
    objetivo: 't-q3',
    escribir: { campo: 'queHacemos', texto: TEXTO_Q3 },
    deja: { queHacemos: true },
    explica: ['q3'],
  },
  // 4 · Los 3 niveles de causa
  {
    id: 'causa-fisica',
    capitulo: 4,
    texto:
      'Toda falla tiene tres niveles. La física es lo que falló en la pieza: el resorte se cortó por fatiga.',
    audio: p(9),
    objetivo: 't-fis',
    momentos: [{ en: 0, accion: 'mostrarPropuesta' }],
    deja: { propuesta: true },
    explica: ['nivel-fisica'],
  },
  {
    id: 'causa-humana',
    capitulo: 4,
    texto:
      'La humana es lo que hizo o no hizo la tarea, sin culpar a nadie: el resorte se cambia sin anotar sus horas.',
    audio: p(10),
    objetivo: 't-hum',
    explica: ['nivel-humana'],
  },
  {
    id: 'causa-latente',
    capitulo: 4,
    texto:
      'La latente es la del sistema, la que hace que la falla vuelva: el golpe de la chapaleta no está amortiguado en N1 y N2. El error humano nunca es la causa raíz. Sin latente, el análisis no se cierra.',
    audio: p(11),
    objetivo: 't-lat',
    explica: ['nivel-latente'],
  },
  // 5 · Proponer causas con ARIA
  {
    id: 'proponer',
    capitulo: 5,
    texto:
      'Con las preguntas 2 y 3 respondidas, toca Proponer causas. Mientras pienso verás «ARIA está pensando».',
    audio: p(12),
    objetivo: 't-prop',
    momentos: [
      { palabra: 'proponer', tocar: 't-prop', accion: 'pensar' },
      { en: 0.95, accion: 'mostrarPropuesta' },
    ],
    explica: ['proponer'],
  },
  {
    id: 'propuesta',
    capitulo: 5,
    texto:
      'Te propongo las causas en sus tres niveles y la acción con su fuerza. Abajo ves qué porcentaje de las acciones es fuerte. Es una propuesta: tú decides.',
    audio: p(13),
    objetivo: 't-propuesta',
    explica: ['propuesta-pct'],
  },
  // 6 · La fuerza de cada acción
  {
    id: 'fuerza-debil',
    capitulo: 6,
    texto:
      'Cada acción tiene una fuerza. Débil: depende de que alguien se acuerde, como capacitar o avisar. Ejemplo: revisar el resorte en cada engrase.',
    audio: p(14),
    objetivo: 't-accion',
    momentos: [{ palabra: 'debil', accion: 'accionDebil' }],
    explica: ['fuerza-debil'],
  },
  {
    id: 'fuerza-media',
    capitulo: 6,
    texto: 'Media: un checklist o una alerta que te lo recuerda. Ejemplo: agregar el resorte a la pauta de engrase.',
    audio: p(15),
    objetivo: 't-accion',
    momentos: [{ palabra: 'media', accion: 'accionMedia' }],
    explica: ['fuerza-media'],
  },
  {
    id: 'fuerza-fuerte',
    capitulo: 6,
    texto:
      'Fuerte: cambia la máquina o elimina la tarea, y ya no depende de nadie. Ejemplo: poner regulador de aire en N1 y N2. Busca siempre la fuerte.',
    audio: p(16),
    objetivo: 't-accion',
    momentos: [{ palabra: 'fuerte', accion: 'accionFuerte' }],
    explica: ['fuerza-fuerte'],
  },
  // 7 · Corregir y borrar
  {
    id: 'corregir',
    capitulo: 7,
    texto: 'Si algo no calza, tócalo. Se abre esta hoja: corriges el texto y, si hace falta, el nivel.',
    audio: p(17),
    objetivo: 't-hum',
    momentos: [
      { palabra: 'tocalo', tocar: 't-hum', accion: 'editarHumana' },
      { palabra: 'hoja', objetivo: 't-editor' },
      { palabra: 'texto', accion: 'corregirHumana' },
      { palabra: 'nivel', objetivo: 't-editor-sel' },
    ],
    deja: { humanaCorregida: true },
    explica: ['editar-texto', 'editar-nivel'],
  },
  {
    id: 'cambiar-fuerza',
    capitulo: 7,
    texto: 'En una acción, aquí puedes cambiar su fuerza. Toca Listo para volver.',
    audio: p(18),
    objetivo: 't-editor-sel',
    momentos: [
      { en: 0, accion: 'editarAccion' },
      { palabra: 'listo', tocar: 't-listo', objetivo: 't-listo' },
      { palabra: 'volver', desfase: 0.6, accion: 'cerrarEditor' },
    ],
    explica: ['editar-fuerza', 'listo'],
  },
  {
    id: 'borrar',
    capitulo: 7,
    texto: 'Si una causa o acción sobra, tócala y luego Borrar. Te pido confirmar, y puedes volver a agregarla después.',
    audio: p(19),
    objetivo: 't-hum',
    momentos: [
      { palabra: 'tocala', tocar: 't-hum', accion: 'editarHumana' },
      { palabra: 'borrar', tocar: 't-borrar', objetivo: 't-borrar' },
      { palabra: 'confirmar', accion: 'confirmarBorrado', objetivo: SELECTOR_CONFIRMAR },
      { en: 0.95, accion: 'cancelarBorrado' },
    ],
    explica: ['borrar'],
  },
  // 8 · Armar a mano, sin IA
  {
    id: 'armar-mano',
    capitulo: 8,
    texto:
      'Sin señal, o si prefieres hacerlo tú, toca Armar a mano. Si yo no respondo, la tarjeta pasa sola a este modo.',
    audio: p(20),
    objetivo: 't-manual',
    momentos: [
      { palabra: 'armar', tocar: 't-manual', accion: 'armarManual' },
      { palabra: 'respondo', objetivo: 't-elige' },
    ],
    explica: ['armar-mano', 'caida-manual'],
  },
  {
    id: 'elige-mano',
    capitulo: 8,
    texto:
      'La pregunta 1 queda como causa física. Para la 2 eliges el nivel, y para la 3 la fuerza. La fuerza no viene marcada: tienes que elegirla.',
    audio: p(21),
    objetivo: 't-elige',
    momentos: [
      { en: 0, accion: 'armarManual' },
      { palabra: 'nivel', tocar: 't-nivel', accion: 'nivelLatente' },
      { palabra: 'fuerza', ocurrencia: 1, tocar: 't-fuerza', accion: 'fuerzaFuerte' },
      { en: 0.97, accion: 'mostrarPropuesta' },
    ],
    explica: ['manual-nivel', 'manual-fuerza'],
  },
  // 9 · Guardar: borrador o cerrado
  {
    id: 'borrador',
    capitulo: 9,
    texto:
      'Lo que escribes se guarda solo, como borrador. Si falta algo, te lo digo aquí abajo. También puedes guardar con el botón de arriba.',
    audio: p(22),
    objetivo: 't-q3',
    momentos: [
      { palabra: 'falta', accion: 'mensajeFalta', objetivo: 't-motivo' },
      { palabra: 'arriba', tocar: 't-guardar-arriba', objetivo: 't-guardar-arriba' },
    ],
    explica: ['autoguardado', 'motivo', 'guardar-arriba'],
  },
  {
    id: 'guardar',
    capitulo: 9,
    texto:
      'Con las tres respuestas, una causa latente y una acción, el análisis queda cerrado y cuenta en el indicador de acciones fuertes de Mantención.',
    audio: p(23),
    objetivo: 't-save',
    momentos: [{ palabra: 'cerrado', tocar: 't-save', accion: 'guardar' }],
    deja: { guardado: true },
    explica: ['guardar-cerrar'],
  },
  // 10 · Ver y editar después
  {
    id: 'lectura',
    capitulo: 10,
    texto:
      'Desde el evento, «Ver análisis» abre este resumen: la evidencia, las causas, cada acción con la causa que ataca, y la verificación. Revisaré que la falla no se repita en sesenta días.',
    audio: p(24),
    objetivo: 't-lectura',
    vista: 'lectura',
    momentos: [{ palabra: 'verificacion', objetivo: 't-verificacion' }],
    explica: ['lectura', 'verificacion'],
  },
  {
    id: 'editar-despues',
    capitulo: 10,
    texto: 'Si aprendes algo nuevo, toca Editar y vuelves a la tarjeta de tres preguntas.',
    audio: p(25),
    objetivo: 't-editar',
    vista: 'lectura',
    momentos: [{ palabra: 'editar', tocar: 't-editar' }],
    explica: ['editar-lectura'],
  },
  // 11 · Revisión semanal del supervisor
  {
    id: 'revision',
    capitulo: 11,
    texto:
      'Una vez por semana, el supervisor abre esta revisión desde el indicador de acciones fuertes. Arriba quedan las acciones débiles.',
    audio: p(26),
    objetivo: 't-revision',
    vista: 'revision',
    explica: ['revision-semanal'],
  },
  {
    id: 'revision-subir',
    capitulo: 11,
    texto:
      'El supervisor sube su fuerza, por ejemplo llevando la revisión a la pauta. El técnico solo la ve. Eso es todo: ahora te toca a ti con una falla real.',
    audio: p(27),
    objetivo: 't-rev-fila',
    vista: 'revision',
    momentos: [{ palabra: 'sube', tocar: 't-rev-fila', accion: 'subirFuerza' }],
    explica: ['revision-subir', 'revision-solo-lectura'],
  },
]

/** Índice del primer paso de cada capítulo (posición 0 = capítulo 1). */
export const INICIO_CAPITULO: readonly number[] = CAPITULOS.map((_, c) =>
  PASOS_TUTORIAL.findIndex((paso) => paso.capitulo === c + 1),
)

const PRACTICA_VACIA: PracticaTutorial = {
  pieza: false,
  porQue: false,
  porQues: false,
  queHacemos: false,
  propuesta: false,
  humanaCorregida: false,
  guardado: false,
}

/**
 * Cómo debe estar la práctica al EMPEZAR el paso `indice`: lo que dejaron los pasos anteriores.
 * Con esto saltar a un capítulo (o seguir tras «Siguiente») no depende de haber visto lo previo.
 */
export function practicaAlEmpezar(indice: number): PracticaTutorial {
  return PASOS_TUTORIAL.slice(0, Math.max(0, indice)).reduce<PracticaTutorial>(
    (acc, paso) => ({ ...acc, ...paso.deja }),
    PRACTICA_VACIA,
  )
}

/** Texto que escribe el tutorial al corregir la causa humana. */
export const CORRECCION_HUMANA = 'Al cambiar el resorte no se guarda el cortado ni se anotan sus horas'

/** Texto de la acción para cada fuerza (capítulo 6). */
export const ACCION_POR_FUERZA: Record<AccionAcr['fuerza'], string> = {
  debil: 'Revisar el resorte en cada engrase',
  media: 'Agregar el resorte a la pauta de engrase',
  fuerte: 'Regulador de aire en N1 y N2: cambia la condición, no depende de nadie',
}

/** Mensaje de ejemplo de lo que falta (capítulo 9). */
export const MOTIVO_EJEMPLO = 'Falta la causa latente.'

/** Repetición de ejemplo, para la práctica en eventos que no se repiten. */
export const REPETICION_TUTORIAL: Repeticion = {
  eventoIds: ['tut-n1', 'tut-n2', 'tut-b200'],
  resumen: 'El resorte de la chapaleta se cortó 3 veces el 24-09-2026 (N1, N2 y Baader 200).',
  minutos: 21,
}

/**
 * Propuesta de ejemplo del tutorial (mockup R1, «Propuesta IA»). Sale de la app, no de la red.
 * Es un ejemplo para validar en terreno.
 */
export const PROPUESTA_TUTORIAL: { causas: CausaAcr[]; acciones: AccionAcr[] } = {
  causas: [
    { id: 'tut-fisica', texto: 'Resorte cortado por fatiga', nivel: 'fisica', m6: null },
    { id: 'tut-humana', texto: 'Se cambia sin registrar horas de uso', nivel: 'humana', m6: null },
    { id: 'tut-latente', texto: 'Golpe de la chapaleta sin amortiguar en N1 y N2', nivel: 'latente', m6: null },
  ],
  acciones: [
    {
      id: 'tut-accion',
      texto: ACCION_POR_FUERZA.fuerte,
      fuerza: 'fuerte',
      causaId: 'tut-latente',
      responsable: '',
      fechaLimite: null,
      estado: 'pendiente',
    },
  ],
}

/**
 * Los ACR de la revisión semanal de práctica: el de la práctica y uno de la semana con una acción
 * débil («Revisar resorte en el engrase»), que el supervisor sube a media en el paso 27.
 */
export function acrsRevisionTutorial(base: Acr, subida: boolean): Acr[] {
  const semana: Acr = {
    ...base,
    id: 'tut-semana-b200',
    equipo: 'BAADER 200',
    definicion: 'Se cortan resortes alimentación 1 y 2, se reutilizan los mismos',
    causas: [{ id: 'tut-sem-c', texto: 'Resorte reutilizado tras cortarse', nivel: 'latente', m6: null }],
    acciones: [
      {
        id: 'tut-sem-a',
        texto: 'Revisar resorte en el engrase',
        fuerza: subida ? 'media' : 'debil',
        causaId: 'tut-sem-c',
        responsable: '',
        fechaLimite: null,
        estado: 'pendiente',
      },
    ],
  }
  return [semana, base]
}

// ── Reductor ─────────────────────────────────────────────────────────────────

/** `hablando` = suena un paso; `pausado` = en pausa; `fin` = terminó; `inactivo` = no corre. */
export type FaseTutorial = 'inactivo' | 'hablando' | 'pausado' | 'fin'

export interface EstadoTutorial {
  fase: FaseTutorial
  /** 0..PASOS_TUTORIAL.length-1. */
  indice: number
}

export type EventoTutorial =
  | { tipo: 'iniciar' }
  | { tipo: 'repetir' }
  | { tipo: 'audioTerminado'; indice: number }
  | { tipo: 'pausar' }
  | { tipo: 'seguir' }
  | { tipo: 'siguiente' }
  | { tipo: 'saltar'; capitulo: number }
  | { tipo: 'cerrar' }

export const ESTADO_INICIAL: EstadoTutorial = { fase: 'inactivo', indice: 0 }

const ULTIMO = PASOS_TUTORIAL.length - 1

function avanzar(e: EstadoTutorial): EstadoTutorial {
  if (e.indice >= ULTIMO) return { fase: 'fin', indice: ULTIMO }
  return { fase: 'hablando', indice: e.indice + 1 }
}

/**
 * Siguiente estado del tutorial. Puro: lo que suena y lo que se toca lo decide el motor a partir
 * de `fase` e `indice`. `audioTerminado` solo cuenta si es del paso en curso (un temporizador
 * viejo no puede saltar al siguiente). El último paso ya es el cierre («Eso es todo…»).
 */
export function siguienteEstado(e: EstadoTutorial, ev: EventoTutorial): EstadoTutorial {
  switch (ev.tipo) {
    case 'iniciar':
    case 'repetir':
      return { fase: 'hablando', indice: 0 }
    case 'pausar':
      return e.fase === 'hablando' ? { ...e, fase: 'pausado' } : e
    case 'seguir':
      return e.fase === 'pausado' ? { ...e, fase: 'hablando' } : e
    case 'siguiente':
      return e.fase === 'inactivo' || e.fase === 'fin' ? e : avanzar(e)
    case 'saltar': {
      const indice = INICIO_CAPITULO[ev.capitulo - 1]
      return indice == null || indice < 0 ? e : { fase: 'hablando', indice }
    }
    case 'audioTerminado':
      return e.fase === 'hablando' && ev.indice === e.indice ? avanzar(e) : e
    case 'cerrar':
      return ESTADO_INICIAL
  }
}

/** URL del audio de un paso. `base` es `import.meta.env.BASE_URL`. */
export function urlAudio(base: string, indice: number): string {
  const paso = PASOS_TUTORIAL[Math.min(Math.max(indice, 0), ULTIMO)]
  return `${base}tutorial-acr/${paso?.audio ?? p(1)}`
}
