/**
 * Guion y reductor del tutorial del ACR narrado por ARIA (SPEC_ACR_TUTORIAL.md §1 y §2).
 * Datos y lógica pura: sin React ni audio. El motor (TutorialAcr.tsx) los usa.
 *
 * El texto de cada paso es el del mockup aprobado (acr-tutorial.html) y es el mismo que dicen los
 * audios de public/tutorial-acr (paso-1..paso-9). No cambiar uno sin regrabar el otro.
 */
import type { AccionAcr, CausaAcr } from '@/services/acr/acr.types'

/** Acciones automáticas del tutorial: la app hace lo que haría el técnico. */
export type AccionTutorial = 'proponer' | 'corregirHumana' | 'guardar'

export interface PasoTutorial {
  id: string
  /** Texto que dice ARIA (y que se muestra como subtítulo). */
  texto: string
  /** Archivo en public/tutorial-acr. */
  audio: string
  /** Valor de `data-tutorial` del elemento que se ilumina. */
  objetivo: string
  /** Campo de la tarjeta que se escribe letra a letra. */
  escribir?: { campo: 'porQue' | 'queHacemos'; texto: string }
  /** Valor de `data-tutorial` del elemento que recibe el pulso de toque. */
  tocar?: string
  /** Lo que pasa al tocar (la acción real de la tarjeta). */
  accion?: AccionTutorial
}

export const PASOS_TUTORIAL: readonly PasoTutorial[] = [
  {
    id: 'inicio',
    texto: 'Hola, soy ARIA. Te muestro cómo analizar una falla en menos de un minuto.',
    audio: 'paso-1.mp3',
    objetivo: 't-head',
    tocar: 't-head',
  },
  {
    id: 'aviso',
    texto:
      'Cuando una falla se repite, la Bitácora te avisa. Aquí: el resorte de la chapaleta se cortó tres veces el 24 de septiembre.',
    audio: 'paso-2.mp3',
    objetivo: 't-alert',
  },
  {
    id: 'pregunta-1',
    texto: 'La primera pregunta ya viene llena con lo que anotaste en la Bitácora.',
    audio: 'paso-3.mp3',
    objetivo: 't-q1',
  },
  {
    id: 'pregunta-2',
    texto: 'En la segunda, cuenta por qué crees que se rompió. Puedes dictarlo con el micrófono.',
    audio: 'paso-4.mp3',
    objetivo: 't-q2',
    escribir: {
      campo: 'porQue',
      texto: 'La chapaleta golpea fuerte al entrar el pescado. En la N3 se puso regulador el 20-09 y no ha cortado',
    },
  },
  {
    id: 'pregunta-3',
    texto: 'En la tercera, qué harías para que no vuelva a pasar.',
    audio: 'paso-5.mp3',
    objetivo: 't-q3',
    escribir: { campo: 'queHacemos', texto: 'Poner regulador de aire en N1 y N2, igual que en la N3' },
  },
  {
    id: 'proponer',
    texto:
      'Toca Proponer causas. Yo ordeno tu respuesta en causa física, humana y latente, y te digo qué tan fuerte es la acción.',
    audio: 'paso-6.mp3',
    objetivo: 't-prop',
    tocar: 't-prop',
    accion: 'proponer',
  },
  {
    id: 'latente',
    texto:
      'La latente es la importante: es lo que hace que la falla vuelva. Si algo no calza, tócalo y corrígelo.',
    audio: 'paso-7.mp3',
    objetivo: 't-lat',
    tocar: 't-hum',
    accion: 'corregirHumana',
  },
  {
    id: 'guardar',
    texto:
      'Marca si guardaste la pieza dañada y toca Guardar. Listo: el análisis cuenta en el indicador de acciones fuertes.',
    audio: 'paso-8.mp3',
    objetivo: 't-save',
    tocar: 't-pieza',
    accion: 'guardar',
  },
]

/** Cierre: ARIA termina, sin resaltar nada. Es el audio paso-9. */
export const TEXTO_CIERRE =
  'Fin del tutorial. Ahora te toca a ti: abre una falla repetida en la Bitácora.'
export const AUDIO_CIERRE = 'paso-9.mp3'

/** Texto que escribe el tutorial al corregir la causa humana. */
export const CORRECCION_HUMANA = 'Al cambiar el resorte no se guarda el cortado ni se anotan sus horas'

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
      texto: 'Regulador de aire en N1 y N2: cambia la condición, no depende de nadie',
      fuerza: 'fuerte',
      causaId: 'tut-latente',
      responsable: '',
      fechaLimite: null,
      estado: 'pendiente',
    },
  ],
}

// ── Reductor ─────────────────────────────────────────────────────────────────

/** `hablando` = suena un paso; `pausado` = en pausa; `fin` = terminó; `inactivo` = no corre. */
export type FaseTutorial = 'inactivo' | 'hablando' | 'pausado' | 'fin'

export interface EstadoTutorial {
  fase: FaseTutorial
  /** 0..PASOS_TUTORIAL.length-1 = pasos; PASOS_TUTORIAL.length = cierre (paso-9). */
  indice: number
}

export type EventoTutorial =
  | { tipo: 'iniciar' }
  | { tipo: 'repetir' }
  | { tipo: 'audioTerminado'; indice: number }
  | { tipo: 'pausar' }
  | { tipo: 'seguir' }
  | { tipo: 'siguiente' }
  | { tipo: 'cerrar' }

export const ESTADO_INICIAL: EstadoTutorial = { fase: 'inactivo', indice: 0 }

/** Índice del cierre: el paso que sigue al último. */
const INDICE_CIERRE = PASOS_TUTORIAL.length

function avanzar(e: EstadoTutorial): EstadoTutorial {
  if (e.indice >= INDICE_CIERRE) return { fase: 'fin', indice: e.indice }
  return { fase: 'hablando', indice: e.indice + 1 }
}

/**
 * Siguiente estado del tutorial. Puro: lo que suena y lo que se toca lo decide el motor a partir
 * de `fase` e `indice`. `audioTerminado` solo cuenta si es del paso en curso (un temporizador
 * viejo no puede saltar al siguiente).
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
    case 'audioTerminado':
      return e.fase === 'hablando' && ev.indice === e.indice ? avanzar(e) : e
    case 'cerrar':
      return ESTADO_INICIAL
  }
}

/** URL del audio de un paso. `base` es `import.meta.env.BASE_URL`. */
export function urlAudio(base: string, indice: number): string {
  const nombre = indice < PASOS_TUTORIAL.length ? PASOS_TUTORIAL[indice]?.audio : AUDIO_CIERRE
  return `${base}tutorial-acr/${nombre ?? AUDIO_CIERRE}`
}
