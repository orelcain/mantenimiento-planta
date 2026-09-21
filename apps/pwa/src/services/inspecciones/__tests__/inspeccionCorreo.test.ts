import { describe, expect, it } from 'vitest'
import { inspeccionAHtmlCorreo, inspeccionATextoPlano, type DatosCorreoInspeccion } from '../inspeccionCorreo'
import { PAUTA_POST_ASEO, resumenDeInspeccion, type Inspeccion } from '../modeloInspeccion'
import type { EventoBitacora, TurnoMantencion } from '@/services/bitacora/bitacora.types'

/**
 * El correo tiene que traer lo que el PROCEDIMIENTO exige, no lo que quede bonito:
 * §10 el criterio de liberación, §8 las seis columnas del registro de desviaciones y el
 * resultado final. Estas pruebas son el contrato con el documento.
 */
// `inicio`/`fin` son Date, no texto: el correo saca de ahí el día y el horario.
const turno: TurnoMantencion = {
  id: '2026-09-20_dia',
  fecha: '2026-09-20',
  banda: 'dia',
  inicio: new Date('2026-09-20T08:00:00'),
  fin: new Date('2026-09-20T16:00:00'),
}

const inspeccion = (p: Partial<Inspeccion> = {}): Inspeccion => ({
  id: 'chonchi_2026-09-20_dia',
  plantId: 'chonchi',
  turnoId: turno.id,
  fechaTurno: turno.fecha,
  banda: 'dia',
  pautaId: PAUTA_POST_ASEO.id,
  pautaVersion: 1,
  iniciadaEn: '2026-09-20T09:20:00.000Z',
  iniciadaPorNombre: 'Danilo Cortes',
  resultados: Object.fromEntries(PAUTA_POST_ASEO.criterios.map((c) => [c.id, 'conforme' as const])),
  ...p,
})

const desviacion = (p: Partial<EventoBitacora> = {}): EventoBitacora =>
  ({
    id: 'e1',
    plantId: 'chonchi',
    turnoId: turno.id,
    fechaTurno: turno.fecha,
    banda: 'dia',
    tipo: 'correctivo',
    equipo: 'CINTA LARGA GRADER',
    equipoCodigo: '720004999',
    equipoId: 'n1',
    titulo: 'Fuga de aire en el racor',
    descripcion: 'Racor del cilindro suelto tras el aseo, silbido audible',
    horaInicio: '09:30',
    horaTermino: '10:10',
    impacto: 'no-aplica',
    minutosParada: null,
    ventana: null,
    pendiente: false,
    fotos: [],
    creadoPor: 'u1',
    autorNombre: 'Danilo Cortes',
    registradoPor: 'Jose Chodil',
    inspeccion: { id: 'chonchi_2026-09-20_dia', criterioId: 'neumatico' },
    ...p,
  }) as EventoBitacora

function datos(insp: Inspeccion, ds: EventoBitacora[]): DatosCorreoInspeccion {
  return {
    inspeccion: insp,
    pauta: PAUTA_POST_ASEO,
    resumen: resumenDeInspeccion(
      PAUTA_POST_ASEO,
      insp,
      ds.map((e) => ({
        id: e.id,
        criterioId: e.inspeccion?.criterioId ?? '',
        pendiente: e.pendiente && !e.cierre,
        critica: e.equipo === 'CINTA LARGA GRADER',
        desdeMin: 90,
        hastaMin: e.horaTermino ? 130 : null,
      })),
    ),
    desviaciones: ds,
    turno,
    planta: 'Planta Chonchi',
  }
}

