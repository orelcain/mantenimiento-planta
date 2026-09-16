import { describe, expect, it } from 'vitest'
import type { EventoBitacora, PresenciaBitacora } from '../bitacora.types'
import { aFormulario, borradoresAnteriores, camposACambiar, esBorrador, fusionarFormulario, soloListos, tieneContenido, type CamposFormulario } from '../borradores'
import { desfaseServidor, estadoSincronizacion, haceCuanto, iniciales, otrosEditando, presentesVigentes } from '../presencia'
import { resumirBitacora } from '../resumenBitacora'
import { pendientesAnteriores } from '../entregaTurno'
import { bitacoraAHtmlCorreo } from '../bitacoraCorreo'
import { filasPorTurno, resumirPeriodo } from '../historialBitacora'
import { turnoDesdeId } from '../turnoMantencion'

const ev = (p: Partial<EventoBitacora>): EventoBitacora => ({
  id: p.id ?? 'e1',
  plantId: 'chonchi',
  turnoId: '2026-09-16_tarde',
  fechaTurno: '2026-09-16',
  banda: 'tarde',
  tipo: 'falla',
  equipo: 'KNURO N1',
  descripcion: 'Pusher con golpes irregulares.',
  horaInicio: '17:30',
  horaTermino: null,
  impacto: 'no-aplica',
  minutosParada: null,
  ventana: null,
  pendiente: false,
  fotos: [],
  creadoPor: 'u',
  autorNombre: 'mantencion.plantach',
  registradoPor: 'Danilo Cortes',
  ...p,
})

const form = (p: Partial<CamposFormulario> = {}): CamposFormulario => ({
  ...aFormulario(ev({})),
  ...p,
})

describe('borradores: se ven, pero no cuentan', () => {
  const borrador = ev({ id: 'b', estado: 'borrador', impacto: 'con-parada', minutosParada: 40, pendiente: true })
  const listo = ev({ id: 'l', impacto: 'con-parada', minutosParada: 35 })
  const viejo = ev({ id: 'v', impacto: 'en-ventana', ventana: 'Colación HG' }) // sin campo `estado`

  it('sin campo `estado` es un evento publicado (los de antes siguen contando)', () => {
    expect(esBorrador(viejo)).toBe(false)
    expect(soloListos([borrador, listo, viejo]).map((e) => e.id)).toEqual(['l', 'v'])
  })

  it('el resumen del turno ignora el borrador: ni eventos, ni parada, ni pendiente', () => {
    const r = resumirBitacora([borrador, listo, viejo])
    expect(r.eventos).toBe(2)
    expect(r.minutosParada).toBe(35)
    expect(r.pendientes).toBe(0)
  })

  it('un borrador marcado pendiente NO se entrega al turno siguiente', () => {
    const siguiente = turnoDesdeId('2026-09-17_noche')!
    expect(pendientesAnteriores([borrador], siguiente)).toEqual([])
  })

  it('el correo no lo incluye', () => {
    const html = bitacoraAHtmlCorreo({
      turno: turnoDesdeId('2026-09-16_tarde')!,
      eventos: [ev({ id: 'b', estado: 'borrador', equipo: 'GRADER MS4/12' }), listo],
      tecnicos: [],
      planta: 'Planta Chonchi',
    })
    expect(html).not.toContain('GRADER MS4/12')
    expect(html).toContain('KNURO N1')
  })

  it('el historial tampoco', () => {
    const r = resumirPeriodo([borrador, listo], 'a', 'b')
    expect(r.eventos).toBe(1)
    expect(filasPorTurno([ev({ id: 'solo-borrador', estado: 'borrador', turnoId: '2026-09-15_dia' })])).toEqual([])
  })

  it('abrir y cerrar la hoja sin escribir no deja un borrador vacío', () => {
    expect(tieneContenido({ descripcion: '  ', equipo: '', fotos: [] })).toBe(false)
    expect(tieneContenido({ descripcion: '', equipo: 'KNURO N1', fotos: [] })).toBe(true)
    expect(tieneContenido({ descripcion: '', equipo: '', fotos: [{}] })).toBe(true)
  })
})

