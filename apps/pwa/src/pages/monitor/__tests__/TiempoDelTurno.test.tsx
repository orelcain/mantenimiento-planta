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
import { notasPorCausa } from '../notasOperador'
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
    expect(t).toMatch(/Camino a la meta/i)
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

  it('⚠ con TODO sin imputar NO afirma que no hubo falla de máquina', () => {
    /*
     * Este test decía lo contrario, y estaba mal: "Detencion" no está en el
     * árbol, así que nadie sabe qué pasó en esos 27 minutos. La pantalla
     * ponía igual un ✓ verde de "ninguna falla de máquina" — convertía "no
     * sé" en "no fue Mantención", en el link que mira Producción. Visto en
     * vivo el 26-08 a las 04:00 con 2 h 40 min sin imputar.
     */
    const t = texto(ANTES_DE_LA_COLACION, null, 1081, 13.5)
    expect(t).not.toMatch(/Ninguna parada/i)
    expect(t).toMatch(/Sin imputar/i)          // sí dice que no hay dato
  })

  it('con causas anotadas y ninguna de Mantención, SÍ lo afirma — y dice hasta dónde', () => {
    /*
     * El caso que sí es defendible: alguien imputó. «AJUSTE OPERADOR» está en
     * el árbol y es de Producción, no de Mantención. Pero quedan 27 min de
     * "Detencion" sin causa, así que la frase no puede hablar «del turno».
     */
    const t = texto(
      {
        ...ANTES_DE_LA_COLACION,
        // `recoverableMin` acompaña a las causas: es el total de línea y topa la
        // suma de sus `lineMin` (ver el escalado en `agruparEventos`).
        recoverableMin: 39,
        recoverable: [
          { reason: 'Detencion', min: 27, count: 9, lineMin: 27 },
          { reason: 'AJUSTE OPERADOR', min: 12, count: 1, lineMin: 12 },
        ],
      },
      null, 1081, 13.5,
    )
    expect(t).toMatch(/Ninguna parada con causa anotada fue falla de máquina/i)
    expect(t).toMatch(/27 min sin imputar/)
    expect(t).not.toMatch(/en este turno/)
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

  it('meta cumplida: celebra, y las paradas igual muestran su costo', () => {
    // brecha 0 = se llegó justo. El bloque no puede decir «por qué no llegamos»
    // un día que SÍ se llegó (regla de Orel) — y el costo de las paradas se
    // convierte en el argumento: sin ellas, el cierre quedaba más arriba.
    const t = texto(ANTES_DE_LA_COLACION, null, 0, 13.5)
    expect(t).toMatch(/Camino a la meta/i)
    expect(t).toMatch(/Meta cumplida/i)
    expect(t).toMatch(/Las paradas igual costaron/i)
    expect(t).not.toMatch(/que faltaron/i)
  })

  it('meta superada: dice cuánto arriba quedó', () => {
    const r = render(
      <TiempoDelTurno
        tb={ANTES_DE_LA_COLACION}
        cerrado
        meta={5000}
        hechas={5200}
        cpmAndando={13.5}
        grupos={agruparEventos({ tb: ANTES_DE_LA_COLACION, cpmGlobal: 13.5 })}
      />,
    )
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/\+200/)
    expect(t).toMatch(/Meta cumplida/i)
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
    expect(t).toMatch(/Camino a la meta/i)
    expect(t).toMatch(/370/)                    // la brecha contra la cuota de ahora
    expect(t).toMatch(/a esta hora/i)
    expect(t).toMatch(/Por jugar\s*2\.400/)     // meta − cuota: hueco, no pérdida
    expect(t).not.toMatch(/2\.770/)             // la brecha mentirosa contra la meta
    expect(t).toMatch(/tocaban a las 11:00/)
  })

  it('al día con la cuota: positivo, no un «vamos atrás»', () => {
    const t = textoVivo({ meta: 5000, hechas: 2650, cuotaAhora: 2600, cpmAndando: 10 })
    expect(t).toMatch(/Camino a la meta/i)
    expect(t).toMatch(/Al día con la cuota/i)
    expect(t).not.toMatch(/que faltaron/i)
  })

  it('en vivo SIN curva de cuota no hay resta honesta que hacer', () => {
    const t = textoVivo({ meta: 5000, hechas: 2230, cuotaAhora: null, cpmAndando: 10 })
    expect(t).toMatch(/A dónde se va el tiempo/i)
    expect(t).not.toMatch(/vamos atrás/i)
  })

  it('sin ritmo de referencia lo dice, en vez de desaparecer mudo', () => {
    const t = textoVivo({ meta: 5000, hechas: 2230, cuotaAhora: 2600, cpmAndando: null })
    expect(t).toMatch(/Camino a la meta/i)
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
    // Con todo sin imputar no se afirma nada sobre falla de máquina: ver el
    // test «⚠ con TODO sin imputar…» más arriba y `veredictoFallaDeMaquina`.
    expect(t).not.toMatch(/Ninguna parada/i)
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
    expect(t0).toMatch(/Programado.*7 min.*% turno/)
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

  it('«Ritmo» dice QUÉ es la cifra, la cuenta, y qué NO sabe', () => {
    const r = montar()
    fireEvent.click(r.getByRole('button', { name: /^Ritmo/ }))
    const t = r.container.textContent ?? ''
    // 1 · qué es: el resto de la resta, no una medición aparte.
    expect(t).toMatch(/queda de la brecha después de descontar las paradas/i)
    // 2 · la cuenta, con las dos varas.
    expect(t).toMatch(/13,5 pz\/min/)
    expect(t).toMatch(/para la meta necesitaba/i)
    // 3 · ⚠ lo que el dato NO dice: sin esto se lee «el operador bajó la
    //     velocidad», y las causas probables no son esa.
    expect(t).toMatch(/Por qué anduvo más lento, esto no lo dice/i)
    expect(t).toMatch(/aguas arriba/i)
  })

  it('una parte a la vez: abrir «Ritmo» cierra «Hechas»', () => {
    const r = montar()
    fireEvent.click(r.getByRole('button', { name: /^Hechas/ }))
    fireEvent.click(r.getByRole('button', { name: /^Ritmo/ }))
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/queda de la brecha después de descontar las paradas/i)
    expect(t).not.toMatch(/la LÍNEA, que solo se detiene/i)
  })
})

