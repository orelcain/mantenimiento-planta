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
import { render, cleanup, fireEvent } from '@testing-library/react'
import { TiempoDelTurno } from '../MonitorShiftParts'
import { agruparEventos } from '@/services/shoplogix/monitorEventos'
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
  proximaParada?: { hora: string; reason: string } | null,
  brecha?: number | null,
  cpmAndando?: number | null,
  costo?: Parameters<typeof TiempoDelTurno>[0]['costo'],
  notasTurno?: string[],
) =>
  render(
    // El caso histórico de estos tests es la AUTOPSIA: turno cerrado, la vara
    // es la meta completa. `brecha` se traduce a meta/hechas para conservar
    // los números que los tests ya verifican.
    <TiempoDelTurno
      tb={tb}
      proximaParada={proximaParada}
      cerrado
      meta={brecha != null ? 3919 + brecha : null}
      hechas={3919}
      cpmAndando={cpmAndando}
      costo={costo}
      // Los grupos se arman con el mismo servicio que en producción: así el
      // test cubre el camino real y no una versión de laboratorio.
      grupos={agruparEventos({ tb, costo, cpmGlobal: cpmAndando })}
      notasTurno={notasTurno}
    />,
  ).container.textContent ?? ''

/** El mismo render pero EN VIVO: la vara es la cuota a esta altura. */
const textoVivo = (args: {
  meta: number
  hechas: number
  cuotaAhora: number | null
  cpmAndando?: number | null
}) =>
  render(
    <TiempoDelTurno
      tb={ANTES_DE_LA_COLACION}
      cerrado={false}
      meta={args.meta}
      hechas={args.hechas}
      cuotaAhora={args.cuotaAhora}
      horaAhora="11:00"
      cpmAndando={args.cpmAndando}
      grupos={agruparEventos({ tb: ANTES_DE_LA_COLACION, cpmGlobal: args.cpmAndando })}
    />,
  ).container.textContent ?? ''

