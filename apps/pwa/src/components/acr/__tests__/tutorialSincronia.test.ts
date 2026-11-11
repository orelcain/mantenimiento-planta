import { statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import tiemposJson from '../tiemposTutorialAcr.json'
import {
  normalizarPalabra,
  PASOS_TUTORIAL,
  segundoDeMomento,
  type PasoTutorial,
  type TiemposAudio,
} from '../tutorialAcr'

const CARPETA_AUDIO = join(process.cwd(), 'public', 'tutorial-acr')
const tiempos = tiemposJson as unknown as TiemposAudio
const AVISO_TIEMPOS = 'corre apps/pwa/scripts/tiempos-tutorial-acr.py'

/** Palabras normalizadas del texto que dice ARIA en el paso. */
const palabrasDelTexto = (paso: PasoTutorial): string[] =>
  paso.texto.split(/\s+/).map(normalizarPalabra).filter((p) => p !== '')

describe('sincronía del tutorial con el audio', () => {
  it('cada paso.audio está en el JSON de tiempos', () => {
    for (const paso of PASOS_TUTORIAL) {
      expect(tiempos[paso.audio], paso.audio).toBeDefined()
    }
  })

  it('bytes del JSON = tamaño real de cada audio en public/tutorial-acr', () => {
    const audios = new Set(PASOS_TUTORIAL.map((p) => p.audio))
    for (const audio of audios) {
      const real = statSync(join(CARPETA_AUDIO, audio)).size
      expect(real, `${audio} cambió: ${AVISO_TIEMPOS}`).toBe(tiempos[audio]!.bytes)
    }
  })

  it('cada momento con palabra: la palabra está en el texto del paso y su ocurrencia existe en el audio', () => {
    for (const paso of PASOS_TUTORIAL) {
      for (const m of paso.momentos ?? []) {
        if (m.palabra === undefined) continue
        const rotulo = `${paso.id} «${m.palabra}»`
        expect(palabrasDelTexto(paso), rotulo).toContain(m.palabra)
        const apariciones = tiempos[paso.audio]!.palabras.filter(([p]) => p === m.palabra).length
        expect(apariciones, rotulo).toBeGreaterThanOrEqual(m.ocurrencia ?? 1)
      }
    }
  })

  it('segundoDeMomento cae dentro de [0, duracion] del audio del paso', () => {
    for (const paso of PASOS_TUTORIAL) {
      const duracion = tiempos[paso.audio]!.duracion
      for (const m of paso.momentos ?? []) {
        const segundo = segundoDeMomento(paso, m)
        const rotulo = `${paso.id} ${m.palabra ?? `en ${m.en}`}`
        expect(segundo, rotulo).not.toBeNull()
        expect(segundo, rotulo).toBeGreaterThanOrEqual(0)
        expect(segundo, rotulo).toBeLessThanOrEqual(duracion)
      }
    }
  })

  it('ningún momento usa en entre 0,05 y 0,9 (los gestos a mitad de frase van anclados a una palabra)', () => {
    for (const paso of PASOS_TUTORIAL) {
      for (const m of paso.momentos ?? []) {
        if (m.en === undefined) continue
        expect(m.en < 0.05 || m.en > 0.9, `${paso.id} en ${m.en}`).toBe(true)
      }
    }
  })

  it('los momentos de cada paso van en orden creciente de tiempo', () => {
    for (const paso of PASOS_TUTORIAL) {
      let anterior = -Infinity
      for (const m of paso.momentos ?? []) {
        const segundo = segundoDeMomento(paso, m)!
        expect(segundo, `${paso.id}`).toBeGreaterThan(anterior)
        anterior = segundo
      }
    }
  })

  it('normalizarPalabra quita tildes, signos y mayúsculas', () => {
    expect(normalizarPalabra('Índice')).toBe('indice')
    expect(normalizarPalabra('«¿Y')).toBe('y')
  })
})
