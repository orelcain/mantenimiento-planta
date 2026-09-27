import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EventoBitacora, FotoEvento } from '../bitacora.types'
import { turnoDesdeId } from '../turnoMantencion'
import { LIMITE_PIE_FOTO, envioEnDosPasos } from '../compartirWhatsapp'
import { ordenarEventos, resumirBitacora } from '../resumenBitacora'
import { bitacoraAHtmlCorreo, bitacoraATextoPlano, lineaImpacto } from '../bitacoraCorreo'
import { aFormulario, camposACambiar, fusionarFormulario, tieneContenido } from '../borradores'
import {
  claveTipo,
  encabezadoEvento,
  etiquetaTipo,
  horarioEvento,
  limpiarTipo,
  minutosEnTurno,
  resolverTipo,
  tieneHora,
  tiposPropiosUsados,
} from '../presentacionEvento'
import { bitacoraATextoWhatsapp, nombreArchivoLamina, planLaminas, protegerNumeros, referenciaLaminas } from '../bitacoraWhatsapp'
import { cajasFotos, partirLineas, recortarLineas } from '../laminaWhatsapp'

// Las etiquetas cortas muestran el año solo si no es el actual: el reloj de
// estas pruebas queda en 2026 para que no cambien al pasar de año.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-17T12:00:00') })
})
afterAll(() => {
  vi.useRealTimers()
})


const turno = turnoDesdeId('2026-09-16_tarde')!

const foto = (etiqueta: FotoEvento['etiqueta'], n = 1): FotoEvento => ({
  url: `https://x/${etiqueta}${n}.jpg`,
  path: `bitacora/x/${etiqueta}${n}.jpg`,
  etiqueta,
  ancho: 900,
  alto: 1600,
})

const ev = (p: Partial<EventoBitacora>): EventoBitacora => ({
  id: p.id ?? 'e1',
  plantId: 'chonchi',
  turnoId: '2026-09-16_tarde',
  fechaTurno: '2026-09-16',
  banda: 'tarde',
  tipo: 'falla',
  equipo: 'CASINO',
  descripcion: 'Cambio de tubos fluorescentes en equipos de iluminación casino',
  horaInicio: '18:07',
  horaTermino: '18:30',
  impacto: 'no-aplica',
  minutosParada: null,
  ventana: null,
  pendiente: false,
  fotos: [],
  creadoPor: 'u1',
  autorNombre: 'mantencion.plantach',
  registradoPor: 'Mauricio Gallardo',
  ...p,
})

const datos = (eventos: EventoBitacora[]) => ({ turno, eventos, tecnicos: [], planta: 'Planta Chonchi' })