describe('TiempoDelTurno · cada parada se ubica y se salta sola', () => {
  /* Dos episodios reales de la misma causa, con t0 = 07:40 (primer tramo). */
  const T0 = '2026-08-14T07:40:00.000Z'
  const TB: PublicMonitorLive['timeBreakdown'] = {
    ...ANTES_DE_LA_COLACION,
    recoverable: [{ reason: 'FALLA OPERACIONAL', min: 8, count: 2, lineMin: 8 }],
  }
  const EVENTOS = [
    { r: 0, f: '2026-08-14T08:57:00.000Z', s: 330 },   // 08:57 -> 09:02 (5,5 min)
    { r: 0, f: '2026-08-14T10:10:00.000Z', s: 150 },   // 10:10 -> 10:12 (2,5 min)
  ]

  const montar = (onVentana?: (v: { desdeMin: number; hastaMin: number } | null) => void) =>
    render(
      <TiempoDelTurno
        tb={TB}
        cerrado
        meta={5000}
        hechas={3919}
        cpmAndando={13.5}
        onCausa={() => {}}
        onVentana={onVentana}
        grupos={agruparEventos({
          tb: TB, stopEvents: EVENTOS, stopReasons: ['FALLA OPERACIONAL'], cpmGlobal: 13.5, t0: T0,
        })}
      />,
    )

  it('la parada dice DE cuándo A cuándo, no solo su hora de inicio', () => {
    const r = montar(() => {})
    fireEvent.click(r.getByRole('button', { name: /FALLA OPERACIONAL/ }))
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/08:57.*09:02/)
    expect(t).toMatch(/10:10.*10:12/)
  })

  it('tocar UNA parada acerca el gráfico a ESE tramo, con aire a los lados', () => {
    const ventanas: Array<{ desdeMin: number; hastaMin: number } | null> = []
    const r = montar((v) => ventanas.push(v))
    fireEvent.click(r.getByRole('button', { name: /FALLA OPERACIONAL/ }))
    // La de las 08:57 es la más larga: primera de la lista.
    fireEvent.click(r.getAllByTitle('Ver esta parada en el gráfico')[0]!)
    expect(ventanas).toHaveLength(1)
    // 08:57 son 77 min desde t0 (07:40); termina a los 82,5. Con aire de 4,4.
    expect(ventanas[0]!.desdeMin).toBeCloseTo(72.6, 1)
    expect(ventanas[0]!.hastaMin).toBeCloseTo(86.9, 1)
  })

  it('ya no hay «ver en el gráfico» al pie: cada parada salta sola', () => {
    const r = montar(() => {})
    fireEvent.click(r.getByRole('button', { name: /FALLA OPERACIONAL/ }))
    expect(r.container.textContent ?? '').not.toMatch(/ver en el gráfico/i)
  })

  it('sin manera de mover el gráfico, la parada se muestra pero no finge un salto', () => {
    const r = montar(undefined)
    fireEvent.click(r.getByRole('button', { name: /FALLA OPERACIONAL/ }))
    expect(r.container.textContent ?? '').toMatch(/08:57.*09:02/)
    expect(r.queryAllByTitle('Ver esta parada en el gráfico')).toHaveLength(0)
  })
})