describe('borradores que quedaron del turno anterior', () => {
  it('se ven en el turno siguiente, del más reciente al más antiguo; los del turno actual y los publicados no', () => {
    const actual = turnoDesdeId('2026-09-17_noche')!
    const lista = [
      ev({ id: 'viejo', estado: 'borrador', turnoId: '2026-09-16_dia', horaInicio: '09:00' }),
      ev({ id: 'reciente', estado: 'borrador', turnoId: '2026-09-16_tarde', horaInicio: '22:30' }),
      ev({ id: 'de-ahora', estado: 'borrador', turnoId: '2026-09-17_noche' }),
      ev({ id: 'publicado', turnoId: '2026-09-16_tarde' }),
      ev({ id: 'futuro', estado: 'borrador', turnoId: '2026-09-17_dia' }),
      ev({ id: 'roto', estado: 'borrador', turnoId: 'basura' }),
    ]
    expect(borradoresAnteriores(lista, actual).map((e) => e.id)).toEqual(['reciente', 'viejo'])
  })
})

describe('fusión campo por campo al editar entre varios', () => {
  it('adopta lo que cambió el otro si yo no toqué ese campo', () => {
    const base = form({ descripcion: 'Pusher con golpes' })
    const local = form({ descripcion: 'Pusher con golpes', equipo: 'KNURO N1' })
    const remoto = form({ descripcion: 'Pusher con golpes; se revisó el disco de pulsos' })
    const f = fusionarFormulario(base, local, remoto)
    expect(f.valores.descripcion).toBe('Pusher con golpes; se revisó el disco de pulsos')
    expect(f.conflictos).toEqual([])
    expect(f.base.descripcion).toBe(remoto.descripcion)
  })

  it('conserva lo mío si el otro no cambió ese campo', () => {
    const base = form()
    const local = form({ horaTermino: '17:55' })
    const remoto = form({ ventana: 'Colación HG' })
    const f = fusionarFormulario(base, local, remoto)
    expect(f.valores.horaTermino).toBe('17:55')
    expect(f.valores.ventana).toBe('Colación HG')
    expect(f.conflictos).toEqual([])
  })

  it('si los dos cambian distinto el mismo campo: queda lo mío y se avisa', () => {
    const base = form({ descripcion: 'Pusher' })
    const local = form({ descripcion: 'Pusher: disco de pulsos sucio' })
    const remoto = form({ descripcion: 'Pusher: se cambió el sensor B2' })
    const f = fusionarFormulario(base, local, remoto)
    expect(f.valores.descripcion).toBe('Pusher: disco de pulsos sucio')
    expect(f.conflictos).toEqual(['descripcion'])
    // La nueva referencia es lo del otro: el aviso no se repite con el mismo cambio.
    expect(fusionarFormulario(f.base, f.valores, remoto).conflictos).toEqual([])
  })

  it('los dos escribieron lo mismo: no es conflicto', () => {
    const f = fusionarFormulario(form(), form({ pendiente: true }), form({ pendiente: true }))
    expect(f.conflictos).toEqual([])
    expect(f.valores.pendiente).toBe(true)
  })

  it('al adoptar el equipo del otro también se adopta su vínculo con la jerarquía', () => {
    const base = form({ equipo: '', equipoId: null })
    const remoto = form({ equipo: 'EVISCERADORA BAADER 142 N3', equipoId: 'nodo-142-n3' })
    const f = fusionarFormulario(base, base, remoto)
    expect(f.valores.equipoId).toBe('nodo-142-n3')
  })

  it('equipo y su vínculo en conflicto cuentan como un solo aviso', () => {
    const base = form({ equipo: '', equipoId: null })
    const local = form({ equipo: 'KNURO N1', equipoId: 'nodo-knuro' })
    const remoto = form({ equipo: 'GRADER MS4/12', equipoId: 'nodo-grader' })
    expect(fusionarFormulario(base, local, remoto).conflictos).toEqual(['equipo'])
  })

  it('null y texto vacío del servidor no son un cambio', () => {
    const e = ev({ horaTermino: null, ventana: null, minutosParada: null })
    expect(aFormulario(e)).toMatchObject({ horaTermino: '', ventana: '', minutos: '' })
  })
})