describe('tipos del evento (16-09-2026)', () => {
  it('el tipo escrito a mano se muestra limpio y, si ya existe, queda como el tipo fijo', () => {
    expect(etiquetaTipo(ev({ tipo: 'otro', tipoOtro: '  mejora   continua ' }))).toBe('Mejora continua')
    expect(etiquetaTipo(ev({ tipo: 'otro', tipoOtro: '' }))).toBe('Otro')
    expect(etiquetaTipo(ev({ tipo: 'planificado' }))).toBe('Planificado')
    expect(resolverTipo('otro', 'PREVENTIVO')).toEqual({ tipo: 'preventivo', tipoOtro: null })
    expect(resolverTipo('otro', 'Inspeccion')).toEqual({ tipo: 'inspeccion', tipoOtro: null })
    expect(resolverTipo('otro', 'lubricación')).toEqual({ tipo: 'otro', tipoOtro: 'Lubricación' })
    // Un tipo fijo nunca arrastra texto de «Otro».
    expect(resolverTipo('falla', 'Mejora')).toEqual({ tipo: 'falla', tipoOtro: null })
    expect(limpiarTipo('x'.repeat(60))).toHaveLength(40)
  })

  it('el historial cuenta «Mejora» y «mejora» como uno, y «Otro: preventivo» como Preventivo', () => {
    const r = resumirBitacora([
      ev({ id: 'a', tipo: 'otro', tipoOtro: 'Mejora' }),
      ev({ id: 'b', tipo: 'otro', tipoOtro: 'mejora ' }),
      ev({ id: 'c', tipo: 'otro', tipoOtro: 'preventivo' }),
      ev({ id: 'd', tipo: 'preventivo' }),
      ev({ id: 'e', tipo: 'falla' }),
    ])
    expect(r.porTipo).toEqual({ 'otro:mejora': 2, preventivo: 2, falla: 1 })
    expect(claveTipo(ev({ tipo: 'otro', tipoOtro: 'Méjora' }))).toBe('otro:mejora')
  })

  it('sugiere los tipos propios más usados, sin repetir ni sugerir uno fijo', () => {
    expect(
      tiposPropiosUsados([
        ev({ tipo: 'otro', tipoOtro: 'Lubricación' }),
        ev({ tipo: 'otro', tipoOtro: 'mejora' }),
        ev({ tipo: 'otro', tipoOtro: 'Mejora' }),
        ev({ tipo: 'otro', tipoOtro: 'Falla' }),
        ev({ tipo: 'falla' }),
      ]),
    ).toEqual(['Mejora', 'Lubricación'])
  })

  it('la línea de impacto usa el tipo propio', () => {
    expect(lineaImpacto(ev({ tipo: 'otro', tipoOtro: 'Mejora', impacto: 'en-ventana', ventana: 'Colación empaque' }))).toBe(
      'Mejora · Sin detener: Colación empaque',
    )
  })
})