describe('TiempoDelTurno · aviso de la próxima parada de convenio', () => {
  it('⚠ avisa cuándo entra la colación AUNQUE ya hubo paradas planificadas', () => {
    // Y la nombra: «la próxima entra a las 12:55» obligaba a adivinar cuál.
    const t = texto(ANTES_DE_LA_COLACION, { hora: '12:55', reason: 'COLACION' })
    expect(t).toMatch(/La colación entra a las/i)
    expect(t).toContain('~12:55')
  })

  it('con el turno todavía sin ninguna parada de convenio, lo dice así', () => {
    const t = texto({ ...ANTES_DE_LA_COLACION, plannedMin: 0, planned: [] }, { hora: '12:55', reason: 'COLACION' })
    expect(t).toMatch(/Todavía sin paradas de convenio/i)
    expect(t).toContain('~12:55')
  })

  it('sin próxima parada conocida no inventa una línea', () => {
    const t = texto(ANTES_DE_LA_COLACION, null)
    expect(t).not.toMatch(/parada de convenio entra/i)
    expect(t).not.toMatch(/Todavía sin paradas/i)
  })

  it('el convenio se muestra aparte y con sus minutos', () => {
    // El convenio es su propio grupo —"Programado · no se recupera"— con sus
    // causas adentro, y sin piezas.
    expect(texto(ANTES_DE_LA_COLACION, null)).toMatch(/Programado.*no se recupera/)
    expect(texto(ANTES_DE_LA_COLACION, null)).toMatch(/REUNION INICIO TURNO/)
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
    // El supuesto vive bajo la fila «Paradas» del acordeón (mockup v3).
    const r = render(
      <TiempoDelTurno
        tb={ANTES_DE_LA_COLACION}
        cerrado
        meta={5000}
        hechas={3919}
        cpmAndando={13.5}
        costo={costo}
        grupos={agruparEventos({ tb: ANTES_DE_LA_COLACION, costo, cpmGlobal: 13.5 })}
      />,
    )
    // «Paradas» arranca ABIERTA: el supuesto se ve sin tocar nada.
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/ritmo que la línea traía justo antes/i)
    expect(t).toMatch(/9,0 a 12,0 pz\/min/)      // el rango realmente usado
    expect(t).toMatch(/no al promedio del turno/i)
  })

  it('⚠ separa lo que es de Mantención de lo que no', () => {
    // Ninguna de estas causas es falla de máquina: el bloque tiene que poder
    // decirlo, o los 486 pz se leen como si Mantención hubiera fallado.
    const t = texto(ANTES_DE_LA_COLACION, null, 1081, 13.5)
    expect(t).toMatch(/Ninguna parada por falla de máquina/i)
    expect(t).toMatch(/Sin imputar/i)          // "Detencion" no está en el árbol
  })

  it('una falla de máquina apaga la frase y aparece como Mantención', () => {
    const t = texto(
      { ...ANTES_DE_LA_COLACION, recoverable: [{ reason: 'Baader 200/CUCHILLERIA DORSAL', min: 36, count: 2, lineMin: 36 }] },
      null, 1081, 13.5,
    )
    expect(t).toMatch(/Mantención/)
    expect(t).not.toMatch(/Ninguna parada por falla de máquina/i)
  })

  it('⚠ lo anotado para todo el turno ya no se pierde', () => {
    const t = texto(ANTES_DE_LA_COLACION, null, 1081, 13.5, undefined,
      ['«Se abren guías de bronce baader 200» — Baader 200/PERNOS/RESORTES'])
    expect(t).toMatch(/Anotado para todo el turno/i)
    expect(t).toMatch(/guías de bronce/)
  })

  it('sin brecha no promete explicar por qué no llegamos', () => {
    const t = texto(ANTES_DE_LA_COLACION, null, 0, 13.5)
    expect(t).toMatch(/A dónde se va el tiempo/i)
    expect(t).not.toMatch(/Por qué no llegamos/i)
  })
})

describe('TiempoDelTurno · en vivo la vara es la cuota de la hora, no la meta', () => {
  /*
   * ⚠⚠ El bug que esta semántica corrige: a las 11:00 con 2.230 pz hechas y
   * meta 5.000, la resta contra la meta completa daba brecha 2.770 y casi todo
   * caía en «ritmo por debajo del necesario» — piezas que simplemente aún no
   * se jugaban. Contra la cuota de la hora (2.600) la brecha real es 370.
   */
  it('no pinta como ritmo perdido lo que aún no se juega', () => {
    const t = textoVivo({ meta: 5000, hechas: 2230, cuotaAhora: 2600, cpmAndando: 10 })
    expect(t).toMatch(/Por qué vamos atrás/i)
    expect(t).toMatch(/370/)                    // la brecha contra la cuota de ahora
    expect(t).toMatch(/a esta hora/i)
    expect(t).toMatch(/Por jugar\s*2\.400/)     // meta − cuota: hueco, no pérdida
    expect(t).not.toMatch(/2\.770/)             // la brecha mentirosa contra la meta
    expect(t).toMatch(/tocaban a las 11:00/)
  })

  it('al día con la cuota, no fabrica un «vamos atrás»', () => {
    const t = textoVivo({ meta: 5000, hechas: 2650, cuotaAhora: 2600, cpmAndando: 10 })
    expect(t).toMatch(/A dónde se va el tiempo/i)
    expect(t).not.toMatch(/vamos atrás/i)
  })

  it('en vivo SIN curva de cuota no hay resta honesta que hacer', () => {
    const t = textoVivo({ meta: 5000, hechas: 2230, cuotaAhora: null, cpmAndando: 10 })
    expect(t).toMatch(/A dónde se va el tiempo/i)
    expect(t).not.toMatch(/vamos atrás/i)
  })

  it('sin ritmo de referencia lo dice, en vez de desaparecer mudo', () => {
    const t = textoVivo({ meta: 5000, hechas: 2230, cuotaAhora: 2600, cpmAndando: null })
    expect(t).toMatch(/vamos atrás/i)
    expect(t).toMatch(/no se puede repartir/i)
  })
})

