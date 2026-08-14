/**
 * El desglose del tiempo del turno, y sobre todo el aviso de la próxima parada
 * de convenio.
 *
 * ⚠⚠ Lo que se protege acá salió de mirar el turno vivo de Filete el 14-08 a
 * las 12:50: el aviso se apagaba en cuanto `plannedMin` dejaba de ser 0, y ese
 * día los primeros 7 minutos planificados eran 2 de reunión de inicio y 5 de
 * ejercicio compensatorio. La colación —los ~55 min que de verdad mueven la
 * cuota— todavía no había ocurrido, y el dato de cuándo entraba ya no estaba
 * en pantalla. La pregunta no es si HUBO alguna parada de convenio: es si
 * falta la próxima.
 *
 * Sin `jest-dom` en este repo: se asierta sobre el texto renderizado.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TiempoDelTurno } from '../MonitorShiftParts'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'

afterEach(cleanup)

/** Caso real: Filete el 14-08 a las 12:50, antes de la colación. */
const ANTES_DE_LA_COLACION: PublicMonitorLive['timeBreakdown'] = {
  windowMin: 287,
  producingMin: 244,
  plannedMin: 7,
  recoverableMin: 36,
  planned: [
    { reason: 'EJERCICIO  COMPENSATORIO', min: 5, count: 1, lineMin: 5 },
    { reason: 'REUNION INICIO TURNO', min: 2, count: 1, lineMin: 2 },
  ],
  recoverable: [{ reason: 'Detencion', min: 27, count: 9, lineMin: 27 }],
}

const texto = (tb: PublicMonitorLive['timeBreakdown'], proximaParada?: string | null) =>
  render(<TiempoDelTurno tb={tb} proximaParada={proximaParada} />).container.textContent ?? ''

describe('TiempoDelTurno · aviso de la próxima parada de convenio', () => {
  it('⚠ avisa cuándo entra la colación AUNQUE ya hubo paradas planificadas', () => {
    const t = texto(ANTES_DE_LA_COLACION, '12:55')
    expect(t).toMatch(/próxima parada de convenio entra a las/i)
    expect(t).toContain('12:55')
  })

  it('con el turno todavía sin ninguna parada de convenio, lo dice así', () => {
    const t = texto({ ...ANTES_DE_LA_COLACION, plannedMin: 0, planned: [] }, '12:55')
    expect(t).toMatch(/Todavía sin paradas de convenio/i)
    expect(t).toContain('12:55')
  })

  it('sin próxima parada conocida no inventa una línea', () => {
    const t = texto(ANTES_DE_LA_COLACION, null)
    expect(t).not.toMatch(/parada de convenio entra/i)
    expect(t).not.toMatch(/Todavía sin paradas/i)
  })

  it('el chip "Planificado" aparece con minutos y desaparece en cero', () => {
    expect(texto(ANTES_DE_LA_COLACION, null)).toMatch(/Planificado\s*7 min/)
    expect(texto({ ...ANTES_DE_LA_COLACION, plannedMin: 0, planned: [] }, null))
      .not.toMatch(/Planificado/)
  })
})