describe('título y «Sin hora»', () => {
  it('el encabezado junta hora, equipo y título; sin hora parte por el equipo', () => {
    expect(encabezadoEvento(ev({ titulo: 'Cambio de tubos' }))).toBe('18:07 – 18:30 · CASINO · Cambio de tubos')
    expect(encabezadoEvento(ev({ horaInicio: '', horaTermino: null, titulo: '  ' }))).toBe('CASINO')
    expect(horarioEvento(ev({ horaInicio: '', horaTermino: null }))).toBe('')
    expect(tieneHora(ev({ horaInicio: '' }))).toBe(false)
  })

  it('un evento sin hora se ordena según cuándo se registró; sin marca todavía, al final', () => {
    const alas = (h: number, m: number) => ({ toMillis: () => turno.inicio.getTime() + (h * 60 + m) * 60_000 })
    const orden = ordenarEventos(turno, [
      ev({ id: 'tarde', horaInicio: '21:00' }),
      ev({ id: 'sinMarca', horaInicio: '', horaTermino: null, createdAt: null }),
      ev({ id: 'sinHora', horaInicio: '', horaTermino: null, createdAt: alas(3, 0) as never }),
      ev({ id: 'temprano', horaInicio: '16:30' }),
    ])
    expect(orden.map((e) => e.id)).toEqual(['temprano', 'sinHora', 'tarde', 'sinMarca'])
    expect(minutosEnTurno(turno, { horaInicio: '', createdAt: new Date(turno.inicio.getTime() + 90 * 60_000) })).toBe(90)
  })

  it('una parada sin hora ni minutos cuenta como parada sin duración', () => {
    const r = resumirBitacora([ev({ horaInicio: '', horaTermino: null, impacto: 'con-parada' })])
    expect(r.conParada).toBe(1)
    expect(r.paradasSinDuracion).toBe(1)
    expect(r.minutosIntervencion).toBe(0)
  })

  it('el correo y el texto plano no dejan un « · » suelto cuando no hay hora', () => {
    const e = ev({ horaInicio: '', horaTermino: null, titulo: 'Cambio de tubos' })
    // Correo 23-09: el equipo en la cabecera celeste (sin hora: sin celda de hora, dos
    // columnas) y el título abre el desglose.
    const html = bitacoraAHtmlCorreo(datos([e]))
    expect(html).toMatch(/>CASINO<\/b><\/td><\/tr><tr><td colspan="2"[^>]*><div style="[^"]*">Cambio de tubos<\/div>/)
    expect(html).not.toContain('> · ')
    const plano = bitacoraATextoPlano(datos([e]))
    expect(plano).toContain('\nCASINO · Cambio de tubos\n')
    expect(plano).not.toMatch(/^ · /m)
  })

  it('el formulario trata «Sin hora» como un solo cambio de las dos horas', () => {
    const base = aFormulario(ev({}))
    const local = { ...base }
    const remoto = aFormulario(ev({ horaInicio: '', horaTermino: '18:30' }))
    // aFormulario vacía el término de un evento sin hora.
    expect(remoto.horaTermino).toBe('')
    const f = fusionarFormulario(base, local, remoto)
    expect(f.valores.horaInicio).toBe('')
    expect(f.valores.horaTermino).toBe('')
    expect(f.conflictos).toEqual([])
    expect(camposACambiar(base, { ...base, horaInicio: '', horaTermino: '' }, [], [])).toEqual(['horaInicio', 'horaTermino'])
  })

  it('el título y el tipo propio se fusionan campo por campo y se escriben juntos', () => {
    const base = aFormulario(ev({}))
    const f = fusionarFormulario(base, { ...base, titulo: 'Mío' }, { ...base, tipo: 'otro', tipoOtro: 'Mejora' })
    expect(f.valores).toMatchObject({ titulo: 'Mío', tipo: 'otro', tipoOtro: 'Mejora' })
    expect(camposACambiar(base, { ...base, tipoOtro: 'Mejora', tipo: 'otro' }, [], [])).toEqual(['tipo', 'tipoOtro'])
    expect(camposACambiar(base, { ...base, titulo: 'x' }, [], [])).toEqual(['titulo'])
    // Los dos cambiaron el tipo distinto: un solo aviso, no «el tipo, el tipo».
    const c = fusionarFormulario(base, { ...base, tipo: 'otro', tipoOtro: 'A' }, { ...base, tipo: 'otro', tipoOtro: 'B' })
    expect(c.conflictos).toEqual(['tipoOtro'])
    const d = fusionarFormulario(base, { ...base, tipo: 'ajuste', tipoOtro: '' }, { ...base, tipo: 'otro', tipoOtro: 'B' })
    expect(d.conflictos).toEqual(['tipo'])
  })

  it('un borrador con solo título ya tiene contenido', () => {
    expect(tieneContenido({ descripcion: '', equipo: '', titulo: 'Cambio de tubos', fotos: [] })).toBe(true)
  })
})