describe('solo se escribe lo que cambió (revisión 16-09)', () => {
  it('nada cambiado = nada que escribir', () => {
    expect(camposACambiar(form(), form(), ['Matias Serpa'], ['Matias Serpa'])).toEqual([])
  })

  it('cambiar solo la descripción NO reescribe la hora que cambió otro equipo', () => {
    const cambios = camposACambiar(form(), form({ descripcion: 'Disco de pulsos sucio' }), [], [])
    expect(cambios).toEqual(['descripcion'])
    expect(cambios).not.toContain('horaTermino')
  })

  it('impacto, minutos y ventana van juntos; equipo con su vínculo', () => {
    expect(camposACambiar(form(), form({ minutos: '12' }), [], []).sort()).toEqual(['impacto', 'minutosParada', 'ventana'])
    expect(camposACambiar(form(), form({ equipo: 'GRADER MS4/12' }), [], []).sort()).toEqual(['equipo', 'equipoId'])
  })

  it('los participantes cuentan como cambio', () => {
    expect(camposACambiar(form(), form(), [], ['Leandro Igor'])).toEqual(['participantes'])
  })
})

describe('presencia', () => {
  const p = (x: Partial<PresenciaBitacora>): PresenciaBitacora => ({
    id: x.dispositivoId ?? 'd',
    plantId: 'chonchi',
    turnoId: '2026-09-16_tarde',
    dispositivoId: 'd',
    dispositivo: 'celular',
    nombre: 'Danilo Cortes',
    editandoEventoId: null,
    vistoEnMs: 1_000_000,
    uid: 'u',
    ...x,
  })

  it('cuenta solo los latidos recientes, medidos con la hora del SERVIDOR', () => {
    // El teléfono tiene el reloj 10 min atrasado: el desfase lo corrige.
    const ahoraLocal = 1_000_000 - 600_000
    const desfase = desfaseServidor(1_000_000, ahoraLocal)
    const docs = [
      p({ dispositivoId: 'yo', nombre: 'Matias Serpa', vistoEnMs: 1_000_000 }),
      p({ dispositivoId: 'pc', nombre: 'PC de Mantención', dispositivo: 'pc', vistoEnMs: 1_000_000 - 60_000 }),
      p({ dispositivoId: 'viejo', nombre: 'Leandro Igor', vistoEnMs: 1_000_000 - 3_600_000 }),
    ]
    const v = presentesVigentes(docs, { ahoraLocalMs: ahoraLocal, desfaseMs: desfase, vigenciaMs: 150_000, miDispositivoId: 'yo' })
    expect(v.map((x) => x.dispositivoId)).toEqual(['yo', 'pc'])
  })

  it('mi latido recién escrito (sin hora del servidor) cuenta; el de otro sin hora, no', () => {
    const docs = [p({ dispositivoId: 'yo', vistoEnMs: null }), p({ dispositivoId: 'otro', vistoEnMs: null })]
    const v = presentesVigentes(docs, { ahoraLocalMs: 0, desfaseMs: 0, vigenciaMs: 150_000, miDispositivoId: 'yo' })
    expect(v.map((x) => x.dispositivoId)).toEqual(['yo'])
  })

  it('sabe quién más tiene abierto el mismo evento', () => {
    const presentes = [
      p({ dispositivoId: 'yo', editandoEventoId: 'e1' }),
      p({ dispositivoId: 'b', nombre: 'Matias Serpa', editandoEventoId: 'e1' }),
      p({ dispositivoId: 'c', editandoEventoId: 'e2' }),
    ]
    expect(otrosEditando(presentes, 'e1', 'yo').map((x) => x.nombre)).toEqual(['Matias Serpa'])
  })

  it('iniciales legibles aun con la cuenta compartida', () => {
    expect(iniciales('Danilo Cortes')).toBe('DC')
    expect(iniciales('mantencion.plantach@aquachile.com')).toBe('MP')
    expect(iniciales('Leandro')).toBe('L')
    expect(iniciales('')).toBe('?')
  })

  it('la barra: sin señal manda, luego lo que va en camino', () => {
    expect(estadoSincronizacion({ enLinea: false, cambiosPorSubir: 2, fotosSubiendo: 0 })).toBe('sin-senal')
    expect(estadoSincronizacion({ enLinea: true, cambiosPorSubir: 0, fotosSubiendo: 1 })).toBe('guardando')
    expect(estadoSincronizacion({ enLinea: true, cambiosPorSubir: 0, fotosSubiendo: 0 })).toBe('sincronizado')
  })

  it('«hace cuánto» en palabras', () => {
    expect(haceCuanto(0, 4_000, '17:42')).toBe('hace 4 s')
    expect(haceCuanto(0, 180_000, '17:42')).toBe('hace 3 min')
    expect(haceCuanto(0, 7_200_000, '17:42')).toBe('a las 17:42')
  })
})
