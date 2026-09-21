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

describe('las fotos de la desviación viajan en el correo', () => {
  const conFotos = () =>
    desviacion({
      fotos: [
        { url: 'https://x/despues.jpg', path: 'p/2', etiqueta: 'despues', ancho: 1200, alto: 900 },
        { url: 'https://x/antes.jpg', path: 'p/1', etiqueta: 'antes', ancho: 1200, alto: 900 },
      ],
    })

  it('van como <img> con width y height: sin ellos Outlook las pega a 1920 px', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [conFotos()]))
    expect(html).toContain('https://x/antes.jpg')
    expect(html).toContain('https://x/despues.jpg')
    expect(html).toMatch(/<img[^>]+width="\d+"[^>]+height="\d+"/)
  })

  it('«antes» va primero: es la comparación que se quiere ver', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [conFotos()]))
    expect(html.indexOf('antes.jpg')).toBeLessThan(html.indexOf('despues.jpg'))
  })

  it('la variante incrustada reemplaza la URL por el base64', () => {
    const html = inspeccionAHtmlCorreo({
      ...datos(inspeccion(), [conFotos()]),
      fuenteFoto: (f) => (f.etiqueta === 'antes' ? 'data:image/jpeg;base64,AAA' : f.url),
    })
    expect(html).toContain('data:image/jpeg;base64,AAA')
    expect(html).not.toContain('https://x/antes.jpg')
  })

  it('el texto plano dice cuántas fotos hay, ya que no puede mostrarlas', () => {
    expect(inspeccionATextoPlano(datos(inspeccion(), [conFotos()]))).toContain('2 fotos')
  })

  it('sin fotos no deja una fila vacía en la tabla', () => {
    expect(inspeccionAHtmlCorreo(datos(inspeccion(), [desviacion()]))).not.toContain('colspan="6"')
  })
})

describe('el correo ya no se contradice', () => {
  it('«corregido» sale como tal, no como no conforme', () => {
    const insp = inspeccion({
      resultados: { ...inspeccion().resultados, mecanico: 'corregido' },
      notas: { mecanico: 'Cinta azul rozaba con la estructura, se corrige' },
    })
    const html = inspeccionAHtmlCorreo(datos(insp, []))
    expect(html).toContain('>Corregido<')
    expect(html).toContain('Cinta azul rozaba con la estructura, se corrige')
    expect(html).not.toContain('>No conforme<')
  })

  it('un «no conforme» SIN desviación lo dice, en vez de afirmar que no hubo ninguna', () => {
    const insp = inspeccion({ resultados: { ...inspeccion().resultados, mecanico: 'no-conforme' } })
    const html = inspeccionAHtmlCorreo(datos(insp, []))
    expect(html).toContain('sin una desviación anotada')
    expect(html).not.toContain('Sin desviaciones detectadas')
  })

  it('sin nada que reportar sigue diciendo que no hubo desviaciones', () => {
    expect(inspeccionAHtmlCorreo(datos(inspeccion(), []))).toContain('Sin desviaciones detectadas')
  })
})
