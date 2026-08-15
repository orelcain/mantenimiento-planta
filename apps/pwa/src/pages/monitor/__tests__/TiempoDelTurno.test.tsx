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

const texto = (
  tb: PublicMonitorLive['timeBreakdown'],
  proximaParada?: string | null,
  brecha?: number | null,
  cpmAndando?: number | null,
  costo?: Parameters<typeof TiempoDelTurno>[0]['costo'],
) =>
  render(
    <TiempoDelTurno
      tb={tb}
      proximaParada={proximaParada}
      brecha={brecha}
      cpmAndando={cpmAndando}
      costo={costo}
    />,
  ).container.textContent ?? ''

describe('TiempoDelTurno · aviso de la próxima parada de convenio', () => {
  it('⚠ avisa cuándo entra la colación AUNQUE ya hubo paradas planificadas', () => {
    const t = texto(ANTES_DE_LA_COLACION, '12:55')
    expect(t).toMatch(/próxima entra a las/i)
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

  it('el convenio se muestra aparte y con sus minutos', () => {
    // Desde que el bloque explica la brecha, el convenio va en su propia línea
    // —"no se recupera"— y el reparto del tiempo pasó a detalle plegado.
    expect(texto(ANTES_DE_LA_COLACION, null)).toMatch(/Convenio.*no se recupera/)
    expect(texto(ANTES_DE_LA_COLACION, null)).toMatch(/7 min/)
  })

  it('⚠ el convenio NO se convierte a piezas', () => {
    // Contarlo daría "se perdieron 1.550 pz" y es falso: en la colación no se
    // puede producir. Solo las causas recuperables llevan su costo en piezas.
    const t = texto(ANTES_DE_LA_COLACION, null, 1081, 13.5)
    expect(t).toMatch(/Detencion.*365 pz/)      // 27 min x 13,5
    expect(t).not.toMatch(/COLACION.*pz/)
  })

  it('hace la resta: cuánto de la brecha son paradas evitables', () => {
    const t = texto(ANTES_DE_LA_COLACION, null, 1081, 13.5)
    // 36 min recuperables x 13,5 = 486 pz de las 1.081 que faltaron.
    expect(t).toMatch(/486/)
    expect(t).toMatch(/595/)                    // el resto, por ritmo
    expect(t).toMatch(/Por qué no llegamos/i)
  })

  /*
   * ⚠⚠ Lo de abajo es lo que impide sobreestimar. Valorizar cada parada al
   * promedio del turno le imputa a Mantención piezas que no se iban a producir:
   * el 14-08 el promedio daba 719 pz y el ritmo real de cada momento, 662.
   */
  it('⚠ usa el costo por evento, no los minutos por el promedio', () => {
    const t = texto(ANTES_DE_LA_COLACION, null, 1081, 13, {
      // 27 min que al promedio darían 351 pz, pero la línea venía a 9 pz/min.
      porCausa: [{ reason: 'Detencion', min: 27, piezas: 243, eventos: 9, cpm: 9 }],
      totalPiezas: 243,
      totalMin: 27,
      sinLocal: 0,
      eventos: 9,
    })
    expect(t).toMatch(/Detencion.*243 pz/)
    expect(t).not.toMatch(/351/)
    // 243 + los 9 min que todavía no tienen causa (la parada EN CURSO) x 13.
    expect(t).toMatch(/360/)
  })

  it('deja escrito el supuesto: al ritmo de antes, no al promedio', () => {
    const costo = {
      porCausa: [
        { reason: 'Detencion', min: 20, piezas: 180, eventos: 5, cpm: 9 },
        { reason: 'AGUA', min: 7, piezas: 84, eventos: 1, cpm: 12 },
      ],
      totalPiezas: 264, totalMin: 27, sinLocal: 0, eventos: 6,
    }
    const t = texto(ANTES_DE_LA_COLACION, null, 1081, 13.5, costo)
    expect(t).toMatch(/ritmo que la línea traía justo antes/i)
    expect(t).toMatch(/9,0 a 12,0 pz\/min/)      // el rango realmente usado
    expect(t).toMatch(/no al promedio del turno/i)
  })

  it('sin brecha no promete explicar por qué no llegamos', () => {
    const t = texto(ANTES_DE_LA_COLACION, null, 0, 13.5)
    expect(t).toMatch(/A dónde se va el tiempo/i)
    expect(t).not.toMatch(/Por qué no llegamos/i)
  })
})