describe('TiempoDelTurno · el comentario del operador vive DENTRO de su parada', () => {
  /*
   * ⚠ Lo que se protege acá (pedido de Orel): el comentario colgaba en una
   * lista aparte repitiendo la hora («09:17 · atrapamiento cuchillos») al lado
   * de la parada que ya decía «09:17→09:27». Dos líneas para el mismo evento.
   * Ahora el texto va pegado a SU parada, sin repetir la hora, y las notas que
   * no calzan con ninguna no se tiran: quedan abajo, con su tramo.
   */
  const T0 = '2026-08-13T07:40:00.000Z'
  const TB: PublicMonitorLive['timeBreakdown'] = {
    ...ANTES_DE_LA_COLACION,
    recoverable: [{ reason: 'Baader 200/CUCHILLERIA DORSAL', min: 15, count: 2, lineMin: 15 }],
  }
  const EVENTOS = [
    { r: 0, f: '2026-08-13T09:17:00.000Z', s: 618 },   // 09:17 -> 09:27
    { r: 0, f: '2026-08-13T09:12:00.000Z', s: 168 },   // 09:12 -> 09:14
  ]
  const COMENTARIOS = [
    { r: 'Baader 200/CUCHILLERIA DORSAL', f: '2026-08-13T09:17:00.000Z', h: '2026-08-13T09:27:00.000Z', t: 'atrapamiento cuchillos' },
    // Este no cae en ninguna parada de la lista: no puede perderse.
    { r: 'Baader 200/CUCHILLERIA DORSAL', f: '2026-08-13T14:40:00.000Z', h: '2026-08-13T14:45:00.000Z', t: 'se revisa el eje' },
  ]

  const montar = () => {
    const notas = notasPorCausa(COMENTARIOS, (iso) => iso.slice(11, 16), T0)
    return render(
      <TiempoDelTurno
        tb={TB}
        cerrado
        meta={5000}
        hechas={3919}
        cpmAndando={13.5}
        onCausa={() => {}}
        onVentana={() => {}}
        notas={notas}
        grupos={agruparEventos({
          tb: TB, stopEvents: EVENTOS, stopReasons: ['Baader 200/CUCHILLERIA DORSAL'],
          cpmGlobal: 13.5, t0: T0,
        })}
      />,
    )
  }

  it('el texto va bajo su parada y la hora NO se repite', () => {
    const r = montar()
    fireEvent.click(r.getByRole('button', { name: /CUCHILLERIA DORSAL/ }))
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/09:17:00→09:27:18/)   // rango exacto: la duración cuadra
    expect(t).toMatch(/atrapamiento cuchillos/)
    // La hora aparece UNA vez (en la parada), no otra vez para el comentario.
    expect((t.match(/09:17/g) ?? []).length).toBe(1)
  })

  it('el comentario que no calza con ninguna parada NO se pierde', () => {
    const r = montar()
    fireEvent.click(r.getByRole('button', { name: /CUCHILLERIA DORSAL/ }))
    const t = r.container.textContent ?? ''
    expect(t).toMatch(/se revisa el eje/)
    expect(t).toMatch(/14:40→14:45/)   // con su tramo, para poder ubicarlo
  })

  it('con la causa cerrada se siguen viendo: son la señal de que el piso explicó algo', () => {
    const t = montar().container.textContent ?? ''
    expect(t).toMatch(/atrapamiento cuchillos/)
    expect(t).toMatch(/se revisa el eje/)
  })
})

