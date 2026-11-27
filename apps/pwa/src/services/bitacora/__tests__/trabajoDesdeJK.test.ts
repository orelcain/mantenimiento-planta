import { describe, it, expect } from 'vitest'
import fixture from '../../shoplogix/__tests__/fixtures/jk-chonchi-expulsador.json'
import { prepararTurnos, type ResumenJK, type TurnoCrudo } from '../../shoplogix/jackKnife'
import { buscarComponente, cambiosSinAviso } from '../../shoplogix/buscadorComponente'
import { trabajoDesdeJK, turnoBitacoraDesde, horaUTC, jkClave } from '../trabajoDesdeJK'
import type { EventoBitacora } from '../bitacora.types'

const crudos: TurnoCrudo[] = (fixture as { id: string; jackKnife: ResumenJK }[]).map((t) => {
  const [dateKey, shiftId] = t.id.split('_')
  return { id: t.id, dateKey: dateKey!, shiftId: shiftId!, jackKnife: t.jackKnife }
})
const { turnos } = prepararTurnos(crudos)

/** Ms de planta guardados como UTC (la convención del Jack-Knife). */
const ms = (y: number, m: number, d: number, h: number, mi: number) => Date.UTC(y, m - 1, d, h, mi)

describe('turnoBitacoraDesde · hora de planta en getters UTC', () => {
  it('21:15 cae en la banda tarde del día calendario del inicio', () => {
    expect(turnoBitacoraDesde(ms(2026, 11, 25, 21, 15))).toEqual({
      turnoId: '2026-11-25_tarde',
      fechaTurno: '2026-11-25',
      banda: 'tarde',
    })
  })
  it('00:30 es noche del MISMO día calendario, no del anterior', () => {
    expect(turnoBitacoraDesde(ms(2026, 11, 26, 0, 30))).toEqual({
      turnoId: '2026-11-26_noche',
      fechaTurno: '2026-11-26',
      banda: 'noche',
    })
  })
  it('horaUTC no depende de la zona del navegador', () => {
    expect(horaUTC(ms(2026, 11, 25, 21, 15))).toBe('21:15')
  })
})

describe('trabajoDesdeJK · documento de la Bitácora', () => {
  const base = {
    turnoJkId: '2026-11-25_Turno 1',
    inicioMs: ms(2026, 11, 25, 21, 15),
    min: 123.6,
    equipo: 'Knuro',
    componente: 'expulsador',
    descripcion: 'Cilindro quebrado, expulsador',
    repuestos: [{ codigoSAP: '3300138398', nombre: 'Cilindro Pusher', cantidad: 1 }],
    avisoSap: '',
    registradoPor: 'Técnico Prueba',
    uid: 'uid-prueba',
    autorNombre: 'Cuenta compartida',
    dispositivo: 'pc' as const,
  }

  it('trae todos los obligatorios de un evento publicado, con null y nunca undefined', () => {
    const d = trabajoDesdeJK(base)
    expect(d.estado).toBe('listo')
    expect(d.tipo).toBe('correctivo')
    expect(d.impacto).toBe('con-parada')
    expect(d.minutosParada).toBe(124)
    expect(d.horaInicio).toBe('21:15')
    expect(d.horaTermino).toBe('23:19')
    expect(d.avisoSap).toBeNull()
    expect(d.jkClave).toBe(jkClave('chonchi', '2026-11-25_Turno 1', ms(2026, 11, 25, 21, 15)))
    for (const v of Object.values(d)) expect(v).not.toBeUndefined()
  })

  it('un trabajo registrado aparece en SU fila del Jack-Knife (la clave jk, no el turno de Bitácora)', () => {
    const t = turnos.find((x) => x.dateKey === '2026-11-23')
    expect(t).toBeDefined()
    const [, inicioMs] = t!.resumen.eventos.find(([c]) => c === 'Knuro')!
    const doc = trabajoDesdeJK({ ...base, turnoJkId: t!.id, inicioMs })
    const trabajo = { id: 'tb-1', ...doc } as EventoBitacora
    const r = buscarComponente(turnos, [trabajo], 'expulsador')
    const fila = r.filas.find((f) => f.turnoId === t!.id)
    expect(fila?.trabajos.map((w) => w.id)).toEqual(['tb-1'])
  })

  it('un trabajo con N° de aviso sale de «sin aviso SAP»; sin aviso, sí sale', () => {
    const t = turnos.find((x) => x.dateKey === '2026-11-23')!
    const [, inicioMs] = t.resumen.eventos.find(([c]) => c === 'Knuro')!
    const sinAviso = { id: 'a', ...trabajoDesdeJK({ ...base, turnoJkId: t.id, inicioMs, avisoSap: '' }) } as EventoBitacora
    const conAviso = { id: 'b', ...trabajoDesdeJK({ ...base, turnoJkId: t.id, inicioMs, avisoSap: '4500123456' }) } as EventoBitacora
    expect(cambiosSinAviso(turnos, [sinAviso]).some((c) => c.trabajoId === 'a')).toBe(true)
    expect(cambiosSinAviso(turnos, [conAviso]).some((c) => c.trabajoId === 'b')).toBe(false)
  })
})
