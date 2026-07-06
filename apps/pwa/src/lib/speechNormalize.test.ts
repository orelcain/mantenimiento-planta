import { describe, it, expect } from 'vitest'
import { normalizeForSpeech, numToWordsEs, plainForSpeech, splitForTTS } from './speechNormalize'

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
  it('separador de miles es-CL (punto) se lee como número completo', () => {
    expect(normalizeForSpeech('Llevamos 10.280 piezas.'))
      .toBe('Llevamos diez mil doscientos ochenta piezas.')
    expect(normalizeForSpeech('9.500 ciclos.'))
      .toBe('nueve mil quinientos ciclos.')
    expect(normalizeForSpeech('Total 1.234.567 piezas.'))
      .toBe('Total un millón doscientos treinta y cuatro mil quinientos sesenta y siete piezas.')
  })
  it('miles con decimal por coma', () => {
    expect(normalizeForSpeech('Van 10.280,5 kg.'))
      .toBe('Van diez mil doscientos ochenta coma cinco kg.')
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

describe('splitForTTS', () => {
  it('separa por frases (. ! ? …) conservando el cierre', () => {
    expect(splitForTTS('Revisé la bomba principal. Está en condición dos. Conviene cambiar el rodamiento.'))
      .toEqual(['Revisé la bomba principal.', 'Está en condición dos.', 'Conviene cambiar el rodamiento.'])
  })
  it('une fragmentos muy cortos al trozo previo (no corta la prosodia)', () => {
    // "Sí." es <18 chars → se pega a la frase siguiente.
    expect(splitForTTS('Sí. Revisa la bomba 720004607 esta semana.'))
      .toEqual(['Sí. Revisa la bomba 720004607 esta semana.'])
    // Varias frases cortas seguidas se agrupan en un solo trozo.
    expect(splitForTTS('Hola. ¿Cómo vas? Bien!')).toEqual(['Hola. ¿Cómo vas? Bien!'])
  })
  it('parte frases muy largas por comas para que el 1er trozo sea corto', () => {
    const larga = 'En el turno hay cuatro incidencias abiertas, tres de prioridad media y una baja, ' +
      'el OEE fue de setenta por ciento, la disponibilidad noventa y uno por ciento y el MTTR un minuto cuarenta.'
    const out = splitForTTS(larga, 80)
    expect(out.length).toBeGreaterThan(1)
    expect(out.every((s) => s.length <= 100)).toBe(true) // acotado (no exacto: corta en límites de coma)
    expect(out.join(' ')).toContain('cuatro incidencias abiertas')
  })
  it('sin puntuación devuelve el texto entero como único trozo', () => {
    expect(splitForTTS('hola que tal')).toEqual(['hola que tal'])
  })
  it('texto vacío no rompe', () => {
    expect(splitForTTS('')).toEqual([''])
  })
})