describe('TiempoDelTurno · la parada tocada se marca SOLA en el gráfico', () => {
  /*
   * ⚠ El problema que cierra (Orel, mirando «Micro Detencion 40×»): tocar una
   * parada seleccionaba su CAUSA, y el gráfico pintaba las 40 bandas — «no se
   * puede medir bien cuál es y su tiempo». Ahora además viaja el TRAMO, que es
   * la banda única que el gráfico marca.
   */
  const T0 = '2026-08-13T07:40:00.000Z'
  const TB: PublicMonitorLive['timeBreakdown'] = {
    ...ANTES_DE_LA_COLACION,
    recoverable: [{ reason: 'Micro Detencion', min: 16, count: 3, lineMin: 16 }],
  }
  const EVENTOS = [
    { r: 0, f: '2026-08-13T08:11:20.000Z', s: 90 },   // 1,5 min
    { r: 0, f: '2026-08-13T08:03:10.000Z', s: 60 },
    { r: 0, f: '2026-08-13T11:59:00.000Z', s: 60 },
  ]

  it('manda el tramo exacto de ESA parada, no solo la causa', () => {
    const tramos: Array<{ desdeMin: number; hastaMin: number } | null> = []
    const causas: Array<string | null> = []
    const r = render(
      <TiempoDelTurno
        tb={TB}
        cerrado
        meta={5000}
        hechas={3919}
        cpmAndando={13.5}
        onCausa={(c) => causas.push(c)}
        onVentana={() => {}}
        onTramo={(t) => tramos.push(t)}
        grupos={agruparEventos({
          tb: TB, stopEvents: EVENTOS, stopReasons: ['Micro Detencion'], cpmGlobal: 13.5, t0: T0,
        })}
      />,
    )
    fireEvent.click(r.getByRole('button', { name: /Micro Detencion/ }))
    fireEvent.click(r.getAllByTitle('Ver esta parada en el gráfico')[0]!)
    expect(causas).toContain('Micro Detencion')
    expect(tramos).toHaveLength(1)
    // 08:11:20 son 31,33 min desde t0 (07:40); dura 1,5.
    expect(tramos[0]!.desdeMin).toBeCloseTo(31.3, 1)
    expect(tramos[0]!.hastaMin).toBeCloseTo(32.8, 1)
  })

  it('se listan TODAS las paradas, no una muestra de 3', () => {
    const r = render(
      <TiempoDelTurno
        tb={TB}
        cerrado
        meta={5000}
        hechas={3919}
        cpmAndando={13.5}
        onCausa={() => {}}
        onVentana={() => {}}
        grupos={agruparEventos({
          tb: TB, stopEvents: EVENTOS, stopReasons: ['Micro Detencion'], cpmGlobal: 13.5, t0: T0,
        })}
      />,
    )
    fireEvent.click(r.getByRole('button', { name: /Micro Detencion/ }))
    expect(r.getAllByTitle('Ver esta parada en el gráfico')).toHaveLength(3)
    expect(r.container.textContent ?? '').not.toMatch(/las 3 más largas/)
  })

  it('el rango CUADRA con la duración: los segundos van escritos', () => {
    const r = render(
      <TiempoDelTurno
        tb={TB}
        cerrado
        meta={5000}
        hechas={3919}
        cpmAndando={13.5}
        onCausa={() => {}}
        onVentana={() => {}}
        grupos={agruparEventos({
          tb: TB, stopEvents: EVENTOS, stopReasons: ['Micro Detencion'], cpmGlobal: 13.5, t0: T0,
        })}
      />,
    )
    fireEvent.click(r.getByRole('button', { name: /Micro Detencion/ }))
    const t = r.container.textContent ?? ''
    // «08:11→08:12 · 1,5 min» era el reloj contradiciendo a la duración.
    expect(t).toMatch(/08:11:20→08:12:50/)
    expect(t).toMatch(/1,5 min/)
  })
})