describe('WhatsApp: mensaje + láminas', () => {
  const casino = ev({ id: 'casino', fotos: [foto('despues'), foto('antes')], participantes: ['Danilo Cortes'] })
  const epack = ev({
    id: 'epack',
    tipo: 'preventivo',
    equipo: 'EMPACADORA E-PACK',
    horaInicio: '20:00',
    horaTermino: '20:20',
    impacto: 'en-ventana',
    ventana: 'Colación empaque',
    descripcion: 'FRL Fishken con problemas',
    fotos: [foto('antes')],
  })
  const sinFotos = ev({ id: 'ronda', equipo: 'Sala de bombas', horaInicio: '17:00', horaTermino: null })

  it('una lámina por evento con fotos, en el orden del turno, con antes y después juntos', () => {
    const plan = planLaminas(datos([epack, sinFotos, casino]))
    expect(plan.map((l) => [l.evento.id, l.numero, l.total])).toEqual([
      ['casino', 1, 2],
      ['epack', 2, 2],
    ])
    expect(plan[0]?.fotos.map((f) => f.etiqueta)).toEqual(['antes', 'despues'])
    expect(plan[0]?.turnoCorto).toBe('Turno tarde 16-09')
  })

  it('más de 4 fotos van en dos láminas; los borradores no van', () => {
    const muchas = ev({ id: 'm', fotos: [1, 2, 3, 4, 5].map((n) => foto('foto', n)) })
    const borrador = ev({ id: 'b', estado: 'borrador', fotos: [foto('antes')] })
    const plan = planLaminas(datos([muchas, borrador]))
    expect(plan.map((l) => [l.parte, l.partes, l.fotos.length])).toEqual([
      [1, 2, 4],
      [2, 2, 1],
    ])
    expect(referenciaLaminas([2, 3])).toBe('láminas 2 y 3')
    expect(referenciaLaminas([1])).toBe('lámina 1')
    expect(bitacoraATextoWhatsapp(datos([muchas, borrador]))).toContain('Fotos: 5 · láminas 1 y 2')
  })

  it('la clave de la lámina cambia si cambia algo que se dibuja', () => {
    const a = planLaminas(datos([casino]))[0]?.clave
    const b = planLaminas(datos([{ ...casino, descripcion: 'Otra cosa' }]))[0]?.clave
    const c = planLaminas(datos([casino]))[0]?.clave
    expect(a).not.toBe(b)
    expect(a).toBe(c)
  })

  it('el mensaje va en secciones, con los eventos numerados y separados (formato A2, 17-09)', () => {
    const texto = bitacoraATextoWhatsapp(datos([epack, sinFotos, casino]))
    expect(texto.startsWith('*BITÁCORA DE MANTENCIÓN*\n*Turno tarde · Miércoles 16-09-2026*\n`16:00–00:00` · Planta Chonchi')).toBe(true)
    expect(texto).toContain('*RESUMEN*\n- 3 eventos\n- 0 min de parada\n- 1 sin detener producción\n- 0 pendientes')
    // Sin paradas no hay MTTR que mostrar.
    expect(texto).not.toContain('MTTR')
    expect(texto).toContain(
      '*2. CASINO* · `18:07–18:30`\n_Falla_\n> Cambio de tubos fluorescentes en equipos de iluminación casino\nTécnicos: Mauricio Gallardo, Danilo Cortes\nFotos: 2 · lámina 1',
    )
    expect(texto).toContain('*3. EMPACADORA E-PACK* · `20:00–20:20`\n_Preventivo · Sin detener: Colación empaque_')
    // Con un solo técnico también se dice quién fue (la cabecera ya no trae «Registrado por»).
    expect(texto).toContain('*1. Sala de bombas* · `17:00`')
    expect(texto).toContain('> Cambio de tubos fluorescentes en equipos de iluminación casino\nTécnicos: Mauricio Gallardo\n\n──────────\n\n*2. CASINO*')
    // Orden del turno: 17:00, 18:07, 20:00.
    expect(texto.indexOf('Sala de bombas')).toBeLessThan(texto.indexOf('CASINO'))
    expect(texto.indexOf('CASINO')).toBeLessThan(texto.indexOf('E-PACK'))
    expect(texto.endsWith('Fotos: 1 · lámina 2')).toBe(true)
  })

  it('pendientes al final tras una divisoria, con la numeración seguida; un * o _ del equipo no rompe la negrita', () => {
    const texto = bitacoraATextoWhatsapp(datos([ev({ id: 'p', equipo: 'BOMBA_1 *A*', pendiente: true }), casino]))
    expect(texto).toContain('Fotos: 2 · lámina 1\n\n──────────\n\n*PENDIENTE PARA EL TURNO SIGUIENTE*\n\n*2. BOMBA‗1 ∗A∗* · `18:07–18:30`')
    expect(texto).toContain('*RESUMEN*\n- 2 eventos\n- 0 min de parada\n- 0 sin detener producción\n- 1 pendiente')
  })

  it('título, N° de equipo, varias líneas y números largos del técnico, sin hora', () => {
    const texto = bitacoraATextoWhatsapp(
      datos([
        ev({
          id: 't',
          equipo: 'EVISCERADORA BAADER 142 N2',
          equipoId: 'n2',
          equipoCodigo: '720004447',
          titulo: 'Reaprete pernos',
          horaInicio: '',
          horaTermino: null,
          descripcion: 'Pernos sueltos\n\nSe cambian: 10000202885 y 3 golillas',
        }),
      ]),
    )
    expect(texto).toContain(
      '*1. EVISCERADORA BAADER 142 N2*\n*Reaprete pernos*\n_Falla_\nN° de equipo `720004447`\n> Pernos sueltos\n> Se cambian: `10000202885` y 3 golillas',
    )
    expect(protegerNumeros('OT 1234567 y 12345678, `99999999` ya va')).toBe('OT 1234567 y `12345678`, `99999999` ya va')
  })

  it('sin eventos lo dice, y el singular sale bien', () => {
    expect(bitacoraATextoWhatsapp(datos([]))).toContain('Sin eventos registrados en el turno.')
    expect(bitacoraATextoWhatsapp(datos([]))).not.toContain('RESUMEN')
    expect(bitacoraATextoWhatsapp(datos([sinFotos]))).toContain('*RESUMEN*\n- 1 evento\n')
  })

  it('la lámina lleva el número del evento en el mensaje', () => {
    const plan = planLaminas(datos([epack, sinFotos, casino]))
    expect(plan.map((l) => [l.evento.id, l.numero, l.numeroEvento])).toEqual([
      ['casino', 1, 2],
      ['epack', 2, 3],
    ])
  })

  it('nombre de archivo de la lámina', () => {
    expect(nombreArchivoLamina(turno, { numero: 3 }, 'png')).toBe('bitacora-2026-09-16-tarde-03.png')
  })
})

