import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAPITULOS,
  ESTADO_INICIAL,
  INICIO_CAPITULO,
  PASOS_TUTORIAL,
  practicaAlEmpezar,
  siguienteEstado,
  urlAudio,
  type EstadoTutorial,
} from '../tutorialAcr'

/** apps/pwa/public/tutorial-acr. Vitest corre desde apps/pwa (como el test de reglas). */
const CARPETA_AUDIO = join(process.cwd(), 'public', 'tutorial-acr') + '/'

describe('guion del tutorial (v2)', () => {
  it('tiene 28 pasos en 11 capítulos, cada uno con un audio que existe en public/tutorial-acr', () => {
    expect(PASOS_TUTORIAL).toHaveLength(28)
    expect(CAPITULOS).toHaveLength(11)
    for (const paso of PASOS_TUTORIAL) {
      expect(existsSync(CARPETA_AUDIO + paso.audio), `falta ${paso.audio}`).toBe(true)
    }
  })

  it('no sobran audios viejos en la carpeta (paso-1..paso-9 del tutorial anterior)', () => {
    const usados = new Set(PASOS_TUTORIAL.map((p) => p.audio))
    const sobran = readdirSync(CARPETA_AUDIO).filter((f) => f.endsWith('.mp3') && !usados.has(f))
    expect(sobran).toEqual([])
  })

  it('los capítulos van en orden, sin huecos, y cada uno tiene al menos un paso', () => {
    const caps = PASOS_TUTORIAL.map((p) => p.capitulo)
    expect(caps).toEqual([...caps].sort((a, b) => a - b))
    expect(new Set(caps).size).toBe(CAPITULOS.length)
    expect(INICIO_CAPITULO.every((i) => i >= 0)).toBe(true)
  })

  it('ids únicos, textos no vacíos y momentos dentro del audio (0..1)', () => {
    const ids = PASOS_TUTORIAL.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const paso of PASOS_TUTORIAL) {
      expect(paso.texto.trim()).not.toBe('')
      for (const m of paso.momentos ?? []) {
        // Los anclados a una palabra se miden en tutorialSincronia.test.ts.
        if (m.en === undefined) continue
        expect(m.en, `${paso.id}`).toBeGreaterThanOrEqual(0)
        expect(m.en, `${paso.id}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('la URL del audio sale del BASE_URL de la app', () => {
    expect(urlAudio('/', 0)).toBe('/tutorial-acr/paso-01.mp3')
    expect(urlAudio('/app/', 27)).toBe('/app/tutorial-acr/paso-27.mp3')
  })

  it('la práctica al empezar un paso es lo que dejaron los anteriores', () => {
    expect(practicaAlEmpezar(0)).toEqual({
      pieza: false, porQue: false, porQues: false, queHacemos: false, propuesta: false, humanaCorregida: false, guardado: false,
    })
    const idx = (id: string) => PASOS_TUTORIAL.findIndex((p) => p.id === id)
    // En el paso de la pregunta 2 aún no está escrita (la escribe ese paso); en el siguiente, sí.
    expect(practicaAlEmpezar(idx('pregunta-2')).porQue).toBe(false)
    expect(practicaAlEmpezar(idx('pregunta-3')).porQue).toBe(true)
    // «¿Y por qué?» se escribe en el paso por-que-mas: en la pregunta 3 ya están los porqués extra.
    expect(practicaAlEmpezar(idx('pregunta-2')).porQues).toBe(false)
    expect(practicaAlEmpezar(idx('pregunta-3')).porQues).toBe(true)
    // Saltar al capítulo 7 deja la propuesta a la vista y la pieza marcada.
    const c7 = practicaAlEmpezar(INICIO_CAPITULO[6]!)
    expect(c7).toMatchObject({ pieza: true, porQue: true, queHacemos: true, propuesta: true, guardado: false })
    expect(practicaAlEmpezar(idx('lectura')).guardado).toBe(true)
  })
})

describe('siguienteEstado', () => {
  /** Lleva el reductor hasta el paso `indice` dentro de `hablando`. */
  const enPaso = (indice: number): EstadoTutorial => {
    let e = siguienteEstado(ESTADO_INICIAL, { tipo: 'iniciar' })
    for (let k = 0; k < indice; k++) e = siguienteEstado(e, { tipo: 'audioTerminado', indice: e.indice })
    return e
  }
  const ultimo = PASOS_TUTORIAL.length - 1

  it('iniciar arranca en el paso 1 hablando', () => {
    expect(siguienteEstado(ESTADO_INICIAL, { tipo: 'iniciar' })).toEqual({ fase: 'hablando', indice: 0 })
  })

  it('terminar el audio del paso en curso avanza al siguiente', () => {
    expect(siguienteEstado(enPaso(2), { tipo: 'audioTerminado', indice: 2 })).toEqual({ fase: 'hablando', indice: 3 })
  })

  it('un audio terminado de otro paso no avanza (un temporizador viejo no salta pasos)', () => {
    expect(siguienteEstado(enPaso(2), { tipo: 'audioTerminado', indice: 1 })).toEqual({ fase: 'hablando', indice: 2 })
  })

  it('pausar detiene el avance; mientras está pausado el audio terminado no cuenta', () => {
    const pausado = siguienteEstado(enPaso(4), { tipo: 'pausar' })
    expect(pausado.fase).toBe('pausado')
    expect(siguienteEstado(pausado, { tipo: 'audioTerminado', indice: 4 })).toEqual(pausado)
    expect(siguienteEstado(pausado, { tipo: 'seguir' })).toEqual({ fase: 'hablando', indice: 4 })
  })

  it('siguiente salta al paso que sigue, también desde pausa', () => {
    expect(siguienteEstado(enPaso(1), { tipo: 'siguiente' })).toEqual({ fase: 'hablando', indice: 2 })
    const pausado = siguienteEstado(enPaso(1), { tipo: 'pausar' })
    expect(siguienteEstado(pausado, { tipo: 'siguiente' })).toEqual({ fase: 'hablando', indice: 2 })
  })

  it('saltar a un capítulo va a su primer paso y sigue desde ahí, aun en pausa o al final', () => {
    expect(siguienteEstado(enPaso(1), { tipo: 'saltar', capitulo: 7 })).toEqual({
      fase: 'hablando',
      indice: INICIO_CAPITULO[6],
    })
    const fin: EstadoTutorial = { fase: 'fin', indice: ultimo }
    expect(siguienteEstado(fin, { tipo: 'saltar', capitulo: 1 })).toEqual({ fase: 'hablando', indice: 0 })
    expect(siguienteEstado(enPaso(3), { tipo: 'saltar', capitulo: 99 })).toEqual(enPaso(3))
  })

  it('el último paso es el cierre: al terminar su audio queda en fin', () => {
    expect(siguienteEstado(enPaso(ultimo), { tipo: 'audioTerminado', indice: ultimo })).toEqual({
      fase: 'fin',
      indice: ultimo,
    })
  })

  it('repetir desde fin vuelve al paso 1; cerrar siempre deja el tutorial inactivo', () => {
    const fin: EstadoTutorial = { fase: 'fin', indice: ultimo }
    expect(siguienteEstado(fin, { tipo: 'repetir' })).toEqual({ fase: 'hablando', indice: 0 })
    expect(siguienteEstado(enPaso(3), { tipo: 'cerrar' })).toEqual(ESTADO_INICIAL)
  })
})