describe('TiempoDelTurno · acordeón por parte (una barra, cada parte se abre)', () => {
  const montar = () =>
    render(
      <TiempoDelTurno
        tb={ANTES_DE_LA_COLACION}
        cerrado
        meta={5000}
        hechas={3919}
        cpmAndando={13.5}
        grupos={agruparEventos({ tb: ANTES_DE_LA_COLACION, cpmGlobal: 13.5 })}
      />,
    )

  it('por defecto: «Paradas» abierta con la imputación a la vista; minutos no', () => {
    const t = montar().container.textContent ?? ''
    // El argumento de imputación se ve SIN tocar nada (regla: no esconderlo).
    expect(t).toMatch(/Sin imputar/i)
    expect(t).toMatch(/Ninguna parada por falla de máquina/i)
    // Los minutos esperan bajo «Hechas»; el pliegue viejo no aparece.
    expect(t).not.toMatch(/Produciendo/)
    expect(t).not.toMatch(/ver el reparto del tiempo/i)
  })

  it('la colación pronosticada sigue visible con «Programado» cerrada', () => {
    // La regresión que esto caza: a media mañana CON brecha, plannedMin ya no
    // es 0 (reunión de inicio) y la fila «Programado» arranca cerrada — el
    // aviso de cuándo entra la colación no puede esconderse detrás de un tap.
    const r = render(
      <TiempoDelTurno
        tb={ANTES_DE_LA_COLACION}
        cerrado={false}
        meta={5000}
        hechas={2230}
        cuotaAhora={2600}
        horaAhora="11:00"
        cpmAndando={10}
        proximaParada={{ hora: '12:55', reason: 'COLACION' }}
        grupos={agruparEventos({ tb: ANTES_DE_LA_COLACION, cpmGlobal: 10 })}
      />,
    )
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/La colación entra a las/i)
    expect(t).toContain('~12:55')
  })

  it('lo programado va APARTE de las paradas imputables (regla de Orel)', () => {
    const r = montar()
    const t0 = r.container.textContent ?? ''
    // Con «Paradas» abierta, el convenio NO está adentro…
    expect(t0).not.toMatch(/REUNION INICIO TURNO/)
    expect(t0).toMatch(/Programado · no se recupera.*7 min/)
    // …vive en su propia fila, en minutos.
    fireEvent.click(r.getByRole('button', { name: /^Programado/ }))
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/REUNION INICIO TURNO/)
    expect(t).toMatch(/EJERCICIO {2}COMPENSATORIO/)
  })

  it('los minutos del turno viven bajo «Hechas» — la segunda barra murió', () => {
    const r = montar()
    fireEvent.click(r.getByRole('button', { name: /^Hechas/ }))
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/Produciendo.*4 h 4 min/)   // 244 min
    expect(t).toMatch(/Detenida, recuperable.*36 min/)
    expect(t).toMatch(/la LÍNEA, que solo se detiene/i)
  })

  it('«Ritmo» explica la única cifra que antes no se explicaba', () => {
    const r = montar()
    fireEvent.click(r.getByRole('button', { name: /^Ritmo/ }))
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/Andando, la línea promedió/i)
    expect(t).toMatch(/13,5 pz\/min/)
  })

  it('una parte a la vez: abrir «Ritmo» cierra «Hechas»', () => {
    const r = montar()
    fireEvent.click(r.getByRole('button', { name: /^Hechas/ }))
    fireEvent.click(r.getByRole('button', { name: /^Ritmo/ }))
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/Andando, la línea promedió/i)
    expect(t).not.toMatch(/la LÍNEA, que solo se detiene/i)
  })
})