describe('lámina: texto y fotos', () => {
  const medir = (t: string) => t.length * 10

  it('parte en líneas por palabras, respeta saltos y corta palabras larguísimas', () => {
    expect(partirLineas(medir, 'uno dos tres cuatro', 80)).toEqual(['uno dos', 'tres', 'cuatro'])
    expect(partirLineas(medir, 'uno\n\ndos', 80)).toEqual(['uno', '', 'dos'])
    expect(partirLineas(medir, 'abcdefghijkl', 50)).toEqual(['abcde', 'fghij', 'kl'])
  })

  it('recorta con «…» solo si sobra texto', () => {
    expect(recortarLineas(medir, ['a', 'b'], 2, 100)).toEqual(['a', 'b'])
    expect(recortarLineas(medir, ['aaaa', 'bbbbbbbbbb', 'c'], 2, 100)).toEqual(['aaaa', 'bbbbbbbbb…'])
  })

  it('reparte 1 a 4 fotos dentro del ancho', () => {
    for (const n of [1, 2, 3, 4]) {
      const { cajas, alto } = cajasFotos(n, 952)
      expect(cajas).toHaveLength(n)
      for (const c of cajas) {
        expect(c.x + c.w).toBeLessThanOrEqual(952 + 0.001)
        expect(c.y + c.h).toBeLessThanOrEqual(alto)
      }
    }
    expect(cajasFotos(4, 952).cajas[3]).toMatchObject({ x: 486, w: 466 })
    expect(cajasFotos(0).alto).toBe(0)
  })
})

describe('compartir por WhatsApp en dos pasos (17-09-2026)', () => {
  it('con láminas y un mensaje más largo que un pie de foto, el mensaje va aparte', () => {
    expect(envioEnDosPasos('x'.repeat(LIMITE_PIE_FOTO), 3)).toBe(false)
    expect(envioEnDosPasos('x'.repeat(LIMITE_PIE_FOTO + 1), 3)).toBe(true)
    // Sin láminas no hay pie de foto que se corte.
    expect(envioEnDosPasos('x'.repeat(5000), 0)).toBe(false)
  })
})
