import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUDIO_CIERRE,
  ESTADO_INICIAL,
  PASOS_TUTORIAL,
  siguienteEstado,
  urlAudio,
  type EstadoTutorial,
} from '../tutorialAcr'

/** apps/pwa/public/tutorial-acr. Vitest corre desde apps/pwa (como el test de reglas). */
const CARPETA_AUDIO = join(process.cwd(), 'public', 'tutorial-acr') + '/'

describe('guion del tutorial', () => {
  it('tiene 8 pasos, cada uno con un audio que existe en public/tutorial-acr', () => {
    expect(PASOS_TUTORIAL).toHaveLength(8)
    for (const paso of PASOS_TUTORIAL) {
      expect(existsSync(CARPETA_AUDIO + paso.audio), `falta ${paso.audio}`).toBe(true)
    }
  })

  it('el cierre (paso-9) también existe', () => {
    expect(existsSync(CARPETA_AUDIO + AUDIO_CIERRE)).toBe(true)
  })

  it('los objetivos son únicos y los textos no están vacíos', () => {
    const objetivos = PASOS_TUTORIAL.map((p) => p.objetivo)
    expect(new Set(objetivos).size).toBe(objetivos.length)
    for (const paso of PASOS_TUTORIAL) {
      expect(paso.texto.trim()).not.toBe('')
      expect(paso.id.trim()).not.toBe('')
    }
  })

  it('la URL del audio sale del BASE_URL de la app', () => {
    expect(urlAudio('/', 0)).toBe('/tutorial-acr/paso-1.mp3')
    expect(urlAudio('/app/', PASOS_TUTORIAL.length)).toBe(`/app/tutorial-acr/${AUDIO_CIERRE}`)
  })
})

describe('siguienteEstado', () => {
  /** Lleva el reductor hasta el paso `indice` dentro de `hablando`. */
  const enPaso = (indice: number): EstadoTutorial => {
    let e = siguienteEstado(ESTADO_INICIAL, { tipo: 'iniciar' })
    for (let k = 0; k < indice; k++) e = siguienteEstado(e, { tipo: 'audioTerminado', indice: e.indice })
    return e
  }

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

  it('después del último paso suena el cierre y luego queda en fin', () => {
    const ultimo = PASOS_TUTORIAL.length - 1
    const alCierre = siguienteEstado(enPaso(ultimo), { tipo: 'audioTerminado', indice: ultimo })
    expect(alCierre).toEqual({ fase: 'hablando', indice: PASOS_TUTORIAL.length })
    expect(siguienteEstado(alCierre, { tipo: 'audioTerminado', indice: PASOS_TUTORIAL.length })).toEqual({
      fase: 'fin',
      indice: PASOS_TUTORIAL.length,
    })
  })

  it('repetir desde fin vuelve al paso 1; cerrar siempre deja el tutorial inactivo', () => {
    const fin: EstadoTutorial = { fase: 'fin', indice: PASOS_TUTORIAL.length }
    expect(siguienteEstado(fin, { tipo: 'repetir' })).toEqual({ fase: 'hablando', indice: 0 })
    expect(siguienteEstado(enPaso(3), { tipo: 'cerrar' })).toEqual(ESTADO_INICIAL)
  })
})
