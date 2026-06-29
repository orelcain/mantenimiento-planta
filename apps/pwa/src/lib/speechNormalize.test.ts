import { describe, it, expect } from 'vitest'
import { normalizeForSpeech, numToWordsEs, plainForSpeech } from './speechNormalize'

describe('numToWordsEs', () => {
  it('rango común de conteos y minutos', () => {
    expect(numToWordsEs(0)).toBe('cero')
    expect(numToWordsEs(1)).toBe('uno')
    expect(numToWordsEs(11)).toBe('once')
    expect(numToWordsEs(21)).toBe('veintiuno')
    expect(numToWordsEs(100)).toBe('cien')
    expect(numToWordsEs(552)).toBe('quinientos cincuenta y dos')
    expect(numToWordsEs(1000)).toBe('mil')
    expect(numToWordsEs(3656)).toBe('tres mil seiscientos cincuenta y seis')
  })
})

describe('normalizeForSpeech', () => {
  it('género y apócope del 1', () => {
    expect(normalizeForSpeech('Hay 1 incidencia crítica.')).toBe('Hay una incidencia crítica.')
    expect(normalizeForSpeech('Hay 1 equipo en mantenimiento.')).toBe('Hay un equipo en mantenimiento.')
    expect(normalizeForSpeech('Quedan 21 equipos y 31 incidencias.'))
      .toBe('Quedan veintiún equipos y treinta y una incidencias.')
  })
  it('conteos, prioridades y total', () => {
    expect(normalizeForSpeech('552 equipos, 11 incidencias abiertas (1 crítica, 8 medias, 1 baja).'))
      .toBe('quinientos cincuenta y dos equipos, once incidencias abiertas (una crítica, ocho medias, una baja).')
  })
  it('símbolos, unidades y acrónimos', () => {
    expect(normalizeForSpeech('MTTR de 45 min y OEE de 87.3%.'))
      .toBe('eme te te erre de cuarenta y cinco minutos y o e e de ochenta y siete coma tres por ciento.')
  })
  it('tags largos dígito a dígito', () => {
    expect(normalizeForSpeech('Revisa el equipo 720004608.'))
      .toBe('Revisa el equipo siete dos cero cero cero cuatro seis cero ocho.')
  })
})

describe('plainForSpeech', () => {
  const wrench = String.fromCodePoint(0x1F527)   // 🔧
  const vs16 = String.fromCodePoint(0xFE0F)      // selector de variación (invisible)
  const yellow = String.fromCodePoint(0x1F7E1)   // 🟡

  it('quita emojis y el selector de variación huérfano (rompen Chatterbox)', () => {
    expect(plainForSpeech(`${wrench}${vs16} Estado de equipos`)).toBe('Estado de equipos')
    expect(plainForSpeech(`${yellow} Pendiente`)).toBe('Pendiente')
  })
  it('quita tablas markdown y deja la prosa', () => {
    const t = 'Incidencias:\n| Estado | Prioridad |\n|---|---|\n| Pendiente | Media |\nNo hay críticas.'
    expect(plainForSpeech(t)).toBe('Incidencias:. No hay críticas.')
  })
  it('quita markdown inline, links y bloque de sugerencias', () => {
    expect(plainForSpeech('Listo.\n[SUGERENCIAS]: a, b')).toBe('Listo.')
    expect(plainForSpeech('La **bomba** en `mantención`.')).toBe('La bomba en mantención.')
  })
})