describe('§10 · el criterio de liberación va completo', () => {
  it('trae los 7 puntos de la pauta con su estado', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), []))
    for (const c of PAUTA_POST_ASEO.criterios) expect(html).toContain(c.titulo)
    expect(html).toContain('Criterio de liberación')
    expect(html.match(/>Conforme</g) ?? []).toHaveLength(7)
  })

  it('un punto sin marcar se dice «Sin revisar», no se esconde', () => {
    const insp = inspeccion({ resultados: { mecanico: 'conforme' } })
    expect(inspeccionAHtmlCorreo(datos(insp, []))).toContain('Sin revisar')
  })

  it('la observación de un «conforme» viaja en el correo', () => {
    const insp = inspeccion({ notas: { mecanico: 'Rodillo 3 empieza a sonar' } })
    expect(inspeccionAHtmlCorreo(datos(insp, []))).toContain('Rodillo 3 empieza a sonar')
    expect(inspeccionATextoPlano(datos(insp, []))).toContain('Rodillo 3 empieza a sonar')
  })
})

describe('§8 · el registro de desviaciones trae las seis columnas', () => {
  const d = datos(inspeccion({ resultados: { ...inspeccion().resultados, neumatico: 'no-conforme' } }), [desviacion()])

  it('los encabezados son los que pide el procedimiento', () => {
    const html = inspeccionAHtmlCorreo(d)
    for (const col of ['Equipo o área', 'Anomalía', 'Condición encontrada', 'Acción realizada o pendiente', 'Responsable', 'Estado']) {
      expect(html).toContain(col)
    }
  })

  it('el equipo va con su código SAP y el responsable es quien registró', () => {
    const html = inspeccionAHtmlCorreo(d)
    expect(html).toContain('CINTA LARGA GRADER')
    expect(html).toContain('720004999')
    expect(html).toContain('Jose Chodil')
  })

  it('una desviación cerrada dice «Resuelta»; una abierta, que queda pendiente', () => {
    expect(inspeccionAHtmlCorreo(d)).toContain('Resuelta')
    const abierta = datos(inspeccion(), [desviacion({ pendiente: true, horaTermino: null })])
    expect(inspeccionAHtmlCorreo(abierta)).toContain('queda para el turno siguiente')
  })

  it('sin desviaciones lo dice, en vez de dejar la sección vacía', () => {
    expect(inspeccionAHtmlCorreo(datos(inspeccion(), []))).toContain('Sin desviaciones detectadas')
  })

  it('avisa cuando queda abierta una que detiene una línea', () => {
    const critica = datos(inspeccion(), [desviacion({ pendiente: true, horaTermino: null })])
    expect(inspeccionAHtmlCorreo(critica)).toContain('detiene una línea')
    expect(inspeccionATextoPlano(critica)).toContain('ATENCIÓN')
  })
})

describe('el resultado final', () => {
  it('liberada sale con la frase del procedimiento', () => {
    const insp = inspeccion({ liberacion: { estado: 'conforme', en: '2026-09-20T10:30:00.000Z', porNombre: 'Danilo Cortes' } })
    const html = inspeccionAHtmlCorreo(datos(insp, []))
    expect(html).toContain('PLANTA LIBERADA PARA OPERACIÓN')
    expect(html).toContain('Danilo Cortes')
  })

  it('no liberada sale con la suya', () => {
    const insp = inspeccion({ liberacion: { estado: 'no-liberada', en: '2026-09-20T10:30:00.000Z', porNombre: 'Danilo Cortes' } })
    expect(inspeccionAHtmlCorreo(datos(insp, []))).toContain('PLANTA NO LIBERADA — REQUIERE ACCIÓN CORRECTIVA')
  })

  it('sin liberar no finge que se entregó', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), []))
    expect(html).toContain('todavía no se ha liberado')
    expect(html).not.toContain('PLANTA LIBERADA')
  })
})

describe('cómo pega en Outlook', () => {
  it('todo el estilo va en línea y la estructura en tablas', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [desviacion()]))
    expect(html).toContain('<table')
    expect(html).not.toContain('class=')
    expect(html).not.toContain('<style')
  })

  it('escapa lo que escribe la gente', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [desviacion({ descripcion: 'Fuga <b>grande</b> & ruido' })]))
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>grande</b>')
  })
})
